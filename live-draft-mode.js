(() => {
  'use strict';

  const ROSTER_KEY = 'ffm-fast-my-roster';
  const LINEUP_KEY = 'ffm-roster-lineup';
  const BENCH_KEY = 'ffm-fast-bench';
  const recentManual = [];

  function safeJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function escText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  }

  function dependenciesReady() {
    return typeof state !== 'undefined' &&
      Array.isArray(state.players) &&
      typeof matrixScore === 'function' &&
      typeof bestDraftPlayer === 'function' &&
      window.FFMRosterAssignment?.assignRoster &&
      window.FFMPositionIntelligence?.rankPositionOptions &&
      window.FFMFlexIntelligence?.chooseFlexRecommendation &&
      window.FFMLiveDraftView?.buildLiveDraftView;
  }

  function fallbackRosterSlots() {
    const lineup = safeJson(LINEUP_KEY, { QB:1, RB:2, WR:2, TE:1, FLEX:2 });
    const benchIds = safeJson(BENCH_KEY, []);
    const benchCount = Math.max(5, Array.isArray(benchIds) ? benchIds.length : 0);
    return [
      { id:'QB', type:'QB', count:Number(lineup.QB ?? 1), eligiblePositions:['QB'] },
      { id:'RB', type:'RB', count:Number(lineup.RB ?? 2), eligiblePositions:['RB'] },
      { id:'WR', type:'WR', count:Number(lineup.WR ?? 2), eligiblePositions:['WR'] },
      { id:'TE', type:'TE', count:Number(lineup.TE ?? 1), eligiblePositions:['TE'] },
      { id:'FLEX', type:'FLEX', count:Number(lineup.FLEX ?? 2), eligiblePositions:['RB','WR','TE'] },
      { id:'K', type:'K', count:1, eligiblePositions:['K'] },
      { id:'DST', type:'DST', count:1, eligiblePositions:['DST'] },
      { id:'BN', type:'BN', count:benchCount, eligiblePositions:['QB','RB','WR','TE','K','DST'], isBench:true }
    ].filter(slot => Number.isFinite(slot.count) && slot.count > 0);
  }

  function canonicalState() {
    const external = window.ffmCanonicalDraftState;
    return external && typeof external === 'object' ? external : null;
  }

  function rosterSlots() {
    return canonicalState()?.league?.rosterSlots || fallbackRosterSlots();
  }

  function myRosterPlayers() {
    const canonical = canonicalState();
    if (canonical?.myRoster?.length) {
      const ids = new Set(canonical.myRoster.map(item => item.playerId));
      return state.players.filter(player => ids.has(player.id));
    }
    const ids = new Set(safeJson(ROSTER_KEY, []));
    return state.players.filter(player => ids.has(player.id));
  }

  function assignmentState() {
    return window.FFMRosterAssignment.assignRoster({
      players: myRosterPlayers(),
      rosterSlots: rosterSlots()
    });
  }

  function openSlotFor(position, assignments) {
    const filled = new Set(assignments.assignments.map(item => item.slotId));
    return window.FFMRosterAssignment.expandSlots(rosterSlots())
      .find(slot => !slot.isBench && !slot.isReserve && !filled.has(slot.slotId) && slot.eligiblePositions.includes(position));
  }

  function candidateComponents(player, assignments) {
    const vorp = window.ffmVorp?.evaluate ? window.ffmVorp.evaluate(player) : null;
    return {
      playerValue: Number(matrixScore(player) || 0),
      rosterNeed: openSlotFor(player.position, assignments) ? 5 : 0,
      positionalDropoff: Number(vorp?.waitCost || 0),
      tierCliff: 0,
      waitCost: Number(vorp?.waitCost || 0)
    };
  }

  function recommendation(assignments) {
    const available = state.players.filter(player => !state.drafted.has(player.id));
    if (!available.length) return null;
    const candidates = available.map(player => ({
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      available: true,
      components: candidateComponents(player, assignments)
    }));
    const ranked = window.FFMPositionIntelligence.rankPositionOptions(candidates);
    const top = ranked.best;
    if (!top) {
      const legacy = bestDraftPlayer();
      return legacy ? { playerId:legacy.id, playerName:legacy.name, position:legacy.position, slotId:null, score:matrixScore(legacy), explanation:'Best remaining Matrix value.' } : null;
    }

    const flex = window.FFMFlexIntelligence.chooseFlexRecommendation({
      currentRosterPlayers: myRosterPlayers(),
      rosterSlots: rosterSlots(),
      candidates
    });
    const directSlot = openSlotFor(top.position, assignments);
    const slotId = directSlot?.slotId || (flex?.playerId === top.playerId ? flex.slotId : null);
    return {
      playerId: top.playerId,
      playerName: top.playerName,
      position: top.position,
      slotId,
      score: top.score,
      components: top.components,
      explanation: top.explanation
    };
  }

  function recentPicks() {
    const canonical = canonicalState();
    if (Array.isArray(canonical?.recentPicks) && canonical.recentPicks.length) return canonical.recentPicks;
    return recentManual.slice(-5);
  }

  function syncMeta() {
    return canonicalState()?.sync || { status:'manual', lastSuccessfulSyncAt:null };
  }

  function playerNames() {
    return Object.fromEntries(state.players.map(player => [player.id, player.name]));
  }

  function mount() {
    if (document.getElementById('liveDraftMode')) return;
    const draft = document.getElementById('draft');
    if (!draft) return;

    const style = document.createElement('style');
    style.textContent = `
      body.ffm-live-draft-mounted .fast-dock{display:none!important}
      .live-draft-mode{position:sticky;top:max(6px,env(safe-area-inset-top));z-index:18;margin:8px 0 12px;border:1px solid rgba(57,255,20,.38);background:rgba(5,14,9,.97);backdrop-filter:blur(15px);border-radius:20px;padding:12px;box-shadow:0 15px 38px rgba(0,0,0,.46)}
      .live-draft-top{display:flex;justify-content:space-between;gap:10px;align-items:center}.live-draft-eyebrow{font-size:9px;font-weight:950;letter-spacing:.14em;color:var(--accent)}.live-sync{font-size:9px;font-weight:950;border:1px solid #315742;border-radius:999px;padding:5px 8px;color:var(--accent)}
      .live-headline{font-size:clamp(20px,5vw,32px);line-height:1.05;font-weight:1000;margin:8px 0 4px}.live-reason{font-size:11px;line-height:1.4;color:var(--muted);min-height:31px}.live-slot{color:var(--accent);font-weight:900}
      .live-roster{display:flex;gap:5px;overflow-x:auto;scrollbar-width:none;margin:10px 0}.live-roster::-webkit-scrollbar{display:none}.live-roster-chip{flex:0 0 auto;border:1px solid #294534;background:#0b1911;border-radius:999px;padding:6px 8px;font-size:9px;font-weight:900;color:var(--text)}
      .live-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.live-action{min-height:52px;border-radius:14px;font-size:12px;font-weight:1000;border:1px solid var(--line);background:#111d16;color:var(--text)}.live-action.mine{background:var(--accent);border-color:var(--accent);color:#041108}
      .live-recent{display:flex;align-items:center;gap:7px;margin-top:9px;overflow-x:auto;scrollbar-width:none}.live-recent::-webkit-scrollbar{display:none}.live-recent-label{font-size:9px;font-weight:950;color:var(--muted);white-space:nowrap}.live-pick{font-size:9px;white-space:nowrap;border:1px solid var(--line);border-radius:999px;padding:5px 7px;color:var(--muted)}.live-undo{margin-left:auto;flex:0 0 auto;border:1px solid #466d54;background:#0c1911;color:var(--accent);border-radius:9px;height:30px;padding:0 10px;font-size:9px;font-weight:950}
      @media(max-width:560px){.live-draft-mode{margin-left:-2px;margin-right:-2px;padding:10px}.live-headline{font-size:21px}.live-action{min-height:50px}.live-reason{font-size:10px}}
    `;
    document.head.appendChild(style);

    const panel = document.createElement('section');
    panel.id = 'liveDraftMode';
    panel.className = 'live-draft-mode';
    panel.setAttribute('aria-label', 'Live Draft Mode');
    panel.innerHTML = `
      <div class="live-draft-top"><span class="live-draft-eyebrow">LIVE DRAFT MODE</span><span class="live-sync" id="liveSync">MANUAL</span></div>
      <div class="live-headline" id="liveHeadline">BEST PICK: LOADING…</div>
      <div class="live-reason" id="liveReason">Building your next recommendation.</div>
      <div class="live-roster" id="liveRoster"></div>
      <div class="live-actions"><button class="live-action" id="liveThey">THEY TOOK HIM</button><button class="live-action mine" id="liveMine">I TOOK HIM</button></div>
      <div class="live-recent"><span class="live-recent-label">Recent Picks</span><span id="liveRecent"></span><button class="live-undo" id="liveUndo">UNDO</button></div>`;

    const filters = draft.querySelector('.filters');
    if (filters) filters.insertAdjacentElement('beforebegin', panel);
    else draft.prepend(panel);
    document.body.classList.add('ffm-live-draft-mounted');

    document.getElementById('liveThey').addEventListener('click', () => {
      const pick = recommendation(assignmentState());
      if (!pick) return;
      recentManual.push({ overall:recentManual.length + 1, playerId:pick.playerId, teamId:'OTHER' });
      const fast = document.getElementById('fastDrafted');
      if (fast) { fast.dataset.id = pick.playerId; fast.click(); }
      setTimeout(render, 0);
    });
    document.getElementById('liveMine').addEventListener('click', () => {
      const pick = recommendation(assignmentState());
      if (!pick) return;
      recentManual.push({ overall:recentManual.length + 1, playerId:pick.playerId, teamId:'ME' });
      const fast = document.getElementById('fastMine');
      if (fast) { fast.dataset.id = pick.playerId; fast.click(); }
      setTimeout(render, 0);
    });
    document.getElementById('liveUndo').addEventListener('click', () => {
      recentManual.pop();
      const fast = document.getElementById('fastUndo');
      if (fast) fast.click();
      setTimeout(render, 0);
    });
  }

  function render() {
    if (!dependenciesReady()) return;
    mount();
    const panel = document.getElementById('liveDraftMode');
    if (!panel) return;
    const assignments = assignmentState();
    const rec = recommendation(assignments);
    const canonical = canonicalState();
    const view = window.FFMLiveDraftView.buildLiveDraftView({
      recommendation: rec,
      rosterSlots: rosterSlots(),
      assignments: assignments.assignments,
      openStarterSlots: assignments.openStarterSlots,
      openBenchSlots: assignments.openBenchSlots,
      recentPicks: recentPicks(),
      playerNames: playerNames(),
      myTeamId: canonical?.myTeamId || 'ME',
      sync: syncMeta()
    });

    document.getElementById('liveSync').textContent = view.syncLabel;
    document.getElementById('liveHeadline').textContent = view.headline;
    document.getElementById('liveReason').innerHTML = `${escText(view.reason)}${view.slotLabel ? ` <span class="live-slot">→ ${escText(view.slotLabel)}</span>` : ''}`;
    document.getElementById('liveRoster').innerHTML = view.rosterChips.map(chip => `<span class="live-roster-chip">${escText(chip)}</span>`).join('');
    document.getElementById('liveRecent').innerHTML = view.recentPicks.length
      ? view.recentPicks.map(pick => `<span class="live-pick">${escText(pick)}</span>`).join(' ')
      : '<span class="live-pick">No picks yet</span>';
  }

  function init() {
    if (!dependenciesReady()) return setTimeout(init, 100);
    mount();
    const previousRenderAll = window.renderAll;
    if (typeof previousRenderAll === 'function' && !previousRenderAll.__liveDraftWrapped) {
      const wrapped = function liveDraftRenderAll() {
        const result = previousRenderAll.apply(this, arguments);
        requestAnimationFrame(render);
        return result;
      };
      wrapped.__liveDraftWrapped = true;
      window.renderAll = wrapped;
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
    window.addEventListener('focus', render);
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
  else init();
})();