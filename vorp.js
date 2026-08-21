(() => {
  'use strict';

  const VERSION = '1.3.2';
  const LINEUP_KEY = 'ffm-roster-lineup';
  const ROSTER_KEY = 'ffm-fast-my-roster';
  const DEFAULT_LINEUP = Object.freeze({ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 });
  const POSITIONS = ['QB', 'RB', 'WR', 'TE'];
  const FLEX_POSITIONS = ['RB', 'WR', 'TE'];

  function safeJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function normalizeLineup(value) {
    const source = value && typeof value === 'object' ? value : {};
    const clean = {};
    for (const [pos, fallback] of Object.entries(DEFAULT_LINEUP)) {
      const n = Number(source[pos]);
      clean[pos] = Number.isFinite(n) ? Math.max(0, Math.min(4, Math.round(n))) : fallback;
    }
    return Object.values(clean).some(Boolean) ? clean : { ...DEFAULT_LINEUP };
  }

  function onReady() {
    if (typeof state === 'undefined' || typeof matrixScore !== 'function' || typeof renderAll !== 'function') return;

    const style = document.createElement('style');
    style.textContent = `
      .vorp-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:9px}
      .vorp-metric{border:1px solid var(--line);background:#09130e;border-radius:11px;padding:8px 9px;min-width:0}
      .vorp-metric b{display:block;color:var(--accent);font-size:14px;line-height:1.1}.vorp-metric span{display:block;color:var(--muted);font-size:8px;font-weight:850;letter-spacing:.07em;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .vorp-note{display:block;margin-top:6px;color:var(--accent)}
      .vorp-row-tag{display:inline-flex;align-items:center;border:1px solid #315742;background:#0a1710;color:var(--accent);border-radius:999px;padding:2px 6px;margin-left:5px;font-size:8px;font-weight:900;white-space:nowrap}
      .vorp-row-tag.wait{border-color:#6d5a2e;color:var(--warn);background:rgba(255,198,92,.05)}
      @media(max-width:560px){.vorp-strip{grid-template-columns:repeat(3,minmax(82px,1fr));overflow-x:auto}.vorp-metric{padding:7px}.vorp-metric b{font-size:13px}}
    `;
    document.head.appendChild(style);

    document.querySelectorAll('.brand small').forEach(el => {
      el.textContent = el.textContent.replace(/v\d+\.\d+\.\d+/, `v${VERSION}`);
    });
    const footer = document.querySelector('footer');
    if (footer) footer.innerHTML = footer.innerHTML.replace(/v\d+\.\d+\.\d+/, `v${VERSION}`);

    let snapshotSignature = '';
    let snapshot = null;
    let evaluationCache = new Map();

    function draftedSignature() {
      return [...state.drafted].sort().join(',');
    }

    function playerQuality(player) {
      if (!player) return 0;
      const m = player.metrics || {};
      let quality =
        Number(m.production || 0) * 0.34 +
        Number(m.opportunity || 0) * 0.22 +
        Number(m.consistency || 0) * 0.14 +
        Number(m.ceiling || 0) * 0.15 +
        Number(m.trend || 0) * 0.09 +
        Number(m.availability || 0) * 0.06;
      if (player.rookie && Number(player.games || 0) === 0) quality = Math.max(quality, Number(player.draftBase || 0));
      if (player.status && player.status !== 'ACT') quality -= player.status === 'PUP' ? 6 : 3;
      return clamp(quality);
    }

    function flexShares(groups, teams) {
      const strength = {};
      for (const pos of FLEX_POSITIONS) {
        const group = groups[pos] || [];
        const sample = group.slice(0, Math.max(1, teams));
        const avg = sample.length ? sample.reduce((sum, p) => sum + playerQuality(p), 0) / sample.length : 0;
        strength[pos] = Math.max(1, avg - 35);
      }
      const total = FLEX_POSITIONS.reduce((sum, pos) => sum + strength[pos], 0) || 1;
      return Object.fromEntries(FLEX_POSITIONS.map(pos => [pos, strength[pos] / total]));
    }

    function rosterNeeds(lineup) {
      const ids = new Set(safeJson(ROSTER_KEY, []));
      const counts = { QB: 0, RB: 0, WR: 0, TE: 0 };
      for (const player of state.players) {
        if (ids.has(player.id) && Object.prototype.hasOwnProperty.call(counts, player.position)) counts[player.position] += 1;
      }
      const open = {};
      for (const pos of POSITIONS) open[pos] = Math.max(0, lineup[pos] - counts[pos]);
      const flexSurplus = FLEX_POSITIONS.reduce((sum, pos) => sum + Math.max(0, counts[pos] - lineup[pos]), 0);
      const flexOpen = Math.max(0, lineup.FLEX - Math.min(lineup.FLEX, flexSurplus));
      return { counts, open, flexOpen };
    }

    function buildSnapshot() {
      const lineup = normalizeLineup(safeJson(LINEUP_KEY, DEFAULT_LINEUP));
      const signature = `${state.teams}|${state.scoring}|${state.players.length}|${draftedSignature()}|${state.picksUntilNext}|${JSON.stringify(lineup)}|${localStorage.getItem(ROSTER_KEY) || '[]'}`;
      if (snapshot && signature === snapshotSignature) return snapshot;

      const teams = Math.max(1, Number(state.teams || 12));
      const groups = {};
      const draftedByPos = { QB: 0, RB: 0, WR: 0, TE: 0 };
      for (const pos of POSITIONS) {
        groups[pos] = state.players
          .filter(p => p.position === pos && !state.drafted.has(p.id))
          .sort((a, b) => playerQuality(b) - playerQuality(a));
      }
      for (const player of state.players) {
        if (state.drafted.has(player.id) && Object.prototype.hasOwnProperty.call(draftedByPos, player.position)) draftedByPos[player.position] += 1;
      }

      const shares = flexShares(groups, teams);
      const totalDemand = {};
      const openDemand = {};
      for (const pos of POSITIONS) {
        const flexDemand = FLEX_POSITIONS.includes(pos) ? teams * lineup.FLEX * shares[pos] : 0;
        totalDemand[pos] = teams * lineup[pos] + flexDemand;
        openDemand[pos] = Math.max(0, totalDemand[pos] - draftedByPos[pos]);
      }
      const totalOpenDemand = POSITIONS.reduce((sum, pos) => sum + openDemand[pos], 0) || 1;
      const needs = rosterNeeds(lineup);

      snapshotSignature = signature;
      evaluationCache = new Map();
      snapshot = { teams, lineup, groups, draftedByPos, shares, totalDemand, openDemand, totalOpenDemand, needs };
      return snapshot;
    }

    function evaluatePlayer(player) {
      if (!player || !POSITIONS.includes(player.position)) return { vorp: 0, waitCost: 0, replacement: null, replacementRank: 0, expectedTaken: 0, quality: 0 };
      const snap = buildSnapshot();
      if (evaluationCache.has(player.id)) return evaluationCache.get(player.id);

      const group = snap.groups[player.position] || [];
      const quality = playerQuality(player);
      const remainingDemand = Math.max(1, snap.openDemand[player.position]);
      const replacementIndex = Math.min(Math.max(0, group.length - 1), Math.max(0, Math.ceil(remainingDemand) - 1));
      const replacement = group[replacementIndex] || group[group.length - 1] || null;
      const replacementQuality = replacement ? playerQuality(replacement) : quality;
      const vorp = quality - replacementQuality;

      const positionShare = snap.openDemand[player.position] / snap.totalOpenDemand;
      const picksAway = Math.max(1, Number(state.picksUntilNext || snap.teams));
      const expectedTaken = Math.max(0, Math.round(picksAway * positionShare));
      const currentIndex = Math.max(0, group.findIndex(p => p.id === player.id));
      let waitCost = 0;
      if (currentIndex >= 0 && currentIndex < expectedTaken && group.length) {
        const nextIndex = Math.min(group.length - 1, Math.max(expectedTaken, currentIndex + 1));
        waitCost = Math.max(0, quality - playerQuality(group[nextIndex]));
      }

      let rosterFactor = 0.65;
      if (snap.needs.open[player.position] > 0) rosterFactor = 1.08;
      else if (snap.needs.flexOpen > 0 && FLEX_POSITIONS.includes(player.position)) rosterFactor = 0.92;

      const scoreBoost = Math.max(-2, Math.min(7, (vorp * 0.13 + waitCost * 0.18) * rosterFactor));
      const result = {
        quality,
        vorp,
        waitCost,
        scoreBoost,
        replacement,
        replacementRank: replacementIndex + 1,
        expectedTaken,
        remainingDemand,
        rosterFactor
      };
      evaluationCache.set(player.id, result);
      return result;
    }

    const previousMatrixScore = matrixScore;
    matrixScore = function vorpAwareMatrixScore(player, round = Number(document.getElementById('round')?.value || 1), includeScarcity = true) {
      const base = previousMatrixScore(player, round, includeScarcity);
      if (!includeScarcity || !player || !POSITIONS.includes(player.position)) return base;
      const live = evaluatePlayer(player);
      return Math.round(clamp(base + live.scoreBoost));
    };

    function formatDelta(value) {
      const n = Number(value || 0);
      return `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;
    }

    function decorateRows() {
      document.querySelectorAll('#draftList .row[data-player]').forEach(row => {
        const id = row.dataset.player;
        const player = state.players.find(p => p.id === id);
        const meta = row.querySelector('.rmeta');
        if (!player || !meta) return;
        meta.querySelectorAll('.vorp-row-tag').forEach(tag => tag.remove());
        const live = evaluatePlayer(player);
        const vorp = document.createElement('span');
        vorp.className = 'vorp-row-tag';
        vorp.textContent = `VORP ${formatDelta(live.vorp)}`;
        meta.appendChild(vorp);
        if (live.waitCost >= 2) {
          const wait = document.createElement('span');
          wait.className = 'vorp-row-tag wait';
          wait.textContent = `WAIT −${live.waitCost.toFixed(1)}`;
          meta.appendChild(wait);
        }
      });
    }

    function decorateBestPick() {
      const pick = typeof bestDraftPlayer === 'function' ? bestDraftPlayer() : null;
      const card = document.getElementById('draftPick');
      if (!pick || !card) return;
      card.querySelectorAll('.vorp-strip,.vorp-note').forEach(el => el.remove());
      const live = evaluatePlayer(pick);
      const why = card.querySelector('.why');
      if (!why) return;

      const replacementName = live.replacement ? live.replacement.name : 'end of pool';
      const strip = document.createElement('div');
      strip.className = 'vorp-strip';
      strip.innerHTML = `<div class="vorp-metric"><b>${formatDelta(live.vorp)}</b><span>LIVE VORP</span></div><div class="vorp-metric"><b>${live.waitCost.toFixed(1)}</b><span>WAIT COST</span></div><div class="vorp-metric"><b>${Math.ceil(live.remainingDemand)}</b><span>${pick.position} STARTERS LEFT</span></div>`;
      why.insertAdjacentElement('beforebegin', strip);

      const note = document.createElement('span');
      note.className = 'vorp-note';
      const waitText = live.waitCost >= 2
        ? ` Waiting ${state.picksUntilNext} pick${Number(state.picksUntilNext) === 1 ? '' : 's'} projects a ${live.waitCost.toFixed(1)}-point quality drop at ${pick.position}.`
        : ` The Matrix sees little ${pick.position} value loss if you wait ${state.picksUntilNext} pick${Number(state.picksUntilNext) === 1 ? '' : 's'}.`;
      note.innerHTML = `<strong>Dynamic VORP:</strong> ${esc(pick.name)} is ${formatDelta(live.vorp)} above the live ${pick.position} replacement baseline (${esc(replacementName)}).${waitText}`;
      why.appendChild(note);
    }

    function refreshVorpUI() {
      snapshotSignature = '';
      buildSnapshot();
      decorateRows();
      decorateBestPick();
    }

    const previousRenderDraftList = renderDraftList;
    renderDraftList = function vorpDraftList() {
      const result = previousRenderDraftList();
      decorateRows();
      return result;
    };

    const previousRenderDraftPick = renderDraftPick;
    renderDraftPick = function vorpDraftPick() {
      const result = previousRenderDraftPick();
      decorateBestPick();
      return result;
    };

    const previousRenderAll = renderAll;
    renderAll = function vorpRenderAll() {
      snapshotSignature = '';
      const result = previousRenderAll();
      decorateRows();
      decorateBestPick();
      return result;
    };

    document.getElementById('saveSettings')?.addEventListener('click', () => setTimeout(refreshVorpUI, 0));
    document.getElementById('resetDraft')?.addEventListener('click', () => setTimeout(refreshVorpUI, 0));
    document.getElementById('round')?.addEventListener('change', () => setTimeout(refreshVorpUI, 0));

    window.ffmVorp = Object.freeze({ evaluate: evaluatePlayer });
    refreshVorpUI();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady, { once: true });
  else setTimeout(onReady, 0);
})();
