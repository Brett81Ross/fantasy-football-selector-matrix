(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMLiveDraftView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function text(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function baseSlotId(value) {
    return text(value).split(':')[0];
  }

  function displayType(type) {
    return type === 'DST' ? 'DEF' : type;
  }

  function buildRosterChips(rosterSlots, assignments) {
    const assigned = Array.isArray(assignments) ? assignments : [];
    return (Array.isArray(rosterSlots) ? rosterSlots : []).map(slot => {
      const id = text(slot?.id);
      const type = text(slot?.type);
      const target = Math.max(0, Math.floor(Number(slot?.count) || 0));
      const filled = assigned.filter(item => baseSlotId(item?.slotId) === id).length;
      const label = slot?.isBench === true ? 'BN' : displayType(type || id);
      if (!slot?.isBench && target > 0 && filled >= target) return `${label} ✅`;
      return `${label} ${filled}/${target}`;
    });
  }

  function buildRecentPicks(recentPicks, playerNames, myTeamId) {
    const names = playerNames && typeof playerNames === 'object' ? playerNames : {};
    return (Array.isArray(recentPicks) ? recentPicks : [])
      .slice()
      .sort((a, b) => Number(b?.overall || 0) - Number(a?.overall || 0))
      .slice(0, 5)
      .map(pick => {
        const playerId = text(pick?.playerId);
        const name = text(names[playerId]) || playerId || 'Unknown player';
        const mine = text(myTeamId) && text(pick?.teamId) === text(myTeamId) ? ' · MINE' : '';
        return `#${Number(pick?.overall || 0)} ${name}${mine}`;
      });
  }

  function buildLiveDraftView(input = {}) {
    const syncStatus = text(input.sync?.status).toUpperCase() || 'MANUAL';
    const syncLabel = ['LIVE', 'STALE', 'DISCONNECTED', 'MANUAL'].includes(syncStatus) ? syncStatus : 'MANUAL';
    const rosterChips = buildRosterChips(input.rosterSlots, input.assignments);
    const recentPicks = buildRecentPicks(input.recentPicks, input.playerNames, input.myTeamId);
    const completed = text(input.draftStatus).toLowerCase() === 'completed';

    if (completed) {
      return {
        mode: 'post_draft',
        headline: 'DRAFT COMPLETE',
        playerName: '',
        position: '',
        slotLabel: '',
        score: null,
        reason: 'Final roster synced. Review Waivers for upgrades or Trade for roster improvements.',
        rosterChips,
        recentPicks,
        syncLabel,
        showDraftActions: false,
        actions: Object.freeze({ waivers: 'OPEN WAIVERS', trade: 'OPEN TRADE' })
      };
    }

    const recommendation = input.recommendation && typeof input.recommendation === 'object'
      ? input.recommendation
      : null;
    const position = text(recommendation?.position);
    const playerName = text(recommendation?.playerName) || text(recommendation?.playerId);
    const slotLabel = baseSlotId(recommendation?.slotId);

    return {
      mode: 'live_draft',
      headline: recommendation
        ? `BEST PICK: ${position || '—'} — ${playerName || 'No player'}`
        : 'BEST PICK: WAITING FOR DRAFT STATE',
      playerName,
      position,
      slotLabel,
      score: Number.isFinite(Number(recommendation?.score)) ? Number(recommendation.score) : null,
      reason: text(recommendation?.explanation) || 'The Matrix will update as the draft changes.',
      rosterChips,
      recentPicks,
      syncLabel,
      showDraftActions: true,
      actions: Object.freeze({ they: 'THEY TOOK HIM', mine: 'I TOOK HIM', undo: 'UNDO' })
    };
  }

  return { buildLiveDraftView, buildRosterChips, buildRecentPicks };
});