const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../draft-core/contracts');

function makeValidDraftState() {
  return {
    draftId: 'D1',
    league: {
      leagueId: 'L1', platform: 'manual', season: 2026, scoring: {}, teams: 2, draftType: 'snake',
      rosterSlots: [
        { id: 'QB', type: 'QB', count: 1, eligiblePositions: ['QB'] },
        { id: 'BN', type: 'BN', count: 1, eligiblePositions: ['QB', 'RB', 'WR', 'TE'], isBench: true }
      ]
    },
    status: 'live',
    myTeamId: 'T1',
    currentPick: { round: 1, pickInRound: 2, overall: 2, onTheClockTeamId: 'T2' },
    picksUntilMyNext: 1,
    teams: [{ teamId: 'T1', ownerName: 'Me' }, { teamId: 'T2', ownerName: 'Other' }],
    picks: [],
    draftedPlayerIds: [],
    availablePlayerIds: ['P1', 'P2'],
    myRoster: [],
    recentPicks: [],
    sync: {
      status: 'manual',
      lastSuccessfulSyncAt: null,
      lastAttemptAt: null,
      consecutiveFailures: 0
    }
  };
}

test('normalizes flexible roster slots without hard-coded positions', () => {
  assert.deepEqual(
    C.normalizeRosterSlot({
      id: 'FLEX-1',
      type: 'FLEX',
      count: 2,
      eligiblePositions: ['RB', 'WR', 'TE']
    }),
    {
      id: 'FLEX-1',
      type: 'FLEX',
      count: 2,
      eligiblePositions: ['RB', 'WR', 'TE'],
      isBench: false,
      isReserve: false
    }
  );
});

test('accepts a superflex-shaped league without special-case code', () => {
  const league = {
    leagueId: 'L1',
    platform: 'manual',
    season: 2026,
    scoring: { pass_td: 4, rush_td: 6 },
    teams: 12,
    draftType: 'snake',
    rosterSlots: [
      { id: 'QB', type: 'QB', count: 1, eligiblePositions: ['QB'] },
      { id: 'SF', type: 'SUPERFLEX', count: 1, eligiblePositions: ['QB', 'RB', 'WR', 'TE'] },
      { id: 'BN', type: 'BN', count: 5, eligiblePositions: ['QB', 'RB', 'WR', 'TE', 'K', 'DST'], isBench: true }
    ]
  };
  assert.equal(C.validateLeagueSettings(league).ok, true);
});

test('rejects league settings with no roster slots', () => {
  const result = C.validateLeagueSettings({
    leagueId: 'L1', platform: 'manual', season: 2026,
    scoring: {}, teams: 12, draftType: 'snake', rosterSlots: []
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /rosterSlots/);
});

test('accepts chronological unique pick events', () => {
  const result = C.validatePickEvents([
    { pickId: 'D1:1', draftId: 'D1', overall: 1, round: 1, pickInRound: 1, playerId: 'P1', teamId: 'T1', source: 'manual' },
    { pickId: 'D1:2', draftId: 'D1', overall: 2, round: 1, pickInRound: 2, playerId: 'P2', teamId: 'T2', source: 'manual' }
  ]);
  assert.equal(result.ok, true);
});

test('rejects duplicate player or pick identity', () => {
  const result = C.validatePickEvents([
    { pickId: 'D1:1', draftId: 'D1', overall: 1, round: 1, pickInRound: 1, playerId: 'P1', teamId: 'T1', source: 'manual' },
    { pickId: 'D1:1', draftId: 'D1', overall: 2, round: 1, pickInRound: 2, playerId: 'P1', teamId: 'T2', source: 'manual' }
  ]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /duplicate/i);
});

test('rejects out-of-order pick events', () => {
  const result = C.validatePickEvents([
    { pickId: 'D1:2', draftId: 'D1', overall: 2, round: 1, pickInRound: 2, playerId: 'P2', teamId: 'T2', source: 'manual' },
    { pickId: 'D1:1', draftId: 'D1', overall: 1, round: 1, pickInRound: 1, playerId: 'P1', teamId: 'T1', source: 'manual' }
  ]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /chronological/);
});

test('accepts a valid canonical draft state', () => {
  assert.equal(C.validateDraftState(makeValidDraftState()).ok, true);
});

test('rejects a draft state with invalid sync status', () => {
  const state = makeValidDraftState();
  state.sync.status = 'mystery';
  const result = C.validateDraftState(state);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /sync.status/);
});

test('rejects a player listed as both drafted and available', () => {
  const state = makeValidDraftState();
  state.draftedPlayerIds = ['P1'];
  state.availablePlayerIds = ['P1', 'P2'];
  const result = C.validateDraftState(state);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /both drafted and available/);
});

test('accepts an explainable recommendation with component scores', () => {
  const result = C.validateRecommendation({
    playerId: 'P9',
    position: 'WR',
    slotId: 'FLEX-1',
    score: 91.4,
    components: {
      playerValue: 82,
      rosterNeed: 8,
      positionalDropoff: 5.4,
      tierCliff: 3,
      waitCost: 4.7
    },
    explanation: 'WR is the best FLEX value and has the sharpest drop before your next pick.',
    generatedAt: '2026-09-07T12:00:00.000Z',
    basedOnSyncAt: '2026-09-07T11:59:58.000Z'
  });
  assert.equal(result.ok, true);
});

test('rejects a recommendation missing an explanation', () => {
  const result = C.validateRecommendation({
    playerId: 'P9', position: 'WR', slotId: null, score: 91,
    components: { playerValue: 82, rosterNeed: 8, positionalDropoff: 5, tierCliff: 3, waitCost: 4 },
    explanation: '', generatedAt: '2026-09-07T12:00:00.000Z', basedOnSyncAt: null
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /explanation/);
});