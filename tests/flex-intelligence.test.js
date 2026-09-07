const test = require('node:test');
const assert = require('node:assert/strict');
const { chooseFlexRecommendation } = require('../draft-core/flex-intelligence');

function slots() {
  return [
    { id: 'QB', type: 'QB', count: 1, eligiblePositions: ['QB'] },
    { id: 'RB', type: 'RB', count: 2, eligiblePositions: ['RB'] },
    { id: 'WR', type: 'WR', count: 2, eligiblePositions: ['WR'] },
    { id: 'TE', type: 'TE', count: 1, eligiblePositions: ['TE'] },
    { id: 'FLEX', type: 'FLEX', count: 2, eligiblePositions: ['RB','WR','TE'] },
    { id: 'BN', type: 'BN', count: 5, eligiblePositions: ['QB','RB','WR','TE'], isBench: true }
  ];
}

const current = [
  { id: 'q1', position: 'QB' },
  { id: 'r1', position: 'RB' },
  { id: 'r2', position: 'RB' },
  { id: 'w1', position: 'WR' },
  { id: 'w2', position: 'WR' },
  { id: 't1', position: 'TE' }
];

function c(playerId, position, components) {
  return { playerId, position, available: true, components };
}

test('automatically chooses WR over RB when WR has the stronger flex urgency', () => {
  const result = chooseFlexRecommendation({
    currentRosterPlayers: current,
    rosterSlots: slots(),
    candidates: [
      c('r3','RB',{ playerValue: 91, rosterNeed: 4, positionalDropoff: 1, tierCliff: 1, waitCost: 1 }),
      c('w3','WR',{ playerValue: 88, rosterNeed: 4, positionalDropoff: 7, tierCliff: 4, waitCost: 6 })
    ]
  });
  assert.equal(result.position, 'WR');
  assert.equal(result.playerId, 'w3');
  assert.match(result.slotId, /^FLEX/);
});

test('TE can be the correct FLEX choice without the user selecting TE', () => {
  const result = chooseFlexRecommendation({
    currentRosterPlayers: current,
    rosterSlots: slots(),
    candidates: [
      c('r3','RB',{ playerValue: 86, rosterNeed: 3, positionalDropoff: 2, tierCliff: 1, waitCost: 2 }),
      c('t2','TE',{ playerValue: 85, rosterNeed: 5, positionalDropoff: 5, tierCliff: 4, waitCost: 5 })
    ]
  });
  assert.equal(result.position, 'TE');
  assert.equal(result.playerId, 't2');
});

test('standard FLEX excludes QB automatically', () => {
  const result = chooseFlexRecommendation({
    currentRosterPlayers: current,
    rosterSlots: slots(),
    candidates: [
      c('q2','QB',{ playerValue: 99, rosterNeed: 10, positionalDropoff: 10, tierCliff: 10, waitCost: 10 }),
      c('r3','RB',{ playerValue: 80, rosterNeed: 2, positionalDropoff: 2, tierCliff: 1, waitCost: 2 })
    ]
  });
  assert.equal(result.playerId, 'r3');
});

test('SUPERFLEX permits QB because eligibility comes from the slot definition', () => {
  const superflex = [
    { id: 'QB', type: 'QB', count: 1, eligiblePositions: ['QB'] },
    { id: 'SF', type: 'SUPER_FLEX', count: 1, eligiblePositions: ['QB','RB','WR','TE'] },
    { id: 'BN', type: 'BN', count: 2, eligiblePositions: ['QB','RB','WR','TE'], isBench: true }
  ];
  const result = chooseFlexRecommendation({
    currentRosterPlayers: [{ id: 'q1', position: 'QB' }],
    rosterSlots: superflex,
    candidates: [
      c('q2','QB',{ playerValue: 90, rosterNeed: 5, positionalDropoff: 4, tierCliff: 2, waitCost: 3 }),
      c('w1','WR',{ playerValue: 82, rosterNeed: 4, positionalDropoff: 2, tierCliff: 1, waitCost: 2 })
    ]
  });
  assert.equal(result.position, 'QB');
  assert.match(result.slotId, /^SF/);
});

test('returns null when no flexible starter slot is open', () => {
  const filled = [...current, { id: 'r3', position: 'RB' }, { id: 'w3', position: 'WR' }];
  const result = chooseFlexRecommendation({ currentRosterPlayers: filled, rosterSlots: slots(), candidates: [c('t2','TE',{ playerValue: 90, rosterNeed: 5, positionalDropoff: 5, tierCliff: 5, waitCost: 5 })] });
  assert.equal(result, null);
});

test('headline tells the user exactly which FLEX position and player to take', () => {
  const result = chooseFlexRecommendation({
    currentRosterPlayers: current,
    rosterSlots: slots(),
    candidates: [c('w3','WR',{ playerValue: 88, rosterNeed: 5, positionalDropoff: 6, tierCliff: 3, waitCost: 4 })]
  });
  assert.equal(result.headline, 'BEST FLEX: WR — w3');
});