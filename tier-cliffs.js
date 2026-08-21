(() => {
  'use strict';

  const VERSION = '1.3.3';
  const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

  function onReady() {
    if (typeof state === 'undefined' || typeof matrixScore !== 'function' || typeof renderAll !== 'function') return;

    const style = document.createElement('style');
    style.textContent = `
      .tier-divider{display:flex;align-items:center;gap:8px;margin:8px 2px 2px;color:var(--muted);font-size:9px;font-weight:900;letter-spacing:.11em;text-transform:uppercase}
      .tier-divider::after{content:"";height:1px;flex:1;background:var(--line)}
      .tier-badge{display:inline-flex;align-items:center;border:1px solid #315742;background:#0a1710;color:var(--accent);border-radius:999px;padding:4px 7px;white-space:nowrap}
      .tier-divider.cliff .tier-badge{border-color:#6d5a2e;color:var(--warn);background:rgba(255,198,92,.05)}
      .tier-row{position:relative}.tier-row.cliff-after{border-bottom-color:#6d5a2e;box-shadow:inset 0 -1px rgba(255,198,92,.18)}
      .tier-row-tag{display:inline-flex;align-items:center;border:1px solid #315742;background:#0a1710;color:var(--accent);border-radius:999px;padding:2px 6px;margin-left:5px;font-size:8px;font-weight:900;white-space:nowrap}
      .tier-row-tag.cliff{border-color:#6d5a2e;color:var(--warn);background:rgba(255,198,92,.05)}
      .tier-cliff-panel{border:1px solid #315742;background:#09130e;border-radius:13px;padding:9px 10px;margin-top:9px}
      .tier-cliff-head{display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:9px;font-weight:900;letter-spacing:.09em;color:var(--accent)}
      .tier-cliff-body{margin-top:5px;color:var(--muted);font-size:10px;line-height:1.4}.tier-cliff-body strong{color:var(--text)}
      .tier-cliff-alert{color:var(--warn)!important}
    `;
    document.head.appendChild(style);

    document.querySelectorAll('.brand small').forEach(el => {
      el.textContent = el.textContent.replace(/v\d+\.\d+\.\d+/, `v${VERSION}`);
    });
    const footer = document.querySelector('footer');
    if (footer) footer.innerHTML = footer.innerHTML.replace(/v\d+\.\d+\.\d+/, `v${VERSION}`);

    function liveValue(player) {
      if (!player) return 0;
      const score = Number(matrixScore(player) || 0);
      const vorp = window.ffmVorp?.evaluate ? Number(window.ffmVorp.evaluate(player)?.vorp || 0) : 0;
      return score + vorp * 0.18;
    }

    function median(values) {
      const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
      if (!nums.length) return 0;
      const mid = Math.floor(nums.length / 2);
      return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
    }

    function classify(players) {
      const items = players.map(player => ({ player, value: liveValue(player) }));
      const gaps = [];
      for (let i = 0; i < items.length - 1; i++) gaps.push(Math.max(0, items[i].value - items[i + 1].value));
      const normalGap = Math.max(0.8, median(gaps.slice(0, Math.min(30, gaps.length))));
      const cliffThreshold = Math.max(3.0, normalGap * 2.2);
      const tierThreshold = Math.max(4.2, normalGap * 3.0);

      let tier = 1;
      let anchor = items[0]?.value ?? 0;
      for (let i = 0; i < items.length; i++) {
        if (i > 0) {
          const priorGap = Math.max(0, items[i - 1].value - items[i].value);
          const drift = Math.max(0, anchor - items[i].value);
          if (priorGap >= cliffThreshold || drift >= tierThreshold) {
            tier += 1;
            anchor = items[i].value;
          }
        }
        items[i].tier = tier;
        items[i].gapAfter = i < items.length - 1 ? Math.max(0, items[i].value - items[i + 1].value) : 0;
        items[i].cliffAfter = items[i].gapAfter >= cliffThreshold;
      }
      return { items, cliffThreshold, normalGap };
    }

    function currentBoardPlayers() {
      const rows = [...document.querySelectorAll('#draftList .row[data-player]')];
      return rows.map(row => state.players.find(p => p.id === row.dataset.player)).filter(Boolean);
    }

    function decorateBoard() {
      const list = document.getElementById('draftList');
      if (!list) return;
      list.querySelectorAll('.tier-divider').forEach(el => el.remove());
      list.querySelectorAll('.tier-row-tag').forEach(el => el.remove());
      list.querySelectorAll('.tier-row').forEach(el => el.classList.remove('tier-row', 'cliff-after'));

      const players = currentBoardPlayers();
      if (!players.length) return;
      const analysis = classify(players);
      const byId = new Map(analysis.items.map(item => [item.player.id, item]));
      let previousTier = null;

      for (const row of [...list.querySelectorAll('.row[data-player]')]) {
        const item = byId.get(row.dataset.player);
        if (!item) continue;
        row.classList.add('tier-row');
        if (item.cliffAfter) row.classList.add('cliff-after');

        if (item.tier !== previousTier) {
          const divider = document.createElement('div');
          const cameAfterCliff = previousTier !== null;
          divider.className = `tier-divider${cameAfterCliff ? ' cliff' : ''}`;
          divider.innerHTML = `<span class="tier-badge">TIER ${item.tier}${cameAfterCliff ? ' · VALUE DROP' : ''}</span>`;
          row.before(divider);
          previousTier = item.tier;
        }

        const meta = row.querySelector('.rmeta');
        if (meta) {
          const tag = document.createElement('span');
          tag.className = 'tier-row-tag';
          tag.textContent = `T${item.tier}`;
          meta.appendChild(tag);
          if (item.cliffAfter) {
            const cliff = document.createElement('span');
            cliff.className = 'tier-row-tag cliff';
            cliff.textContent = `CLIFF −${item.gapAfter.toFixed(1)}`;
            meta.appendChild(cliff);
          }
        }
      }
    }

    function decorateBestPick() {
      const card = document.getElementById('draftPick');
      const pick = typeof bestDraftPlayer === 'function' ? bestDraftPlayer() : null;
      if (!card || !pick) return;
      card.querySelectorAll('.tier-cliff-panel').forEach(el => el.remove());

      const pos = document.getElementById('position')?.value || 'ALL';
      const search = document.getElementById('draftSearch')?.value || '';
      const pool = typeof getBoardPlayers === 'function' ? getBoardPlayers(pos, search) : [];
      const ranked = [...pool].sort((a, b) => matrixScore(b) - matrixScore(a)).slice(0, 60);
      if (!ranked.length) return;
      const analysis = classify(ranked);
      const current = analysis.items.find(item => item.player.id === pick.id) || analysis.items[0];
      const sameTier = analysis.items.filter(item => item.tier === current.tier);
      const remainingInTier = Math.max(0, sameTier.length - sameTier.findIndex(item => item.player.id === pick.id));
      const currentIndex = analysis.items.indexOf(current);
      const nextCliff = analysis.items.find((item, idx) => idx >= currentIndex && item.cliffAfter);

      const panel = document.createElement('div');
      panel.className = 'tier-cliff-panel';
      const positionLabel = pos === 'ALL' ? 'board' : pos;
      let body = `<strong>${esc(pick.name)}</strong> sits in Tier ${current.tier}. ${remainingInTier} player${remainingInTier === 1 ? '' : 's'} remain in this ${positionLabel} tier from this point.`;
      if (nextCliff) {
        const nextIndex = analysis.items.indexOf(nextCliff) + 1;
        const playersBeforeDrop = Math.max(1, nextIndex - currentIndex);
        body += ` <span class="tier-cliff-alert"><strong>Value cliff:</strong> projected ${nextCliff.gapAfter.toFixed(1)}-point drop after ${playersBeforeDrop} more player${playersBeforeDrop === 1 ? '' : 's'}.</span>`;
      } else {
        body += ` No sharp value cliff is detected in the visible pool.`;
      }
      panel.innerHTML = `<div class="tier-cliff-head"><span>LIVE TIER MAP</span><span>TIER ${current.tier}</span></div><div class="tier-cliff-body">${body}</div>`;

      const why = card.querySelector('.why');
      if (why) why.insertAdjacentElement('beforebegin', panel);
      else card.appendChild(panel);
    }

    function refreshTierUI() {
      decorateBoard();
      decorateBestPick();
    }

    const previousRenderDraftList = renderDraftList;
    renderDraftList = function tierDraftList() {
      const result = previousRenderDraftList();
      decorateBoard();
      return result;
    };

    const previousRenderDraftPick = renderDraftPick;
    renderDraftPick = function tierDraftPick() {
      const result = previousRenderDraftPick();
      decorateBestPick();
      return result;
    };

    const previousRenderAll = renderAll;
    renderAll = function tierRenderAll() {
      const result = previousRenderAll();
      decorateBoard();
      decorateBestPick();
      return result;
    };

    document.getElementById('position')?.addEventListener('change', () => setTimeout(refreshTierUI, 0));
    document.getElementById('round')?.addEventListener('change', () => setTimeout(refreshTierUI, 0));
    document.getElementById('draftSearch')?.addEventListener('input', () => setTimeout(refreshTierUI, 0));
    document.getElementById('saveSettings')?.addEventListener('click', () => setTimeout(refreshTierUI, 0));
    document.getElementById('resetDraft')?.addEventListener('click', () => setTimeout(refreshTierUI, 0));

    window.ffmTiers = Object.freeze({ classify });
    refreshTierUI();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady, { once: true });
  else setTimeout(onReady, 0);
})();
