const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const files = [
  'lineup-optimizer.js',
  'waiver-assassin.js',
  'trade-hunter.js',
  'opponent-exploiter.js'
];

test('season decision engines depend on the shared Data Confidence Matrix', () => {
  for (const file of files) {
    const source = fs.readFileSync(require.resolve(`../season-core/${file}`), 'utf8');
    assert.match(source, /data-confidence/, `${file} must use the shared confidence authority`);
  }
});

test('browser runtime loads Data Confidence Matrix before every migrated season engine', () => {
  const source = fs.readFileSync(require.resolve('../api/app'), 'utf8');
  const confidence = source.indexOf('season-core/data-confidence.js');
  assert.ok(confidence >= 0, 'Data Confidence Matrix must be injected into the app shell');
  for (const file of files) {
    const index = source.indexOf(`season-core/${file}`);
    assert.ok(index > confidence, `${file} must load after data-confidence.js`);
  }
});

test('lineup optimizer applies the limited-sample rookie confidence cap', () => {
  const { optimizeLineup } = require('../season-core/lineup-optimizer');
  const snapshot = {
    league:{ rosterSlots:[{ id:'QB', type:'QB', count:1, eligiblePositions:['QB'] }] },
    rosters:[{ rosterId:'ME', playerIds:['P1'], starterPlayerIds:['P1'], reservePlayerIds:[] }],
    freshness:{ status:'fresh', asOf:'2026-09-10T12:00:00.000Z', source:'sleeper' },
    playerStatuses:{ P1:{ status:'Active' } },
    ownedPlayerIds:['P1'],
    freeAgentPlayerIds:[]
  };
  const values = {
    P1:{ id:'P1', name:'Rookie QB', position:'QB', projection:20, games:2, rookie:true, yearsExp:0, floor:15, ceiling:25, metrics:{ consistency:90 } }
  };
  const result = optimizeLineup(snapshot, 'ME', values);
  assert.equal(result.starters.length, 1);
  assert.ok(result.starters[0].confidence <= 72);
});
