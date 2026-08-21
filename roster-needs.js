(() => {
  'use strict';

  const VERSION = '1.3.1';
  const ROSTER_KEY = 'ffm-fast-my-roster';
  const LINEUP_KEY = 'ffm-roster-lineup';
  const DEFAULT_LINEUP = Object.freeze({ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 });
  const FLEX_POSITIONS = ['RB', 'WR', 'TE'];
  const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

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
      .roster-needs{border:1px solid var(--line);background:#09130e;border-radius:14px;padding:10px 11px;margin-top:9px}
      .roster-needs-head{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:10px;color:var(--muted)}
      .roster-needs-head strong{color:var(--text);font-size:11px}.need-chips{display:flex;gap:6px;overflow-x:auto;margin-top:8px;scrollbar-width:none}.need-chips::-webkit-scrollbar{display:none}
      .need-chip{flex:0 0 auto;border:1px solid #294534;background:#0d1b13;border-radius:999px;padding:6px 9px;font-size:10px;font-weight:850;color:var(--muted)}
      .need-chip.open{border-color:#6d5a2e;color:var(--warn);background:rgba(255,198,92,.06)}.need-chip.done{border-color:#315742;color:var(--accent)}
      .roster-settings{border-top:1px solid var(--line);margin-top:16px;padding-top:14px}.roster-settings h4{margin:0;font-size:13px}.roster-settings p{margin:4px 0 10px!important}
      .roster-settings-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.roster-settings-grid .field input{text-align:center;padding:0 5px}
      .tiny.roster-mine-btn{color:#06120a;background:var(--accent);border-color:var(--accent)}.roster-need-note{display:block;margin-top:6px;color:var(--accent)}
      @media(max-width:560px){.roster-settings-grid{grid-template-columns:repeat(3,1fr)}}
    `;
    document.head.appendChild(style);

    document.querySelectorAll('.brand small').forEach(el => {
      el.textContent = el.textContent.replace(/v\d+\.\d+\.\d+/, `v${VERSION}`);
    });
    const footer = document.querySelector('footer');
    if (footer) footer.innerHTML = footer.innerHTML.replace(/v\d+\.\d+\.\d+/, `v${VERSION}`);

    const fastTools = document.getElementById('fastTools');
    const filters = document.querySelector('#draft .filters');
    const anchor = fastTools || filters;
    if (anchor && !document.getElementById('rosterNeeds')) {
      const panel = document.createElement('div');
      panel.className = 'roster-needs';
      panel.id = 'rosterNeeds';
      panel.innerHTML = `<div class="roster-needs-head"><strong>ROSTER NEED</strong><span id="rosterNeedSummary">Tap Mine when you make a pick</span></div><div class="need-chips" id="rosterNeedChips"></div>`;
      anchor.insertAdjacentElement('afterend', panel);
    }

    const settingsSheet = document.querySelector('#settingsModal .sheet');
    const settingsActions = settingsSheet?.querySelector('.sheet-actions');
    if (settingsSheet && settingsActions && !document.getElementById('rosterSettings')) {
      const block = document.createElement('div');
      block.className = 'roster-settings';
      block.id = 'rosterSettings';
      block.innerHTML = `<h4>Starting lineup</h4><p>Set the starters your league requires. The Matrix uses these needs when ranking your next pick.</p><div class="roster-settings-grid">${['QB','RB','WR','TE','FLEX'].map(pos => `<div class="field"><label for="setLineup${pos}">${pos}</label><input id="setLineup${pos}" type="number" min="0" max="4" inputmode="numeric" /></div>`).join('')}</div>`;
      settingsSheet.insertBefore(block, settingsActions);
    }

    let lineup = normalizeLineup(safeJson(LINEUP_KEY, DEFAULT_LINEUP));
    let snapshotKey = '';
    let snapshotValue = null;

    function rosterSnapshot() {
      const rosterRaw = localStorage.getItem(ROSTER_KEY) || '[]';
      const lineupRaw = JSON.stringify(lineup);
      const key = `${rosterRaw}|${lineupRaw}|${state.players.length}`;
      if (key === snapshotKey && snapshotValue) return snapshotValue;

      let rosterIds = [];
      try { rosterIds = JSON.parse(rosterRaw) || []; } catch (_) {}
      const roster = new Set(rosterIds);
      const counts = { QB: 0, RB: 0, WR: 0, TE: 0 };
      for (const player of state.players) {
        if (roster.has(player.id) && Object.prototype.hasOwnProperty.call(counts, player.position)) counts[player.position] += 1;
      }

      const filled = {};
      const open = {};
      for (const pos of POSITIONS) {
        filled[pos] = Math.min(counts[pos], lineup[pos]);
        open[pos] = Math.max(0, lineup[pos] - counts[pos]);
      }

      const flexSurplus = FLEX_POSITIONS.reduce((sum, pos) => sum + Math.max(0, counts[pos] - lineup[pos]), 0);
      const flexFilled = Math.min(lineup.FLEX, flexSurplus);
      const flexOpen = Math.max(0, lineup.FLEX - flexFilled);
      const totalStarters = lineup.QB + lineup.RB + lineup.WR + lineup.TE + lineup.FLEX;
      const filledStarters = filled.QB + filled.RB + filled.WR + filled.TE + flexFilled;

      snapshotKey = key;
      snapshotValue = { roster, counts, filled, open, flexFilled, flexOpen, totalStarters, filledStarters };
      return snapshotValue;
    }

    function needBoost(player, round) {
      if (!player || !POSITIONS.includes(player.position)) return 0;
      const need = rosterSnapshot();
      const total = Math.max(1, need.totalStarters);
      const fillPressure = need.filledStarters / total;
      const roundPressure = Math.max(0, Math.min(1, (Number(round || 1) - 1) / 6));
      const urgency = Math.max(fillPressure, roundPressure * 0.8);

      if (need.open[player.position] > 0) {
        const singleStarter = player.position === 'QB' || player.position === 'TE';
        let boost = singleStarter ? 1.5 : 4;
        boost += urgency * (singleStarter ? 8 : 7);
        if (singleStarter && Number(round || 1) >= 5) boost += 2;
        if (need.open[player.position] >= 2) boost += 1;
        return boost;
      }

      if (need.flexOpen > 0 && FLEX_POSITIONS.includes(player.position)) return 2 + urgency * 5;
      return 0;
    }

    const previousMatrixScore = matrixScore;
    matrixScore = function rosterAwareMatrixScore(player, round = Number(document.getElementById('round')?.value || 1), includeScarcity = true) {
      const base = previousMatrixScore(player, round, includeScarcity);
      if (!includeScarcity) return base;
      return Math.round(clamp(base + needBoost(player, round)));
    };

    function renderRosterNeeds() {
      const chips = document.getElementById('rosterNeedChips');
      const summary = document.getElementById('rosterNeedSummary');
      if (!chips || !summary) return;
      const need = rosterSnapshot();
      const parts = POSITIONS.filter(pos => lineup[pos] > 0).map(pos => ({ pos, filled: need.filled[pos], target: lineup[pos], open: need.open[pos] > 0 }));
      if (lineup.FLEX > 0) parts.push({ pos: 'FLEX', filled: need.flexFilled, target: lineup.FLEX, open: need.flexOpen > 0 });
      chips.innerHTML = parts.map(item => `<span class="need-chip ${item.open ? 'open' : 'done'}">${item.pos} ${item.filled}/${item.target}</span>`).join('');
      const openCount = Math.max(0, need.totalStarters - need.filledStarters);
      summary.textContent = openCount ? `${openCount} starter spot${openCount === 1 ? '' : 's'} open · ${need.roster.size} my pick${need.roster.size === 1 ? '' : 's'}` : `Starting lineup filled · ${need.roster.size} my pick${need.roster.size === 1 ? '' : 's'}`;
    }

    function addMineButtons() {
      document.querySelectorAll('#draftList .row[data-player]').forEach(row => {
        const actions = row.querySelector('.row-actions');
        if (!actions || actions.querySelector('.roster-mine-btn')) return;
        const button = document.createElement('button');
        button.className = 'tiny roster-mine-btn';
        button.dataset.id = row.dataset.player;
        button.textContent = 'Mine';
        actions.appendChild(button);
      });
    }

    function appendRosterReason() {
      const pick = typeof bestDraftPlayer === 'function' ? bestDraftPlayer() : null;
      const why = document.querySelector('#draftPick .why');
      if (!pick || !why || why.querySelector('.roster-need-note')) return;
      const need = rosterSnapshot();
      let detail = '';
      if (need.open[pick.position] > 0) detail = `${pick.position} ${need.filled[pick.position]}/${lineup[pick.position]} starters filled`;
      else if (need.flexOpen > 0 && FLEX_POSITIONS.includes(pick.position)) detail = `FLEX ${need.flexFilled}/${lineup.FLEX} filled`;
      if (detail) why.insertAdjacentHTML('beforeend', `<span class="roster-need-note"><strong>Roster need:</strong> ${detail}.</span>`);
    }

    const previousRenderDraftList = renderDraftList;
    renderDraftList = function rosterAwareDraftList() {
      const result = previousRenderDraftList();
      addMineButtons();
      renderRosterNeeds();
      return result;
    };

    const previousRenderDraftPick = renderDraftPick;
    renderDraftPick = function rosterAwareDraftPick() {
      const result = previousRenderDraftPick();
      appendRosterReason();
      return result;
    };

    const previousRenderAll = renderAll;
    renderAll = function rosterAwareRenderAll() {
      const result = previousRenderAll();
      addMineButtons();
      renderRosterNeeds();
      appendRosterReason();
      return result;
    };

    function syncLineupInputs() {
      for (const pos of ['QB','RB','WR','TE','FLEX']) {
        const input = document.getElementById(`setLineup${pos}`);
        if (input) input.value = lineup[pos];
      }
    }

    document.getElementById('draftList')?.addEventListener('click', event => {
      const button = event.target.closest('.roster-mine-btn');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const fastMine = document.getElementById('fastMine');
      if (!fastMine) return;
      fastMine.dataset.id = button.dataset.id;
      fastMine.click();
      setTimeout(() => {
        snapshotKey = '';
        renderRosterNeeds();
      }, 0);
    });

    document.getElementById('settingsBtn')?.addEventListener('click', syncLineupInputs);
    document.getElementById('saveSettings')?.addEventListener('click', () => {
      const next = {};
      for (const pos of ['QB','RB','WR','TE','FLEX']) {
        const raw = Number(document.getElementById(`setLineup${pos}`)?.value);
        next[pos] = Number.isFinite(raw) ? Math.max(0, Math.min(4, Math.round(raw))) : DEFAULT_LINEUP[pos];
      }
      lineup = normalizeLineup(next);
      localStorage.setItem(LINEUP_KEY, JSON.stringify(lineup));
      snapshotKey = '';
      renderAll();
    });

    document.getElementById('resetDraft')?.addEventListener('click', () => {
      setTimeout(() => {
        snapshotKey = '';
        renderRosterNeeds();
      }, 0);
    });

    syncLineupInputs();
    addMineButtons();
    renderRosterNeeds();
    appendRosterReason();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady, { once: true });
  else setTimeout(onReady, 0);
})();
