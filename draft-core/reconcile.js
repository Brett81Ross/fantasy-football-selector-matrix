(function (root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('./contracts')
    : root.FFMDraftContracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMDraftReconcile = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (contracts) {
  'use strict';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function text(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function reconcileDraftState({ previousState, authoritativePicks, playerPool = [], now }) {
    if (!previousState || typeof previousState !== 'object') throw new TypeError('previousState is required');
    if (!Array.isArray(authoritativePicks)) throw new TypeError('authoritativePicks must be an array');
    if (!Array.isArray(playerPool)) throw new TypeError('playerPool must be an array');

    const picks = clone(authoritativePicks).sort((a, b) => Number(a.overall || 0) - Number(b.overall || 0));
    const pickValidation = contracts?.validatePickEvents?.(picks);
    if (pickValidation && !pickValidation.ok) throw new Error(`invalid authoritative picks: ${pickValidation.errors.join('; ')}`);

    const playerMap = new Map(playerPool.map(player => [text(player.id), player]));
    const draftedPlayerIds = picks.map(pick => text(pick.playerId)).filter(Boolean);
    const drafted = new Set(draftedPlayerIds);
    const availablePlayerIds = playerPool
      .map(player => text(player.id))
      .filter(Boolean)
      .filter(playerId => !drafted.has(playerId));

    const myTeamId = previousState.myTeamId === null ? null : text(previousState.myTeamId);
    const myRoster = picks
      .filter(pick => myTeamId && text(pick.teamId) === myTeamId)
      .map(pick => ({
        playerId: text(pick.playerId),
        slotId: 'UNASSIGNED',
        position: text(playerMap.get(text(pick.playerId))?.position) || 'UNKNOWN'
      }));

    const timestamp = text(now) || new Date().toISOString();
    const next = {
      ...clone(previousState),
      picks,
      draftedPlayerIds,
      availablePlayerIds,
      myRoster,
      recentPicks: clone(picks.slice(-5)),
      sync: {
        ...(previousState.sync && typeof previousState.sync === 'object' ? clone(previousState.sync) : {}),
        status: 'live',
        lastSuccessfulSyncAt: timestamp,
        lastAttemptAt: timestamp,
        consecutiveFailures: 0
      }
    };

    const validation = contracts?.validateDraftState?.(next);
    if (validation && !validation.ok) throw new Error(`invalid reconciled DraftState: ${validation.errors.join('; ')}`);
    return next;
  }

  return { reconcileDraftState };
});