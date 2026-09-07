const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileDraftState } = require('../draft-core/reconcile');

function baseState() {
  return {
    draftId: 'D1',
    league: {
      leagueId: 'L1', platform: 'manual', season: 2026, scoring: {}, teams: 2, draftType: 'snake',
      rosterSlots: [{ id: 'BN', type: 'BN', count: 3, eligiblePositions: ['QB','RB','WR','TE'], isBench: true }]
    },
    status: 'live',
    myTeamId: 'T1',
    currentPick: { round: 2, pickInRound: 2, overall: 4, onTheClockTeamId: 'T1' },
    picksUntilMyNext: 0,
    teams: [{ teamId: 'T1' }, { teamId: 'T2' }],
    picks: [
      { pickId: 'D1:1', draftId: 'D1', overall: 1, round: 1, pickInRound: 1, playerId: 'P1', teamId: 'T1', source: 'manual' },
      { pickId: 'D1:2', draftId: 'D1', overall: 2, round: 1, pickInRound: 2, playerId: 'P2', teamId: 'T2', source: 'manual' },
      { pickId: 'D1:3', draftId: 'D1', overall: 3, round: 2, pickInRound: 1, playerId: 'P3', teamId: 'T1', source: 'manual' }
    ],
    draftedPlayerIds: ['P1','P2','P3'],
    availablePlayerIds: ['P4'],
    myRoster: [
      { playerId: 'P1', slotId: 'UNASSIGNED', position: 'WR' },
      { playerId: 'P3', slotId: 'UNASSIGNED', position: 'QB' }
    ],
    recentPicks: [],
    sync: { status: 'stale', lastSuccessfulSyncAt: null, lastAttemptAt: null, consecutiveFailures: 2 }
  };
}

const pool = [
  { id: 'P1', position: 'WR' },
  { id: 'P2', position: 'RB' },
  { id: 'P3', position: 'QB' },
  { id: 'P4', position: 'TE' }
];

test('authoritative history replaces stale speculative picks and restores availability', () => {
  const state = baseState();
  const authoritative = state.picks.slice(0, 2);
  const next = reconcileDraftState({ previousState: state, authoritativePicks: authoritative, playerPool: pool, now: '2026-09-07T20:10:00.000Z' });
  assert.deepEqual(next.draftedPlayerIds, ['P1','P2']);
  assert.deepEqual(next.availablePlayerIds, ['P3','P4']);
  assert.deepEqual(next.myRoster, [{ playerId: 'P1', slotId: 'UNASSIGNED', position: 'WR' }]);
});

test('authoritative team ownership rematerializes my roster', () => {
  const state = baseState();
  const authoritative = state.picks.map(pick => pick.playerId === 'P3' ? { ...pick, teamId: 'T2', source: 'sleeper' } : { ...pick, source: 'sleeper' });
  const next = reconcileDraftState({ previousState: state, authoritativePicks: authoritative, playerPool: pool, now: '2026-09-07T20:10:00.000Z' });
  assert.deepEqual(next.myRoster, [{ playerId: 'P1', slotId: 'UNASSIGNED', position: 'WR' }]);
});

test('reconciliation resets sync failures and marks state live', () => {
  const state = baseState();
  const next = reconcileDraftState({ previousState: state, authoritativePicks: state.picks, playerPool: pool, now: '2026-09-07T20:10:00.000Z' });
  assert.equal(next.sync.status, 'live');
  assert.equal(next.sync.consecutiveFailures, 0);
  assert.equal(next.sync.lastSuccessfulSyncAt, '2026-09-07T20:10:00.000Z');
});

test('reconciliation rejects duplicate authoritative players', () => {
  const state = baseState();
  const bad = [state.picks[0], { ...state.picks[1], playerId: 'P1' }];
  assert.throws(() => reconcileDraftState({ previousState: state, authoritativePicks: bad, playerPool: pool }), /duplicate/i);
});

test('reconciliation is idempotent for the same authoritative history', () => {
  const state = baseState();
  const once = reconcileDraftState({ previousState: state, authoritativePicks: state.picks, playerPool: pool, now: '2026-09-07T20:10:00.000Z' });
  const twice = reconcileDraftState({ previousState: once, authoritativePicks: state.picks, playerPool: pool, now: '2026-09-07T20:10:00.000Z' });
  assert.deepEqual(twice, once);
});