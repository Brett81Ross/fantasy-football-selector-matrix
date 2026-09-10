const test = require('node:test');
const assert = require('node:assert/strict');
const { filterWaiverCandidates } = require('../waiver-ownership-sync');

const players = [
  { id: 'QB-MINE', name: 'My QB', games: 8, metrics: { opportunity: 90, tov: 95, trend: 80, ceiling: 88 } },
  { id: 'TE-OTHER', name: 'Other Team TE', games: 8, metrics: { opportunity: 88, tov: 96, trend: 76, ceiling: 90 } },
  { id: 'FA-1', name: 'Actual Free Agent', games: 8, metrics: { opportunity: 70, tov: 80, trend: 72, ceiling: 75 } },
  { id: 'LOW-OPP', name: 'Low Opportunity FA', games: 8, metrics: { opportunity: 20, tov: 99, trend: 99, ceiling: 99 } }
];

const snapshot = {
  myRosterId: '1',
  ownedPlayerIds: ['QB-MINE', 'TE-OTHER'],
  freeAgentPlayerIds: ['FA-1', 'LOW-OPP'],
  freshness: { status: 'fresh' }
};

test('synced waiver list excludes every rostered player including my own roster', () => {
  const result = filterWaiverCandidates(players, snapshot);
  assert.deepEqual(result.map(p => p.id), ['FA-1']);
});

test('stale last-known-good snapshot still excludes rostered players', () => {
  const result = filterWaiverCandidates(players, { ...snapshot, freshness: { status: 'stale' } });
  assert.deepEqual(result.map(p => p.id), ['FA-1']);
});

test('contradictory snapshot never treats an explicitly owned player as a free agent', () => {
  const result = filterWaiverCandidates(players, {
    ...snapshot,
    freeAgentPlayerIds: ['TE-OTHER', 'FA-1'],
    rosters: [
      { rosterId:'1', playerIds:['QB-MINE'] },
      { rosterId:'2', playerIds:['TE-OTHER'] }
    ]
  });
  assert.deepEqual(result.map(p => p.id), ['FA-1']);
});

test('without a league snapshot it remains a generic watchlist', () => {
  const result = filterWaiverCandidates(players, null);
  assert.deepEqual(result.map(p => p.id), ['QB-MINE', 'TE-OTHER', 'FA-1']);
});
