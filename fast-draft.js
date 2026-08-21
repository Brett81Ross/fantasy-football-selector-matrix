(() => {
  'use strict';

  const FAST_VERSION = '1.2.0';
  const DATA_TTL = 6 * 60 * 60 * 1000;
  const CACHE_PREFIX = 'ffm-fast-data:';
  const DRAFTED_KEY = 'ffm-fast-drafted';
  const ROSTER_KEY = 'ffm-fast-my-roster';
  const GAP_KEY = 'ffm-fast-gap';
  const nativeFetch = window.fetch.bind(window);

  // Instant repeat loads: serve the latest local Matrix payload immediately,
  // then refresh it in the background. First-time loads still use the network.
  window.fetch = async function fastMatrixFetch(input, init) {
    const requestUrl = typeof input === 'string' ? input : input?.url;
    if (!requestUrl) return nativeFetch(input, init);
    const url = new URL(requestUrl, location.href);
    if (!url.pathname.startsWith('/api/nfl-data')) return nativeFetch(input, init);

    const scoring = url.searchParams.get('scoring') || 'ppr';
    const key = CACHE_PREFIX + scoring;
    try {
      const cached = JSON.parse(localStorage.getItem(key) || 'null');
      if (cached?.body && Date.now() - cached.savedAt < DATA_TTL) {
        nativeFetch(input, init).then(async response => {
          if (!response.ok) return;
          const body = await response.clone().text();
          localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), body }));
        }).catch(() => {});
        return new Response(cached.body, {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Matrix-Cache': 'instant' }
        });
      }
    } catch (_) {}

    const response = await nativeFetch(input, init);
    if (response.ok) {
      response.clone().text().then(body => {
        try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), body })); } catch (_) {}
      }).catch(() => {});
    }
    return response;
  };

  function safeJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || '') || fallback; } catch (_) { return fallback; }
  }

  function onReady() {
    if (typeof state === 'undefined' || typeof matrixScore !== 'function') return;

    const style = document.createElement('style');
    style.textContent = `
      .app{padding-bottom:112px!important}
      .fast-tools{display:flex;gap:7px;overflow-x:auto;padding:10px 0 2px;scrollbar-width:none}.fast-tools::-webkit-scrollbar{display:none}
      .fast-chip{flex:0 0 auto;border:1px solid var(--line);background:#0a1510;color:var(--muted);height:36px;padding:0 13px;border-radius:999px;font-size:11px;font-weight:850}.fast-chip.active{border-color:var(--accent);color:#06120a;background:var(--accent)}
      .fast-dock{position:fixed;z-index:19;left:50%;bottom:max(10px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(calc(100% - 20px),900px);border:1px solid #315742;background:rgba(6,16,11,.96);backdrop-filter:blur(14px);border-radius:18px;padding:10px;box-shadow:0 18px 46px rgba(0,0,0,.48);display:none;grid-template-columns:minmax(0,1fr) auto auto;gap:7px;align-items:center}
      .fast-dock.show{display:grid}.fast-info{min-width:0}.fast-kicker{font-size:9px;font-weight:900;letter-spacing:.12em;color:var(--accent)}.fast-name{font-size:14px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fast-meta{font-size:9px;color:var(--muted);margin-top:2px}.fast-score{color:var(--accent);font-weight:950}
      .fast-action{height:46px;border-radius:12px;border:1px solid var(--line);background:#102017;color:var(--text);font-weight:900;padding:0 12px}.fast-action.mine{background:var(--accent);color:#05130a;border-color:var(--accent)}
      .fast-toast{position:fixed;z-index:25;left:50%;bottom:92px;transform:translateX(-50%);width:min(calc(100% - 28px),520px);background:#132119;border:1px solid #355744;border-radius:14px;padding:10px 12px;display:none;align-items:center;justify-content:space-between;gap:10px;font-size:11px;box-shadow:0 14px 35px rgba(0,0,0,.4)}.fast-toast.show{display:flex}.fast-toast button{border:1px solid #466d54;background:#0c1911;color:var(--accent);border-radius:9px;height:32px;padding:0 11px;font-weight:900}
      .row[data-player]{cursor:pointer;touch-action:manipulation}.row[data-player]:active{transform:scale(.993)}
      @media(max-width:560px){.fast-dock{grid-template-columns:minmax(0,1fr) 76px 70px}.fast-action{padding:0 7px;font-size:11px}.fast-meta{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
    `;
    document.head.appendChild(style);

    // Visible version bump without disturbing the existing layout.
    document.querySelectorAll('.brand small').forEach(el => {
      el.textContent = el.textContent.replace(/v\d+\.\d+\.\d+/, `v${FAST_VERSION}`);
    });
    const footer = document.querySelector('footer');
    if (footer) footer.innerHTML = footer.innerHTML.replace(/v\d+\.\d+\.\d+/, `v${FAST_VERSION}`);

    const filters = document.querySelector('#draft .filters');
    if (filters && !document.getElementById('fastTools')) {
      const tools = document.createElement('div');
      tools.className = 'fast-tools';
      tools.id = 'fastTools';
      tools.innerHTML = ['ALL','RB','WR','QB','TE'].map(pos => `<button class="fast-chip${pos==='ALL'?' active':''}" data-fast-pos="${pos}">${pos}</button>`).join('');
      filters.insertAdjacentElement('afterend', tools);
    }

    const dock = document.createElement('div');
    dock.className = 'fast-dock';
    dock.id = 'fastDock';
    dock.innerHTML = `<div class="fast-info"><div class="fast-kicker">BEST PICK RIGHT NOW</div><div class="fast-name" id="fastName">Loading…</div><div class="fast-meta" id="fastMeta">Instant draft controls</div></div><button class="fast-action" id="fastDrafted">Drafted</button><button class="fast-action mine" id="fastMine">Mine</button>`;
    document.body.appendChild(dock);

    const toast = document.createElement('div');
    toast.className = 'fast-toast';
    toast.id = 'fastToast';
    toast.innerHTML = `<span id="fastToastText"></span><button id="fastUndo">UNDO</button>`;
    document.body.appendChild(toast);

    let myRoster = new Set(safeJson(ROSTER_KEY, []));
    let defaultGap = Number(localStorage.getItem(GAP_KEY) || state.picksUntilNext || state.teams || 12);
    let lastAction = null;
    let toastTimer = null;
    let scoreCache = new Map();
    let scarcityCache = new Map();
    let cacheSignature = '';

    function draftedSignature() {
      return [...state.drafted].sort().join(',');
    }

    function invalidateScores() {
      scoreCache.clear();
      scarcityCache.clear();
      cacheSignature = '';
    }

    const baseScarcityScore = scarcityScore;
    scarcityScore = function fastScarcityScore(player) {
      const signature = `${state.teams}|${draftedSignature()}|${state.players.length}`;
      if (signature !== cacheSignature) {
        scarcityCache.clear();
        cacheSignature = signature;
        for (const pos of ['QB','RB','WR','TE']) {
          const group = state.players.filter(p => p.position === pos && !state.drafted.has(p.id));
          const quality = p => p.metrics.production * .55 + p.metrics.opportunity * .25 + p.metrics.ceiling * .2;
          group.sort((a,b) => quality(b) - quality(a));
          const replacement = pos === 'QB' || pos === 'TE' ? state.teams : state.teams * 2;
          group.forEach((p, i) => scarcityCache.set(p.id, clamp(100 - (i / Math.max(1, replacement)) * 55)));
        }
      }
      return scarcityCache.has(player.id) ? scarcityCache.get(player.id) : baseScarcityScore(player);
    };

    const baseMatrixScore = matrixScore;
    matrixScore = function fastMatrixScore(player, round = Number(document.getElementById('round')?.value || 1), includeScarcity = true) {
      const key = `${player.id}|${round}|${includeScarcity?1:0}|${state.risk}|${state.teams}|${state.scoring}|${draftedSignature()}`;
      if (scoreCache.has(key)) return scoreCache.get(key);
      const value = baseMatrixScore(player, round, includeScarcity);
      scoreCache.set(key, value);
      return value;
    };

    const baseBestDraftPlayer = bestDraftPlayer;
    bestDraftPlayer = function fastBestDraftPlayer() {
      const pool = getBoardPlayers(document.getElementById('position').value, document.getElementById('draftSearch').value);
      let best = null, bestScore = -Infinity;
      for (const p of pool) {
        const s = matrixScore(p);
        if (s > bestScore) { bestScore = s; best = p; }
      }
      return best || baseBestDraftPlayer();
    };

    const baseRenderAll = renderAll;
    renderAll = function fastRenderAll() {
      invalidateScores();
      baseRenderAll();
      requestAnimationFrame(syncFastUI);
    };

    const baseRenderDraftList = renderDraftList;
    renderDraftList = function fastRenderDraftList() {
      if (!state.players.length) return baseRenderDraftList();
      const pos = document.getElementById('position').value;
      const search = document.getElementById('draftSearch').value;
      const pool = getBoardPlayers(pos, search);
      const scored = pool.map(p => ({p, score: matrixScore(p)})).sort((a,b) => b.score - a.score).slice(0,60);
      document.getElementById('availableCount').textContent = `${getBoardPlayers('ALL','').length} LEFT`;
      document.getElementById('draftList').innerHTML = scored.length ? scored.map((x,i) => playerRow(x.p,i+1)).join('') : '<div class="empty">No players match.</div>';
      document.querySelectorAll('.compare-btn').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); toggleCompare(btn.dataset.id); }));
      document.querySelectorAll('.drafted-btn').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); fastMarkDrafted(btn.dataset.id, false); }));
      syncFastUI();
    };

    function saveDraftState() {
      try {
        localStorage.setItem(DRAFTED_KEY, JSON.stringify([...state.drafted]));
        localStorage.setItem(ROSTER_KEY, JSON.stringify([...myRoster]));
        localStorage.setItem(GAP_KEY, String(defaultGap));
      } catch (_) {}
    }

    function showToast(text, action) {
      lastAction = action;
      document.getElementById('fastToastText').textContent = text;
      toast.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('show'), 5000);
    }

    function advanceRound() {
      const round = document.getElementById('round');
      if (!round) return;
      const values = [...round.options].map(o => o.value);
      const idx = values.indexOf(round.value);
      if (idx >= 0 && idx < values.length - 1) round.value = values[idx + 1];
    }

    function fastMarkDrafted(id, mine) {
      const p = state.players.find(x => x.id === id);
      if (!p || state.drafted.has(id)) return;
      const snapshot = { id, mine, round: document.getElementById('round')?.value, picks: state.picksUntilNext };
      state.drafted.add(id);
      state.compare.delete(id);
      if (mine) {
        myRoster.add(id);
        state.picksUntilNext = Math.max(1, defaultGap);
        advanceRound();
      } else {
        state.picksUntilNext = Math.max(1, Number(state.picksUntilNext || defaultGap) - 1);
      }
      saveDraftState();
      renderAll();
      showToast(`${p.name} ${mine ? 'added to MY TEAM' : 'marked drafted'}`, snapshot);
      if (navigator.vibrate) navigator.vibrate(mine ? [18,28,18] : 12);
    }

    function undoLast() {
      if (!lastAction) return;
      const a = lastAction;
      state.drafted.delete(a.id);
      if (a.mine) myRoster.delete(a.id);
      if (a.round && document.getElementById('round')) document.getElementById('round').value = a.round;
      state.picksUntilNext = a.picks;
      lastAction = null;
      toast.classList.remove('show');
      saveDraftState();
      renderAll();
    }

    function syncFastUI() {
      const draftActive = document.getElementById('draft')?.classList.contains('active');
      dock.classList.toggle('show', !!draftActive && state.players.length > 0);
      if (!draftActive || !state.players.length) return;
      const p = bestDraftPlayer();
      if (!p) {
        document.getElementById('fastName').textContent = 'No matching player';
        document.getElementById('fastMeta').textContent = 'Clear the search or change position';
        return;
      }
      document.getElementById('fastName').innerHTML = `${esc(p.name)} <span class="fast-score">${matrixScore(p)}</span>`;
      document.getElementById('fastMeta').textContent = `${p.position} · ${p.team} · ${state.picksUntilNext} pick${state.picksUntilNext===1?'':'s'} to you · My picks ${myRoster.size}`;
      document.getElementById('fastDrafted').dataset.id = p.id;
      document.getElementById('fastMine').dataset.id = p.id;
      document.querySelectorAll('[data-fast-pos]').forEach(btn => btn.classList.toggle('active', btn.dataset.fastPos === document.getElementById('position').value));
    }

    // Restore an in-progress draft after reload. Wait for the live/cached player payload first.
    const restoreSaved = () => {
      if (!state.players.length) return false;
      const valid = new Set(state.players.map(p => p.id));
      for (const id of safeJson(DRAFTED_KEY, [])) if (valid.has(id)) state.drafted.add(id);
      myRoster = new Set([...myRoster].filter(id => valid.has(id)));
      renderAll();
      return true;
    };
    let restoreTries = 0;
    const restoreTimer = setInterval(() => {
      if (restoreSaved() || ++restoreTries > 80) clearInterval(restoreTimer);
    }, 100);

    document.getElementById('fastTools')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-fast-pos]');
      if (!btn) return;
      const select = document.getElementById('position');
      select.value = btn.dataset.fastPos;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncFastUI();
    });

    document.getElementById('fastDrafted').addEventListener('click', () => fastMarkDrafted(document.getElementById('fastDrafted').dataset.id, false));
    document.getElementById('fastMine').addEventListener('click', () => fastMarkDrafted(document.getElementById('fastMine').dataset.id, true));
    document.getElementById('fastUndo').addEventListener('click', undoLast);

    // Tap anywhere on a player row to remove him from the board. Buttons still do their normal jobs.
    document.getElementById('draftList')?.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const row = e.target.closest('[data-player]');
      if (row?.dataset.player) fastMarkDrafted(row.dataset.player, false);
    });

    // Type a name + Enter = mark the first result drafted. Search clears instantly afterward.
    document.getElementById('draftSearch')?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const q = e.currentTarget.value.trim();
      if (q.length < 2) return;
      e.preventDefault();
      const candidate = getBoardPlayers(document.getElementById('position').value, q).sort((a,b) => matrixScore(b)-matrixScore(a))[0];
      if (candidate) {
        fastMarkDrafted(candidate.id, false);
        e.currentTarget.value = '';
        renderAll();
      }
    });

    // Existing control changes update the fixed recommendation immediately.
    ['position','round','draftSearch'].forEach(id => document.getElementById(id)?.addEventListener(id === 'draftSearch' ? 'input' : 'change', () => requestAnimationFrame(syncFastUI)));
    document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => requestAnimationFrame(syncFastUI)));
    document.getElementById('resetDraft')?.addEventListener('click', () => {
      myRoster.clear();
      localStorage.removeItem(DRAFTED_KEY);
      localStorage.removeItem(ROSTER_KEY);
      invalidateScores();
      requestAnimationFrame(syncFastUI);
    });
    document.getElementById('saveSettings')?.addEventListener('click', () => {
      defaultGap = Math.max(1, Number(document.getElementById('setNextPick')?.value || state.teams || 12));
      localStorage.setItem(GAP_KEY, String(defaultGap));
      invalidateScores();
      setTimeout(syncFastUI, 0);
    });

    // Stop 300ms-ish double-tap behavior on older mobile browsers and keep the search ready.
    document.getElementById('draftSearch')?.setAttribute('enterkeyhint', 'done');
    syncFastUI();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady, { once: true });
  else setTimeout(onReady, 0);
})();
