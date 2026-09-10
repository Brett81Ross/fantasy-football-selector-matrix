(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMSeasonContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function text(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function positiveInt(value, fallback = 0) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  }

  function nonNegativeNumber(value, fallback = null) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  function uniqueIds(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }

  function normalizeRoster(raw, waiverBudgetTotal = null) {
    const reservePlayerIds = uniqueIds(raw?.reservePlayerIds);
    const playerIds = uniqueIds([...(Array.isArray(raw?.playerIds) ? raw.playerIds : []), ...reservePlayerIds]);
    const playerSet = new Set(playerIds);
    const starterPlayerIds = uniqueIds(raw?.starterPlayerIds).filter(id => playerSet.has(id));
    const waiverBudgetUsed = nonNegativeNumber(raw?.waiverBudgetUsed, 0);
    const total = nonNegativeNumber(waiverBudgetTotal, null);
    return {
      rosterId: text(raw?.rosterId),
      ownerId: text(raw?.ownerId) || null,
      playerIds,
      starterPlayerIds,
      reservePlayerIds: reservePlayerIds.filter(id => playerSet.has(id)),
      waiverBudgetUsed,
      waiverBudgetRemaining: total === null ? null : Math.max(0, total - waiverBudgetUsed),
      waiverPosition: positiveInt(raw?.waiverPosition, 0) || null
    };
  }

  function normalizeLeagueSnapshot(input = {}) {
    if (!input.league || typeof input.league !== 'object') throw new Error('LeagueSnapshot requires league settings');
    const league = clone(input.league);
    if (!text(league.leagueId)) throw new Error('LeagueSnapshot requires leagueId');
    const waiverBudgetTotal = nonNegativeNumber(league.waiverBudgetTotal, null);
    league.waiverBudgetTotal = waiverBudgetTotal;
    league.waiverType = text(league.waiverType).toLowerCase() || (waiverBudgetTotal === null ? 'unknown' : 'faab');

    const rosters = (Array.isArray(input.rosters) ? input.rosters : []).map(roster => normalizeRoster(roster, waiverBudgetTotal));
    const rosterIds = new Set();
    for (const roster of rosters) {
      if (!roster.rosterId) throw new Error('LeagueSnapshot roster requires rosterId');
      if (rosterIds.has(roster.rosterId)) throw new Error(`duplicate rosterId: ${roster.rosterId}`);
      rosterIds.add(roster.rosterId);
    }

    const ownedPlayerIds = uniqueIds(rosters.flatMap(roster => roster.playerIds));
    const owned = new Set(ownedPlayerIds);
    const poolIds = uniqueIds((Array.isArray(input.playerPool) ? input.playerPool : []).map(player => player?.id ?? player));
    const freeAgentPlayerIds = poolIds.filter(id => !owned.has(id));

    const rawStatuses = input.playerStatuses && typeof input.playerStatuses === 'object' ? input.playerStatuses : {};
    const playerStatuses = {};
    for (const [playerId, status] of Object.entries(rawStatuses)) {
      const id = text(playerId);
      if (id) playerStatuses[id] = clone(status);
    }

    const freshnessInput = input.freshness && typeof input.freshness === 'object' ? input.freshness : {};
    const freshnessStatus = ['fresh', 'stale', 'disconnected', 'unknown'].includes(text(freshnessInput.status).toLowerCase())
      ? text(freshnessInput.status).toLowerCase()
      : 'unknown';

    return deepFreeze({
      league,
      week: positiveInt(input.week, 0),
      myRosterId: text(input.myRosterId) || null,
      opponentRosterId: text(input.opponentRosterId) || null,
      rosters,
      ownedPlayerIds,
      freeAgentPlayerIds,
      playerStatuses,
      freshness: {
        status: freshnessStatus,
        asOf: text(freshnessInput.asOf) || null,
        source: text(freshnessInput.source) || null
      }
    });
  }

  return { normalizeLeagueSnapshot, deepFreeze };
});
