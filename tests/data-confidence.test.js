const test = require('node:test');
const assert = require('node:assert/strict');

function api() {
  return require('../season-core/data-confidence');
}

function freshSnapshot(status='Active') {
  return {
    freshness:{ status:'fresh', asOf:'2026-09-10T12:00:00.000Z', source:'sleeper' },
    playerStatuses:{ P1:{ status } },
    ownedPlayerIds:['P1'],
    freeAgentPlayerIds:[]
  };
}

const stableVeteran = {
  id:'P1', name:'Stable Veteran', position:'WR', games:10, rookie:false, yearsExp:5,
  projection:16, floor:13, ceiling:20, metrics:{ consistency:90, opportunity:88 }
};

test('the same player scores lower when the league snapshot is stale', () => {
  const { assessPlayerConfidence } = api();
  const fresh = freshSnapshot();
  const stale = { ...fresh, freshness:{ ...fresh.freshness, status:'stale' } };
  const a = assessPlayerConfidence(stableVeteran, fresh, { sourceHealth:'LIVE', ownershipState:'known' });
  const b = assessPlayerConfidence(stableVeteran, stale, { sourceHealth:'LIVE', ownershipState:'known' });
  assert.ok(a.score > b.score);
  assert.ok(b.reasons.some(reason => /stale/i.test(reason)));
});

test('a rookie with fewer than four games cannot receive more than 72 confidence', () => {
  const { assessPlayerConfidence } = api();
  const rookie = { ...stableVeteran, games:2, rookie:true, yearsExp:0 };
  const result = assessPlayerConfidence(rookie, freshSnapshot(), { sourceHealth:'LIVE', ownershipState:'known' });
  assert.ok(result.score <= 72);
  assert.ok(result.reasons.some(reason => /rookie|sample/i.test(reason)));
});

test('a healthy veteran with a strong sample and stable role can score HIGH', () => {
  const { assessPlayerConfidence } = api();
  const result = assessPlayerConfidence(stableVeteran, freshSnapshot(), { sourceHealth:'LIVE', ownershipState:'known' });
  assert.equal(result.label, 'HIGH');
  assert.ok(result.score >= 80);
});

test('questionable doubtful and out statuses reduce confidence progressively', () => {
  const { assessPlayerConfidence } = api();
  const active = assessPlayerConfidence(stableVeteran, freshSnapshot('Active'), { sourceHealth:'LIVE', ownershipState:'known' });
  const questionable = assessPlayerConfidence(stableVeteran, freshSnapshot('Questionable'), { sourceHealth:'LIVE', ownershipState:'known' });
  const doubtful = assessPlayerConfidence(stableVeteran, freshSnapshot('Doubtful'), { sourceHealth:'LIVE', ownershipState:'known' });
  const out = assessPlayerConfidence(stableVeteran, freshSnapshot('Out'), { sourceHealth:'LIVE', ownershipState:'known' });
  assert.ok(active.score > questionable.score);
  assert.ok(questionable.score > doubtful.score);
  assert.ok(doubtful.score > out.score);
});

test('contradictory ownership sharply lowers confidence and explains why', () => {
  const { assessPlayerConfidence } = api();
  const known = assessPlayerConfidence(stableVeteran, freshSnapshot(), { sourceHealth:'LIVE', ownershipState:'known' });
  const contradictory = assessPlayerConfidence(stableVeteran, freshSnapshot(), { sourceHealth:'LIVE', ownershipState:'contradictory' });
  assert.ok(known.score - contradictory.score >= 30);
  assert.ok(contradictory.reasons.some(reason => /ownership/i.test(reason)));
});

test('an OFFLINE required source makes confidence unavailable', () => {
  const { assessPlayerConfidence } = api();
  const result = assessPlayerConfidence(stableVeteran, freshSnapshot(), { sourceHealth:'OFFLINE', ownershipState:'known' });
  assert.equal(result.score, 0);
  assert.equal(result.label, 'UNAVAILABLE');
  assert.equal(result.available, false);
});

test('component penalties and reasons explain every reduction', () => {
  const { assessConfidence } = api();
  const result = assessConfidence({
    freshness:'stale', sourceHealth:'DEGRADED', sampleSize:2, rookie:true,
    status:'Questionable', roleStability:50, ownershipState:'unknown', volatility:0.5
  });
  const penalties = Object.values(result.components).filter(value => Number(value) > 0);
  assert.ok(penalties.length >= 6);
  assert.ok(result.reasons.length >= penalties.length);
  assert.ok(result.score < 60);
});

test('confidence evaluation never mutates its player or snapshot inputs', () => {
  const { assessPlayerConfidence } = api();
  const player = JSON.parse(JSON.stringify(stableVeteran));
  const snapshot = freshSnapshot('Questionable');
  const playerBefore = JSON.stringify(player);
  const snapshotBefore = JSON.stringify(snapshot);
  assessPlayerConfidence(player, snapshot, { sourceHealth:'DEGRADED', ownershipState:'known' });
  assert.equal(JSON.stringify(player), playerBefore);
  assert.equal(JSON.stringify(snapshot), snapshotBefore);
});

test('combineConfidence is deterministic and cannot exceed its weakest hard-unavailable input', () => {
  const { combineConfidence } = api();
  const a = { score:92, label:'HIGH', available:true, reasons:[] };
  const b = { score:68, label:'MEDIUM', available:true, reasons:['stale input'] };
  const combined = combineConfidence([a,b]);
  assert.equal(combined.score, 80);
  assert.equal(combined.label, 'HIGH');
  const unavailable = combineConfidence([a,{ score:0, label:'UNAVAILABLE', available:false, reasons:['offline'] }], { requireAll:true });
  assert.equal(unavailable.score, 0);
  assert.equal(unavailable.label, 'UNAVAILABLE');
});
