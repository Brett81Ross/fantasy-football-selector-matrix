(function (root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('./contracts')
    : root.FFMDraftContracts;
  const seasonContracts = typeof module === 'object' && module.exports
    ? require('../season-core/contracts')
    : root.FFMSeasonContracts;
  const api = factory(contracts, seasonContracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMSleeperDraftProvider = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (contracts, seasonContracts) {
  'use strict';

  const API = 'https://api.sleeper.app/v1';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function text(value) {
    return value === null || value === undefined ? '' : String(value).trim();
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

  function canonicalTeam(value) {
    const team = text(value).toUpperCase();
    return team === 'WAS' ? 'WSH' : team;
  }

  function normalizeName(value) {
    return text(value)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  function eligiblePositions(type) {
    switch (type) {
      case 'FLEX': return ['RB', 'WR', 'TE'];
      case 'SUPER_FLEX': return ['QB', 'RB', 'WR', 'TE'];
      case 'WRRB_FLEX': return ['RB', 'WR'];
      case 'REC_FLEX': return ['WR', 'TE'];
      case 'BN': return ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
      case 'IR': return ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
      case 'DEF': return ['DST'];
      default: return [type];
    }
  }

  function canonicalType(type) {
    return type === 'DEF' ? 'DST' : type;
  }

  function normalizeRosterPositions(rawPositions) {
    const counts = new Map();
    for (const raw of Array.isArray(rawPositions) ? rawPositions : []) {
      const rawType = text(raw).toUpperCase();
      if (!rawType) continue;
      counts.set(rawType, (counts.get(rawType) || 0) + 1);
    }
    return [...counts.entries()].map(([rawType, count]) => {
      const type = canonicalType(rawType);
      return {
        id: type,
        type,
        count,
        eligiblePositions: eligiblePositions(rawType),
        isBench: rawType === 'BN',
        isReserve: rawType === 'IR'
      };
    });
  }

  function mapDraftType(value) {
    const type = text(value).toLowerCase();
    if (type === 'auction') return 'auction';
    if (type === 'linear') return 'linear';
    return 'snake';
  }

  function mapDraftStatus(value) {
    const status = text(value).toLowerCase();
    if (status === 'complete' || status === 'completed') return 'completed';
    if (status === 'drafting' || status === 'in_progress') return 'live';
    if (status === 'paused') return 'paused';
    if (status === 'pre_draft' || status === 'not_started') return 'pre_draft';
    return 'not_started';
  }

  function sleeperPoints(settings, field) {
    const whole = nonNegativeNumber(settings?.[field], null);
    if (whole === null) return null;
    const decimal = nonNegativeNumber(settings?.[`${field}_decimal`], 0);
    return Math.round((whole + decimal / 100) * 100) / 100;
  }

  function sleeperRecord(settings) {
    const wins = nonNegativeNumber(settings?.wins, null);
    const losses = nonNegativeNumber(settings?.losses, null);
    const ties = nonNegativeNumber(settings?.ties, null);
    if (wins === null || losses === null || ties === null) return null;
    return {
      wins: Math.floor(wins),
      losses: Math.floor(losses),
      ties: Math.floor(ties),
      pointsFor: sleeperPoints(settings, 'fpts'),
      pointsAgainst: sleeperPoints(settings, 'fpts_against')
    };
  }

  function scheduleRowsForWeek(week, rawMatchups) {
    const groups = new Map();
    for (const item of Array.isArray(rawMatchups) ? rawMatchups : []) {
      const rosterId = text(item?.roster_id);
      const matchupId = text(item?.matchup_id);
      if (!rosterId || !matchupId) continue;
      if (!groups.has(matchupId)) groups.set(matchupId, []);
      groups.get(matchupId).push(rosterId);
    }
    const rows = [];
    for (const [matchupId, rosterIds] of groups) {
      const unique = [...new Set(rosterIds)];
      if (unique.length !== 2) continue;
      rows.push({ week, rosterId:unique[0], opponentRosterId:unique[1], matchupId });
      rows.push({ week, rosterId:unique[1], opponentRosterId:unique[0], matchupId });
    }
    return rows;
  }

  function createSleeperDraftProvider(options = {}) {
    const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    let username = '';
    let season = 0;
    let user = null;
    let leagues = [];
    let pool = [];
    let sleeperDirectory = null;
    let sleeperToMatrix = new Map();

    if (!fetchImpl) throw new Error('Sleeper provider requires fetch');

    async function fetchJson(url, label) {
      const response = await fetchImpl(url, { headers: { accept: 'application/json' } });
      if (!response || !response.ok) throw new Error(`${label} request failed${response ? ` (${response.status})` : ''}`);
      return response.json();
    }

    function requireConnected() {
      if (!user) throw new Error('Sleeper provider is not connected');
    }

    function playerMap() {
      return new Map(pool.map(player => [text(player.id), player]));
    }

    function rebuildSleeperCrosswalk() {
      const next = new Map();
      for (const player of pool) {
        const sleeperId = text(player?.sleeperId ?? player?.sleeper_id);
        const matrixId = text(player?.id);
        if (sleeperId && matrixId) next.set(sleeperId, matrixId);
      }
      sleeperToMatrix = next;
    }

    function resolveSleeperPlayerId(item) {
      const rawId = text(item?.player_id);
      const direct = sleeperToMatrix.get(rawId);
      if (direct) return direct;
      const metadata = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
      const rawPosition = text(metadata.position).toUpperCase();
      const position = canonicalType(rawPosition);
      const team = canonicalTeam(metadata.team || rawId);

      if (position === 'DST') return team ? `DST-${team}` : rawId;

      const byId = playerMap();
      if (byId.has(rawId)) return rawId;

      const sleeperName = normalizeName(`${text(metadata.first_name)} ${text(metadata.last_name)}`);
      if (!sleeperName) return rawId;
      const matches = pool.filter(player => normalizeName(player?.name) === sleeperName);
      if (!matches.length) return rawId;
      if (matches.length === 1) return text(matches[0].id) || rawId;

      const strict = matches.find(player => {
        const playerPosition = canonicalType(text(player?.position).toUpperCase());
        const playerTeam = canonicalTeam(player?.team);
        return (!position || playerPosition === position) && (!team || playerTeam === team);
      });
      if (strict) return text(strict.id) || rawId;

      const positional = matches.find(player => canonicalType(text(player?.position).toUpperCase()) === position);
      return text(positional?.id || matches[0]?.id) || rawId;
    }

    async function getSleeperDirectory() {
      if (sleeperDirectory) return sleeperDirectory;
      const raw = await fetchJson(`${API}/players/nfl`, 'Sleeper player directory');
      sleeperDirectory = raw && typeof raw === 'object' ? raw : {};
      return sleeperDirectory;
    }

    function resolveRosterPlayerId(rawId, directory) {
      const id = text(rawId);
      if (!id) return '';
      const direct = sleeperToMatrix.get(id);
      if (direct) return direct;
      if (playerMap().has(id)) return id;
      const entry = directory && typeof directory === 'object' ? directory[id] : null;
      if (!entry || typeof entry !== 'object') return id;
      return resolveSleeperPlayerId({
        player_id: id,
        metadata: {
          first_name: entry.first_name,
          last_name: entry.last_name,
          position: entry.position,
          team: entry.team
        }
      });
    }

    function rawPlayerStatus(entry) {
      if (!entry || typeof entry !== 'object') return 'Unknown';
      return text(entry.injury_status || entry.status) || 'Unknown';
    }

    async function completedRosterSnapshot(leagueId, myTeamId) {
      const [rawRosters, directory] = await Promise.all([
        fetchJson(`${API}/league/${encodeURIComponent(leagueId)}/rosters`, 'Sleeper rosters'),
        getSleeperDirectory()
      ]);
      const rosters = Array.isArray(rawRosters) ? rawRosters : [];
      const rostered = new Set();
      let mine = [];
      for (const roster of rosters) {
        const rawPlayers = [...new Set([
          ...(Array.isArray(roster?.players) ? roster.players : []),
          ...(Array.isArray(roster?.reserve) ? roster.reserve : [])
        ].map(text).filter(Boolean))];
        const resolved = rawPlayers.map(id => resolveRosterPlayerId(id, directory)).filter(Boolean);
        resolved.forEach(id => rostered.add(id));
        if (text(roster?.roster_id) === text(myTeamId)) mine = resolved;
      }
      return { rosteredPlayerIds: [...rostered], myPlayerIds: mine };
    }

    async function draftObject(draftId) {
      return fetchJson(`${API}/draft/${encodeURIComponent(draftId)}`, 'Sleeper draft');
    }

    function orderFromDraft(draft) {
      const slotMap = draft && draft.slot_to_roster_id && typeof draft.slot_to_roster_id === 'object'
        ? draft.slot_to_roster_id
        : {};
      return Object.keys(slotMap)
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b)
        .map(slot => text(slotMap[String(slot)] || slotMap[slot]))
        .filter(Boolean);
    }

    function teamOnClock(draft, overall) {
      const order = orderFromDraft(draft);
      if (!order.length) return undefined;
      const teams = positiveInt(draft?.settings?.teams, order.length);
      const round = Math.floor((overall - 1) / teams) + 1;
      const within = ((overall - 1) % teams);
      const index = mapDraftType(draft?.type) === 'snake' && round % 2 === 0
        ? order.length - 1 - within
        : within;
      return order[index];
    }

    function myTeamIdFromDraft(draft) {
      const slot = draft && draft.draft_order ? draft.draft_order[user.user_id] : null;
      if (slot === null || slot === undefined) return null;
      const rosterId = draft?.slot_to_roster_id?.[String(slot)] ?? draft?.slot_to_roster_id?.[slot];
      return rosterId === null || rosterId === undefined ? null : text(rosterId);
    }

    function picksUntilMine(draft, nextOverall, myTeamId) {
      if (!myTeamId) return null;
      const teams = positiveInt(draft?.settings?.teams, orderFromDraft(draft).length || 1);
      for (let offset = 0; offset < teams * 2; offset += 1) {
        if (teamOnClock(draft, nextOverall + offset) === myTeamId) return offset;
      }
      return null;
    }

    async function normalizeLeague(raw) {
      const leagueId = text(raw?.league_id);
      const draftId = text(raw?.draft_id);
      const draft = draftId ? await draftObject(draftId) : null;
      const waiverBudgetTotal = nonNegativeNumber(raw?.settings?.waiver_budget, null);
      const league = {
        leagueId,
        platform: 'sleeper',
        season: positiveInt(raw?.season, season),
        scoring: raw?.scoring_settings && typeof raw.scoring_settings === 'object' ? clone(raw.scoring_settings) : {},
        teams: positiveInt(raw?.total_rosters, positiveInt(draft?.settings?.teams, 0)),
        draftType: mapDraftType(draft?.type),
        rosterSlots: normalizeRosterPositions(raw?.roster_positions),
        waiverBudgetTotal,
        waiverType: waiverBudgetTotal === null ? 'unknown' : 'faab',
        playoffWeekStart: positiveInt(raw?.settings?.playoff_week_start, 0) || null,
        playoffTeams: positiveInt(raw?.settings?.playoff_teams, 0) || null
      };
      const validation = contracts?.validateLeagueSettings?.(league);
      if (validation && !validation.ok) throw new Error(`invalid Sleeper league: ${validation.errors.join('; ')}`);
      return league;
    }

    async function canonicalPicks(draftId, draft) {
      const raw = await fetchJson(`${API}/draft/${encodeURIComponent(draftId)}/picks`, 'Sleeper picks');
      const teams = positiveInt(draft?.settings?.teams, 1);
      const picks = (Array.isArray(raw) ? raw : [])
        .map(item => {
          const overall = positiveInt(item?.pick_no, 0);
          return {
            pickId: `${draftId}:${overall}`,
            draftId,
            overall,
            round: positiveInt(item?.round, Math.floor((overall - 1) / teams) + 1),
            pickInRound: ((overall - 1) % teams) + 1,
            playerId: resolveSleeperPlayerId(item),
            teamId: text(item?.roster_id ?? item?.picked_by),
            source: 'sleeper'
          };
        })
        .sort((a, b) => a.overall - b.overall);
      const validation = contracts?.validatePickEvents?.(picks);
      if (validation && !validation.ok) throw new Error(`invalid Sleeper picks: ${validation.errors.join('; ')}`);
      return picks;
    }

    return {
      platform: 'sleeper',

      async connect(input) {
        username = text(input?.username);
        season = positiveInt(input?.season, new Date().getUTCFullYear());
        pool = Array.isArray(input?.playerPool) ? clone(input.playerPool) : [];
        rebuildSleeperCrosswalk();
        sleeperDirectory = null;
        if (!username) throw new Error('Sleeper username is required');
        let resolved;
        try {
          resolved = await fetchJson(`${API}/user/${encodeURIComponent(username)}`, 'Sleeper user');
        } catch (error) {
          throw new Error(`Sleeper user could not be resolved: ${error.message}`);
        }
        if (!resolved || !text(resolved.user_id)) throw new Error('Sleeper user could not be resolved');
        user = resolved;
        const rawLeagues = await fetchJson(`${API}/user/${encodeURIComponent(user.user_id)}/leagues/nfl/${season}`, 'Sleeper leagues');
        leagues = Array.isArray(rawLeagues) ? rawLeagues : [];
      },

      async listLeagues() {
        requireConnected();
        return leagues.map(raw => ({
          leagueId: text(raw.league_id),
          name: text(raw.name),
          season: positiveInt(raw.season, season),
          teams: positiveInt(raw.total_rosters, 0),
          draftId: text(raw.draft_id),
          platform: 'sleeper'
        }));
      },

      async loadLeague(leagueId) {
        requireConnected();
        const raw = await fetchJson(`${API}/league/${encodeURIComponent(leagueId)}`, 'Sleeper league');
        return normalizeLeague(raw);
      },

      async loadPicks(draftId) {
        requireConnected();
        const draft = await draftObject(draftId);
        return canonicalPicks(text(draftId), draft);
      },

      async loadSeasonSnapshot(leagueId) {
        requireConnected();
        if (!seasonContracts?.normalizeLeagueSnapshot) throw new Error('Season contracts are unavailable');
        const id = text(leagueId);
        if (!id) throw new Error('Sleeper season snapshot requires leagueId');

        const [rawLeague, nflState, rawRosters, directory] = await Promise.all([
          fetchJson(`${API}/league/${encodeURIComponent(id)}`, 'Sleeper league'),
          fetchJson(`${API}/state/nfl`, 'Sleeper NFL state'),
          fetchJson(`${API}/league/${encodeURIComponent(id)}/rosters`, 'Sleeper rosters'),
          getSleeperDirectory()
        ]);
        const league = await normalizeLeague(rawLeague);
        const week = positiveInt(nflState?.week, 0);
        const rawMatchups = week
          ? await fetchJson(`${API}/league/${encodeURIComponent(id)}/matchups/${week}`, 'Sleeper matchups')
          : [];
        const matchups = Array.isArray(rawMatchups) ? rawMatchups : [];
        const matchupByRoster = new Map(matchups.map(item => [text(item?.roster_id), item]));

        const expectedWeeks = [];
        if (week && league.playoffWeekStart && week < league.playoffWeekStart) {
          for (let futureWeek = week + 1; futureWeek < league.playoffWeekStart; futureWeek += 1) expectedWeeks.push(futureWeek);
        }
        const futureResults = await Promise.allSettled(expectedWeeks.map(async futureWeek => ({
          week: futureWeek,
          matchups: await fetchJson(`${API}/league/${encodeURIComponent(id)}/matchups/${futureWeek}`, `Sleeper matchups week ${futureWeek}`)
        })));
        const loadedWeeks = [];
        const remainingSchedule = [];
        for (const result of futureResults) {
          if (result.status !== 'fulfilled') continue;
          loadedWeeks.push(result.value.week);
          remainingSchedule.push(...scheduleRowsForWeek(result.value.week, result.value.matchups));
        }

        let myRosterId = null;
        const rosters = (Array.isArray(rawRosters) ? rawRosters : []).map(rawRoster => {
          const rosterId = text(rawRoster?.roster_id);
          if (text(rawRoster?.owner_id) === text(user?.user_id)) myRosterId = rosterId;
          const resolveList = values => [...new Set((Array.isArray(values) ? values : [])
            .map(value => resolveRosterPlayerId(value, directory))
            .filter(Boolean))];
          const matchup = matchupByRoster.get(rosterId);
          return {
            rosterId,
            ownerId: text(rawRoster?.owner_id) || null,
            playerIds: resolveList(rawRoster?.players),
            starterPlayerIds: resolveList(matchup?.starters || rawRoster?.starters),
            reservePlayerIds: resolveList(rawRoster?.reserve),
            waiverBudgetUsed: nonNegativeNumber(rawRoster?.settings?.waiver_budget_used, 0),
            waiverPosition: positiveInt(rawRoster?.settings?.waiver_position, 0) || null,
            record: sleeperRecord(rawRoster?.settings)
          };
        });

        let opponentRosterId = null;
        if (myRosterId) {
          const mine = matchupByRoster.get(myRosterId);
          const matchupId = mine?.matchup_id;
          if (matchupId !== null && matchupId !== undefined) {
            const opponent = matchups.find(item => text(item?.roster_id) !== myRosterId && item?.matchup_id === matchupId);
            opponentRosterId = opponent ? text(opponent.roster_id) : null;
          }
        }

        const poolIds = new Set(pool.map(player => text(player.id)).filter(Boolean));
        const playerStatuses = {};
        for (const [providerPlayerId, entry] of Object.entries(directory || {})) {
          const playerId = resolveRosterPlayerId(providerPlayerId, directory);
          if (!playerId || !poolIds.has(playerId)) continue;
          playerStatuses[playerId] = {
            raw: rawPlayerStatus(entry),
            providerPlayerId: text(providerPlayerId),
            source: 'sleeper'
          };
        }

        return seasonContracts.normalizeLeagueSnapshot({
          league,
          week,
          myRosterId,
          opponentRosterId,
          rosters,
          playerPool: pool,
          playerStatuses,
          remainingSchedule,
          scheduleCoverage: {
            expectedWeeks,
            loadedWeeks,
            complete: loadedWeeks.length === expectedWeeks.length
          },
          freshness: {
            status: 'fresh',
            asOf: new Date().toISOString(),
            source: 'sleeper'
          }
        });
      },

      async loadDraft(draftId) {
        requireConnected();
        const id = text(draftId);
        const draft = await draftObject(id);
        const rawLeague = await fetchJson(`${API}/league/${encodeURIComponent(draft.league_id)}`, 'Sleeper league');
        const league = await normalizeLeague(rawLeague);
        const picks = await canonicalPicks(id, draft);
        const status = mapDraftStatus(draft.status);
        const mine = myTeamIdFromDraft(draft);
        const players = playerMap();

        let unavailablePlayerIds = picks.map(pick => pick.playerId);
        let myPlayerIds = picks.filter(pick => pick.teamId === mine).map(pick => pick.playerId);
        if (status === 'completed') {
          const snapshot = await completedRosterSnapshot(draft.league_id, mine);
          unavailablePlayerIds = snapshot.rosteredPlayerIds;
          myPlayerIds = snapshot.myPlayerIds;
        }

        const unavailable = new Set(unavailablePlayerIds);
        const availablePlayerIds = pool
          .map(player => text(player.id))
          .filter(Boolean)
          .filter(playerId => !unavailable.has(playerId));
        const myRoster = myPlayerIds.map(playerId => ({
          playerId,
          slotId: 'UNASSIGNED',
          position: text(players.get(playerId)?.position) || 'UNKNOWN'
        }));
        const nextOverall = picks.length + 1;
        const teams = positiveInt(draft?.settings?.teams, league.teams);
        const currentPick = {
          overall: nextOverall,
          round: Math.floor((nextOverall - 1) / teams) + 1,
          pickInRound: ((nextOverall - 1) % teams) + 1,
          onTheClockTeamId: teamOnClock(draft, nextOverall)
        };
        const state = {
          draftId: id,
          league,
          status,
          myTeamId: mine,
          currentPick: status === 'completed' ? null : currentPick,
          picksUntilMyNext: status === 'completed' ? null : picksUntilMine(draft, nextOverall, mine),
          teams: orderFromDraft(draft).map(teamId => ({ teamId })),
          picks,
          draftedPlayerIds: unavailablePlayerIds,
          availablePlayerIds,
          myRoster,
          recentPicks: picks.slice(-5),
          sync: {
            status: 'live',
            lastSuccessfulSyncAt: new Date().toISOString(),
            lastAttemptAt: new Date().toISOString(),
            consecutiveFailures: 0
          }
        };
        const validation = contracts?.validateDraftState?.(state);
        if (validation && !validation.ok) throw new Error(`invalid Sleeper DraftState: ${validation.errors.join('; ')}`);
        return state;
      }
    };
  }

  return {
    API,
    normalizeRosterPositions,
    createSleeperDraftProvider
  };
});