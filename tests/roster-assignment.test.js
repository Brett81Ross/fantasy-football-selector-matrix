const test = require('node:test');
const assert = require('node:assert/strict');
const { assignRoster } = require('../draft-core/roster-assignment');

function gameOfThrowsSlots() {
  return [
    { id: 'QB', type: 'QB', count: 1, eligiblePositions: ['QB'] },
    { id: 'RB', type: 'RB', count: 2, eligiblePositions: ['RB'] },
    { id: 'WR', type: 'WR', count: 2, eligiblePositions: ['WR'] },
    { id: 'TE', type: 'TE', count: 1, eligiblePositions: ['TE'] },
    { id: 'FLEX', type: 'FLEX', count: 2, eligiblePositions: ['RB','WR','TE'] },
    { id: 'K', type: 'K', count: 1, eligiblePositions: ['K'] },
    { id: 'DST', type: 'DST', count: 1, eligiblePositions: ['DST'] },
    { id: 'BN', type: 'BN', count: 5, eligiblePositions: ['QB','RB','WR','TE','K','DST'], isBench: true }
  ];
}

test('fills fixed starter slots before FLEX and bench', () => {
  const players = [
    { id: 'r1', position: 'RB' },
    { id: 'r2', position: 'RB' },
    { id: 'w1', position: 'WR' },
    { id: 'w2', position: 'WR' },
    { id: 't1', position: 'TE' },
    { id: 'w3', position: 'WR' },
    { id: 'r3', position: 'RB' }
  ];
  const result = assignRoster({ players, rosterSlots: gameOfThrowsSlots() });
  const byId = Object.fromEntries(result.assignments.map(a => [a.playerId, a.slotId]));
  assert.match(byId.r1, /^RB/);
  assert.match(byId.r2, /^RB/);
  assert.match(byId.w1, /^WR/);
  assert.match(byId.w2, /^WR/);
  assert.match(byId.t1, /^TE/);
  assert.match(byId.w3, /^FLEX/);
  assert.match(byId.r3, /^FLEX/);
});

test('automatically compares all FLEX-eligible positions without user selection', () => {
  const players = [
    { id: 'r1', position: 'RB' },
    { id: 'r2', position: 'RB' },
    { id: 'w1', position: 'WR' },
    { id: 'w2', position: 'WR' },
    { id: 't1', position: 'TE' },
    { id: 't2', position: 'TE' },
    { id: 'w3', position: 'WR' }
  ];
  const result = assignRoster({ players, rosterSlots: gameOfThrowsSlots() });
  const flexPlayers = result.assignments.filter(a => a.slotId.startsWith('FLEX')).map(a => a.playerId).sort();
  assert.deepEqual(flexPlayers, ['t2', 'w3']);
});

test('moves overflow players to bench only after all legal starters are filled', () => {
  const players = [
    { id: 'q1', position: 'QB' },
    { id: 'q2', position: 'QB' }
  ];
  const result = assignRoster({ players, rosterSlots: gameOfThrowsSlots() });
  const q1 = result.assignments.find(a => a.playerId === 'q1');
  const q2 = result.assignments.find(a => a.playerId === 'q2');
  assert.match(q1.slotId, /^QB/);
  assert.match(q2.slotId, /^BN/);
});

test('supports SUPERFLEX from roster-slot eligibility rather than hard-coded positions', () => {
  const slots = [
    { id: 'QB', type: 'QB', count: 1, eligiblePositions: ['QB'] },
    { id: 'SF', type: 'SUPER_FLEX', count: 1, eligiblePositions: ['QB','RB','WR','TE'] },
    { id: 'BN', type: 'BN', count: 2, eligiblePositions: ['QB','RB','WR','TE'], isBench: true }
  ];
  const result = assignRoster({ players: [{ id: 'q1', position: 'QB' }, { id: 'q2', position: 'QB' }], rosterSlots: slots });
  const byId = Object.fromEntries(result.assignments.map(a => [a.playerId, a.slotId]));
  assert.match(byId.q1, /^QB/);
  assert.match(byId.q2, /^SF/);
});

test('reports open starter and bench slots after assignment', () => {
  const result = assignRoster({ players: [{ id: 'q1', position: 'QB' }], rosterSlots: gameOfThrowsSlots() });
  assert.equal(result.openStarterSlots.length, 9);
  assert.equal(result.openBenchSlots.length, 5);
});