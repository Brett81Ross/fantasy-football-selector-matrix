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
    if (value === null || value === undefined || value === '') return fallback;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  function finiteNumber(value, fallback = null) {
    if (value === null || value === undefined || value === '') return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function uniqueIds(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
  }

  function uniquePositiveInts(values) {
    return [...new Set((Array.isArray(values) ? values : []).map(value => positiveInt(value, 0)).filter(Boolean))].sort((a, b) => a - b);
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }

  function normalizeRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const wins = nonNegativeNumber(raw.wins, null);
    const losses = nonNegativeNumber(raw.losses, null);
    const ties = nonNegativeNumber(raw.ties, null);
    if (wins === null || losses === null || ties === null) return null;
    return {
      wins: Math.floor(wins),
      losses: Math.floor(losses),
      ties: Math.floor(ties),
      pointsFor: finiteNumber(raw.pointsFor, null),
      pointsAgainst: finiteNumber(raw.pointsAgainst, null)
    };
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
      waiverPosition: positiveInt(raw?.waiverPosition, 0) || null,
      record: normalizeRecord(raw?.record)
    };
  }

  function normalizeRemainingSchedule(rawSchedule, rosterIds) {
    const rows = [];
    const seen = new Set();
    for (const raw of Array.isArray(rawSchedule) ? rawSchedule : []) {
      const week = positiveInt(raw?.week, 0);
      const rosterId = text(raw?.rosterId);
      const opponentRosterId = text(raw?.opponentRosterId);
      if (!week || !rosterIds.has(rosterId) || !rosterIds.has(opponentRosterId) || rosterId === opponentRosterId) continue;
      const key = `${week}|${rosterId}|${opponentRosterId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        week,
        rosterId,
        opponentRosterId,
        matchupId: text(raw?.matchupId) || null
      });
    }
    return rows.sort((a, b) => a.week - b.week || a.rosterId.localeCompare(b.rosterId) || a.opponentRosterId.localeCompare(b.opponentRosterId));
  }

  function normalizeScheduleCoverage(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const expectedWeeks = uniquePositiveInts(input.expectedWeeks);
    const loadedWeeks = uniquePositiveInts(input.loadedWeeks).filter(week => !expectedWeeks.length || expectedWeeks.includes(week));
    const complete = expectedWeeks.length
      ? expectedWeeks.length === loadedWeeks.length && expectedWeeks.every(week => loadedWeeks.includes(week))
      : Boolean(input.complete);
    return { expectedWeeks, loadedWeeks, complete };
  }

  function normalizeLeagueSnapshot(input = {}) {
    if (!input.league || typeof input.league !== 'object') throw new Error('LeagueSnapshot requires league settings');
    const league = clone(input.league);
    if (!text(league.leagueId)) throw new Error('LeagueSnapshot requires leagueId');
    const waiverBudgetTotal = nonNegativeNumber(league.waiverBudgetTotal, null);
    league.waiverBudgetTotal = waiverBudgetTotal;
    league.waiverType = text(league.waiverType).toLowerCase() || (waiverBudgetTotal === null ? 'unknown' : 'faab');
    league.playoffWeekStart = positiveInt(league.playoffWeekStart, 0) || null;
    league.playoffTeams = positiveInt(league.playoffTeams, 0) || null;

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
      remainingSchedule: normalizeRemainingSchedule(input.remainingSchedule, rosterIds),
      scheduleCoverage: normalizeScheduleCoverage(input.scheduleCoverage),
      freshness: {
        status: freshnessStatus,
        asOf: text(freshnessInput.asOf) || null,
        source: text(freshnessInput.source) || null
      }
    });
  }

  return { normalizeLeagueSnapshot, deepFreeze };
});
