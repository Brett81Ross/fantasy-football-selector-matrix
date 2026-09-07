(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMDraftContracts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DRAFT_TYPES = Object.freeze(['snake', 'linear', 'auction']);
  const DRAFT_STATUSES = Object.freeze(['not_started', 'pre_draft', 'live', 'paused', 'completed']);
  const SYNC_STATUSES = Object.freeze(['live', 'stale', 'disconnected', 'manual']);
  const ROSTER_SLOT_FLAGS = Object.freeze(['isBench', 'isReserve']);
  const RECOMMENDATION_COMPONENTS = Object.freeze([
    'playerValue',
    'rosterNeed',
    'positionalDropoff',
    'tierCliff',
    'waitCost'
  ]);

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function positiveInt(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  function nonNegativeInt(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isNullableText(value) {
    return value === null || text(value).length > 0;
  }

  function normalizeRosterSlot(slot) {
    const source = isPlainObject(slot) ? slot : {};
    return {
      id: text(source.id),
      type: text(source.type),
      count: positiveInt(source.count) || 0,
      eligiblePositions: Array.isArray(source.eligiblePositions)
        ? [...new Set(source.eligiblePositions.map(text).filter(Boolean))]
        : [],
      isBench: source.isBench === true,
      isReserve: source.isReserve === true
    };
  }

  function validateLeagueSettings(value) {
    const errors = [];
    const league = isPlainObject(value) ? value : {};
    if (!text(league.leagueId)) errors.push('leagueId is required');
    if (!text(league.platform)) errors.push('platform is required');
    if (!positiveInt(league.season)) errors.push('season must be a positive integer');
    if (!positiveInt(league.teams)) errors.push('teams must be a positive integer');
    if (!DRAFT_TYPES.includes(league.draftType)) errors.push('draftType is invalid');
    if (!isPlainObject(league.scoring)) errors.push('scoring must be an object');
    if (!Array.isArray(league.rosterSlots) || league.rosterSlots.length === 0) {
      errors.push('rosterSlots must contain at least one slot');
    } else {
      league.rosterSlots.forEach((raw, index) => {
        const slot = normalizeRosterSlot(raw);
        if (!slot.id) errors.push(`rosterSlots[${index}].id is required`);
        if (!slot.type) errors.push(`rosterSlots[${index}].type is required`);
        if (!slot.count) errors.push(`rosterSlots[${index}].count must be positive`);
        if (!slot.isBench && !slot.isReserve && slot.eligiblePositions.length === 0) {
          errors.push(`rosterSlots[${index}].eligiblePositions is required`);
        }
      });
    }
    return { ok: errors.length === 0, errors };
  }

  function normalizePickEvent(value) {
    const pick = isPlainObject(value) ? value : {};
    return {
      pickId: text(pick.pickId),
      draftId: text(pick.draftId),
      overall: positiveInt(pick.overall) || 0,
      round: positiveInt(pick.round) || 0,
      pickInRound: positiveInt(pick.pickInRound) || 0,
      playerId: text(pick.playerId),
      teamId: text(pick.teamId),
      ...(text(pick.originalOwnerTeamId) ? { originalOwnerTeamId: text(pick.originalOwnerTeamId) } : {}),
      ...(text(pick.timestamp) ? { timestamp: text(pick.timestamp) } : {}),
      source: text(pick.source)
    };
  }

  function validatePickEvents(picks) {
    const errors = [];
    if (!Array.isArray(picks)) return { ok: false, errors: ['picks must be an array'] };
    const pickIds = new Set();
    const playerIds = new Set();
    let previousOverall = 0;

    picks.forEach((raw, index) => {
      const pick = normalizePickEvent(raw);
      for (const key of ['pickId', 'draftId', 'playerId', 'teamId', 'source']) {
        if (!pick[key]) errors.push(`picks[${index}].${key} is required`);
      }
      for (const key of ['overall', 'round', 'pickInRound']) {
        if (!pick[key]) errors.push(`picks[${index}].${key} must be positive`);
      }
      if (pick.overall < previousOverall) errors.push(`picks[${index}] is out of chronological order`);
      previousOverall = Math.max(previousOverall, pick.overall);
      if (pickIds.has(pick.pickId)) errors.push(`duplicate pickId ${pick.pickId}`);
      if (playerIds.has(pick.playerId)) errors.push(`duplicate drafted player ${pick.playerId}`);
      pickIds.add(pick.pickId);
      playerIds.add(pick.playerId);
    });

    return { ok: errors.length === 0, errors };
  }

  function validateDraftState(value) {
    const errors = [];
    const state = isPlainObject(value) ? value : {};

    if (!text(state.draftId)) errors.push('draftId is required');

    const leagueResult = validateLeagueSettings(state.league);
    if (!leagueResult.ok) errors.push(...leagueResult.errors.map(error => `league.${error}`));

    if (!DRAFT_STATUSES.includes(state.status)) errors.push('status is invalid');
    if (!(state.myTeamId === null || text(state.myTeamId))) errors.push('myTeamId must be null or a non-empty string');

    if (state.currentPick !== null) {
      const current = isPlainObject(state.currentPick) ? state.currentPick : {};
      if (!positiveInt(current.round)) errors.push('currentPick.round must be positive');
      if (!positiveInt(current.pickInRound)) errors.push('currentPick.pickInRound must be positive');
      if (!positiveInt(current.overall)) errors.push('currentPick.overall must be positive');
      if (current.onTheClockTeamId !== undefined && !text(current.onTheClockTeamId)) {
        errors.push('currentPick.onTheClockTeamId must be a non-empty string when provided');
      }
    }

    if (!(state.picksUntilMyNext === null || nonNegativeInt(state.picksUntilMyNext) !== null)) {
      errors.push('picksUntilMyNext must be null or an integer >= 0');
    }

    for (const key of ['teams', 'picks', 'draftedPlayerIds', 'availablePlayerIds', 'myRoster', 'recentPicks']) {
      if (!Array.isArray(state[key])) errors.push(`${key} must be an array`);
    }

    if (Array.isArray(state.picks)) {
      const picksResult = validatePickEvents(state.picks);
      if (!picksResult.ok) errors.push(...picksResult.errors.map(error => `picks.${error}`));
    }

    if (Array.isArray(state.draftedPlayerIds) && Array.isArray(state.availablePlayerIds)) {
      const drafted = new Set(state.draftedPlayerIds.map(text).filter(Boolean));
      const available = new Set(state.availablePlayerIds.map(text).filter(Boolean));
      for (const playerId of drafted) {
        if (available.has(playerId)) errors.push(`player ${playerId} cannot be both drafted and available`);
      }
    }

    if (Array.isArray(state.myRoster)) {
      state.myRoster.forEach((entry, index) => {
        const assignment = isPlainObject(entry) ? entry : {};
        if (!text(assignment.playerId)) errors.push(`myRoster[${index}].playerId is required`);
        if (!text(assignment.slotId)) errors.push(`myRoster[${index}].slotId is required`);
        if (!text(assignment.position)) errors.push(`myRoster[${index}].position is required`);
      });
    }

    const sync = isPlainObject(state.sync) ? state.sync : {};
    if (!SYNC_STATUSES.includes(sync.status)) errors.push('sync.status is invalid');
    if (nonNegativeInt(sync.consecutiveFailures) === null) errors.push('sync.consecutiveFailures must be an integer >= 0');
    if (!(sync.lastSuccessfulSyncAt === null || text(sync.lastSuccessfulSyncAt))) {
      errors.push('sync.lastSuccessfulSyncAt must be null or a non-empty string');
    }
    if (!(sync.lastAttemptAt === null || text(sync.lastAttemptAt))) {
      errors.push('sync.lastAttemptAt must be null or a non-empty string');
    }

    return { ok: errors.length === 0, errors };
  }

  function validateRecommendation(value) {
    const errors = [];
    const recommendation = isPlainObject(value) ? value : {};

    if (!text(recommendation.playerId)) errors.push('playerId is required');
    if (!text(recommendation.position)) errors.push('position is required');
    if (!(recommendation.slotId === null || text(recommendation.slotId))) errors.push('slotId must be null or a non-empty string');
    if (!Number.isFinite(Number(recommendation.score))) errors.push('score must be a finite number');

    const components = isPlainObject(recommendation.components) ? recommendation.components : null;
    if (!components) {
      errors.push('components must be an object');
    } else {
      for (const key of RECOMMENDATION_COMPONENTS) {
        if (!Number.isFinite(Number(components[key]))) errors.push(`components.${key} must be a finite number`);
      }
    }

    if (!text(recommendation.explanation)) errors.push('explanation is required');
    if (!text(recommendation.generatedAt)) errors.push('generatedAt is required');
    if (!isNullableText(recommendation.basedOnSyncAt)) errors.push('basedOnSyncAt must be null or a non-empty string');

    return { ok: errors.length === 0, errors };
  }

  return {
    DRAFT_TYPES,
    DRAFT_STATUSES,
    SYNC_STATUSES,
    ROSTER_SLOT_FLAGS,
    RECOMMENDATION_COMPONENTS,
    normalizeRosterSlot,
    validateLeagueSettings,
    normalizePickEvent,
    validatePickEvents,
    validateDraftState,
    validateRecommendation
  };
});