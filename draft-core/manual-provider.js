(function (root, factory) {
  const contracts = typeof module === 'object' && module.exports
    ? require('./contracts')
    : root.FFMDraftContracts;
  const api = factory(contracts);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMManualDraftProvider = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (contracts) {
  'use strict';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function createManualDraftProvider() {
    let config = null;
    let picks = [];

    function requireConnected() {
      if (!config) throw new Error('manual provider is not connected');
    }

    function assertDraftId(draftId) {
      requireConnected();
      if (text(draftId) !== config.draftId) throw new Error(`unknown draftId ${draftId}`);
    }

    function playerMap() {
      return new Map(config.playerPool.map(player => [player.id, player]));
    }

    function teamIds() {
      return config.teams.map(team => team.teamId);
    }

    function pickCoordinates(overall) {
      const teams = config.league.teams;
      return {
        overall,
        round: Math.floor((overall - 1) / teams) + 1,
        pickInRound: ((overall - 1) % teams) + 1
      };
    }

    function teamOnClock(overall) {
      const ids = teamIds();
      if (!ids.length) return undefined;
      const coordinates = pickCoordinates(overall);
      const index = coordinates.round % 2 === 1
        ? coordinates.pickInRound - 1
        : ids.length - coordinates.pickInRound;
      return ids[index];
    }

    function picksUntilMyNext(overall) {
      if (!config.myTeamId) return null;
      const maxSearch = Math.max(1, config.league.teams * 2);
      for (let offset = 0; offset < maxSearch; offset += 1) {
        if (teamOnClock(overall + offset) === config.myTeamId) return offset;
      }
      return null;
    }

    function materializeState() {
      requireConnected();
      const draftedPlayerIds = picks.map(pick => pick.playerId);
      const drafted = new Set(draftedPlayerIds);
      const availablePlayerIds = config.playerPool
        .map(player => player.id)
        .filter(playerId => !drafted.has(playerId));
      const players = playerMap();
      const myRoster = picks
        .filter(pick => pick.teamId === config.myTeamId)
        .map(pick => ({
          playerId: pick.playerId,
          slotId: 'UNASSIGNED',
          position: players.get(pick.playerId)?.position || 'UNKNOWN'
        }));
      const nextOverall = picks.length + 1;
      const coordinates = pickCoordinates(nextOverall);
      const state = {
        draftId: config.draftId,
        league: clone(config.league),
        status: 'live',
        myTeamId: config.myTeamId,
        currentPick: {
          ...coordinates,
          onTheClockTeamId: teamOnClock(nextOverall)
        },
        picksUntilMyNext: picksUntilMyNext(nextOverall),
        teams: clone(config.teams),
        picks: clone(picks),
        draftedPlayerIds,
        availablePlayerIds,
        myRoster,
        recentPicks: clone(picks.slice(-5)),
        sync: {
          status: 'manual',
          lastSuccessfulSyncAt: null,
          lastAttemptAt: null,
          consecutiveFailures: 0
        }
      };
      const validation = contracts?.validateDraftState?.(state);
      if (validation && !validation.ok) throw new Error(`invalid manual DraftState: ${validation.errors.join('; ')}`);
      return state;
    }

    const provider = {
      platform: 'manual',

      async connect(input) {
        const source = input && typeof input === 'object' ? input : {};
        const league = clone(source.league || {});
        const leagueValidation = contracts?.validateLeagueSettings?.(league);
        if (leagueValidation && !leagueValidation.ok) throw new Error(`invalid league settings: ${leagueValidation.errors.join('; ')}`);
        if (league.platform !== 'manual') throw new Error('manual provider requires league.platform = manual');
        if (!text(source.draftId)) throw new Error('draftId is required');
        if (!Array.isArray(source.teams) || source.teams.length !== league.teams) throw new Error('teams must match league.teams');
        if (!Array.isArray(source.playerPool) || source.playerPool.length === 0) throw new Error('playerPool must contain players');
        const ids = new Set();
        for (const player of source.playerPool) {
          if (!text(player?.id)) throw new Error('every player requires an id');
          if (ids.has(player.id)) throw new Error(`duplicate player id ${player.id}`);
          ids.add(player.id);
        }
        const knownTeams = new Set(source.teams.map(team => text(team?.teamId)).filter(Boolean));
        if (knownTeams.size !== league.teams) throw new Error('every team requires a unique teamId');
        const myTeamId = source.myTeamId === null ? null : text(source.myTeamId);
        if (myTeamId && !knownTeams.has(myTeamId)) throw new Error('myTeamId must identify one of the manual teams');

        config = {
          league,
          draftId: text(source.draftId),
          myTeamId,
          teams: clone(source.teams),
          playerPool: clone(source.playerPool)
        };
        picks = [];
      },

      async listLeagues() {
        requireConnected();
        return [{
          leagueId: config.league.leagueId,
          platform: 'manual',
          season: config.league.season,
          teams: config.league.teams
        }];
      },

      async loadLeague(leagueId) {
        requireConnected();
        if (text(leagueId) !== config.league.leagueId) throw new Error(`unknown leagueId ${leagueId}`);
        return clone(config.league);
      },

      async loadDraft(draftId) {
        assertDraftId(draftId);
        return materializeState();
      },

      async loadPicks(draftId) {
        assertDraftId(draftId);
        return clone(picks);
      },

      async recordPick(input) {
        requireConnected();
        const playerId = text(input?.playerId);
        const teamId = text(input?.teamId);
        const players = playerMap();
        if (!players.has(playerId)) throw new Error(`unknown player ${playerId}`);
        if (!teamIds().includes(teamId)) throw new Error(`unknown team ${teamId}`);
        if (picks.some(pick => pick.playerId === playerId)) throw new Error(`player ${playerId} is already drafted`);
        const overall = picks.length + 1;
        const coords = pickCoordinates(overall);
        const pick = {
          pickId: `${config.draftId}:${overall}`,
          draftId: config.draftId,
          ...coords,
          playerId,
          teamId,
          source: 'manual'
        };
        picks.push(pick);
        return clone(pick);
      },

      async undoLastPick() {
        requireConnected();
        const pick = picks.pop() || null;
        return clone(pick);
      }
    };

    return provider;
  }

  return { createManualDraftProvider };
});