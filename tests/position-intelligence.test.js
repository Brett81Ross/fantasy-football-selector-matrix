const test = require('node:test');
const assert = require('node:assert/strict');
const { rankPositionOptions, scoreCandidate } = require('../draft-core/position-intelligence');

function candidate(playerId, position, components, extra = {}) {
  return { playerId, position, slotId: extra.slotId || null, available: extra.available !== false, components };
}

test('larger positional dropoff and wait cost can outweigh a slightly higher raw player value', () => {
  const result = rankPositionOptions([
    candidate('RB1', 'RB', { playerValue: 92, rosterNeed: 4, positionalDropoff: 1, tierCliff: 0, waitCost: 1 }),
    candidate('WR1', 'WR', { playerValue: 89, rosterNeed: 4, positionalDropoff: 7, tierCliff: 4, waitCost: 6 })
  ]);
  assert.equal(result.best.position, 'WR');
  assert.equal(result.best.playerId, 'WR1');
});

test('roster need can move a position ahead when values are otherwise close', () => {
  const result = rankPositionOptions([
    candidate('WR1', 'WR', { playerValue: 86, rosterNeed: 1, positionalDropoff: 2, tierCliff: 1, waitCost: 2 }),
    candidate('TE1', 'TE', { playerValue: 84, rosterNeed: 10, positionalDropoff: 2, tierCliff: 1, waitCost: 2 })
  ]);
  assert.equal(result.best.position, 'TE');
});

test('unavailable players never influence the best position', () => {
  const result = rankPositionOptions([
    candidate('WR1', 'WR', { playerValue: 99, rosterNeed: 10, positionalDropoff: 10, tierCliff: 10, waitCost: 10 }, { available: false }),
    candidate('RB1', 'RB', { playerValue: 80, rosterNeed: 2, positionalDropoff: 2, tierCliff: 1, waitCost: 1 })
  ]);
  assert.equal(result.best.playerId, 'RB1');
});

test('returns one best candidate per position plus an overall best', () => {
  const result = rankPositionOptions([
    candidate('WR1', 'WR', { playerValue: 80, rosterNeed: 2, positionalDropoff: 2, tierCliff: 1, waitCost: 2 }),
    candidate('WR2', 'WR', { playerValue: 82, rosterNeed: 2, positionalDropoff: 1, tierCliff: 1, waitCost: 1 }),
    candidate('RB1', 'RB', { playerValue: 79, rosterNeed: 2, positionalDropoff: 3, tierCliff: 2, waitCost: 3 })
  ]);
  assert.equal(result.byPosition.WR.playerId, 'WR2');
  assert.equal(result.byPosition.RB.playerId, 'RB1');
  assert.ok(result.best);
});

test('scoreCandidate keeps the approved component model explicit', () => {
  const score = scoreCandidate({ playerValue: 80, rosterNeed: 5, positionalDropoff: 4, tierCliff: 3, waitCost: 2 });
  assert.equal(score, 99.75);
});

test('best result includes a concise position-first explanation', () => {
  const result = rankPositionOptions([
    candidate('WR1', 'WR', { playerValue: 88, rosterNeed: 6, positionalDropoff: 5, tierCliff: 3, waitCost: 4 })
  ]);
  assert.match(result.best.explanation, /^WR is the best position now\./);
  assert.match(result.best.explanation, /drop-off/i);
});