const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../draft-core/evaluators');

test('playerQuality preserves weighted legacy formula', () => {
  const player = { metrics: { production: 80, opportunity: 70, consistency: 60, ceiling: 90, trend: 50, availability: 100 }, status: 'ACT' };
  assert.equal(E.playerQuality(player), 75.9);
});

test('playerQuality preserves rookie draftBase floor and PUP penalty', () => {
  const rookie = { rookie: true, games: 0, draftBase: 88, metrics: {}, status: 'PUP' };
  assert.equal(E.playerQuality(rookie), 82);
});

test('evaluateVorpWait derives replacement value and wait cost from a snapshot', () => {
  const players = [
    { id: 'A', position: 'WR', metrics: { production: 90 } },
    { id: 'B', position: 'WR', metrics: { production: 70 } },
    { id: 'C', position: 'WR', metrics: { production: 50 } }
  ];
  const result = E.evaluateVorpWait({
    player: players[0],
    groups: { WR: players },
    openDemand: { WR: 2 },
    totalOpenDemand: 2,
    picksAway: 2,
    rosterNeed: { open: { WR: 1 }, flexOpen: 0 },
    flexPositions: ['RB', 'WR', 'TE']
  });
  assert.equal(result.replacement.player.id, 'B');
  assert.ok(result.vorp > 0);
  assert.ok(result.waitCost > 0);
  assert.equal(result.rosterFactor, 1.08);
});

test('evaluateVorpWait safely zeroes unsupported positions', () => {
  const result = E.evaluateVorpWait({ player: { id: 'K1', position: 'K' }, groups: {}, openDemand: {}, totalOpenDemand: 0, picksAway: 1, rosterNeed: { open: {}, flexOpen: 0 }, flexPositions: ['RB','WR','TE'] });
  assert.deepEqual(result, { vorp: 0, waitCost: 0, scoreBoost: 0, replacement: null, replacementRank: 0, expectedTaken: 0, remainingDemand: 0, rosterFactor: 0, quality: 0 });
});

test('buildLegacyRosterSnapshot and evaluateRosterNeed preserve legacy FLEX rules', () => {
  const lineup = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 };
  const players = [
    { id: 'r1', position: 'RB' },
    { id: 'r2', position: 'RB' },
    { id: 'w1', position: 'WR' },
    { id: 'w2', position: 'WR' },
    { id: 'q1', position: 'QB' },
    { id: 't1', position: 'TE' }
  ];
  const snap = E.buildLegacyRosterSnapshot({ lineup, players, rosterIds: players.map(p => p.id), positions: ['QB','RB','WR','TE'], flexPositions: ['RB','WR','TE'] });
  assert.equal(snap.flexOpen, 1);
  assert.ok(E.evaluateRosterNeed({ player: { position: 'WR' }, round: 6, snapshot: snap, flexPositions: ['RB','WR','TE'], positions: ['QB','RB','WR','TE'] }) > 0);
  assert.equal(E.evaluateRosterNeed({ player: { position: 'K' }, round: 6, snapshot: snap, flexPositions: ['RB','WR','TE'], positions: ['QB','RB','WR','TE'] }), 0);
});

test('classifyTierValues identifies a value cliff', () => {
  const result = E.classifyTierValues([
    { player: { id: 'A' }, value: 100 },
    { player: { id: 'B' }, value: 98 },
    { player: { id: 'C' }, value: 80 },
    { player: { id: 'D' }, value: 79 }
  ]);
  assert.equal(result.items[0].tier, 1);
  assert.equal(result.items[1].cliffAfter, true);
  assert.equal(result.items[2].tier, 2);
});

test('classifyTierValues returns a safe empty analysis', () => {
  assert.deepEqual(E.classifyTierValues([]), { items: [], cliffThreshold: 3, normalGap: 0.8 });
});