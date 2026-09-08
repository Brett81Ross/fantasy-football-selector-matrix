const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLeagueSnapshot } = require('../season-core/contracts');
const { evaluateRoster } = require('../season-core/roster-doctor');

function snapshot({ rosterSlots, playerIds, reservePlayerIds = [], statuses = {} }) {
  return normalizeLeagueSnapshot({
    league: {
      leagueId:'L1', platform:'sleeper', season:2026, teams:2, scoring:{rec:1}, rosterSlots
    },
    week:4,
    myRosterId:'1',
    rosters:[
      { rosterId:'1', ownerId:'U1', playerIds, reservePlayerIds },
      { rosterId:'2', ownerId:'U2', playerIds:['O1','O2'] }
    ],
    playerPool:[...playerIds, ...reservePlayerIds, 'O1','O2','FA1','FA2'].map(id=>({id})),
    playerStatuses:statuses,
    freshness:{status:'fresh', asOf:'2026-09-08T03:00:00.000Z'}
  });
}

const standardSlots = [
  { id:'QB', type:'QB', count:1, eligiblePositions:['QB'], isBench:false, isReserve:false },
  { id:'RB', type:'RB', count:2, eligiblePositions:['RB'], isBench:false, isReserve:false },
  { id:'WR', type:'WR', count:2, eligiblePositions:['WR'], isBench:false, isReserve:false },
  { id:'TE', type:'TE', count:1, eligiblePositions:['TE'], isBench:false, isReserve:false },
  { id:'FLEX', type:'FLEX', count:1, eligiblePositions:['RB','WR','TE'], isBench:false, isReserve:false },
  { id:'BN', type:'BN', count:4, eligiblePositions:['QB','RB','WR','TE'], isBench:true, isReserve:false }
];

test('identifies weak RB and strong WR groups from roster value and league demand', () => {
  const snap = snapshot({ rosterSlots:standardSlots, playerIds:['QB1','RB1','RB2','WR1','WR2','WR3','TE1'] });
  const values = {
    QB1:{position:'QB', value:78},
    RB1:{position:'RB', value:52}, RB2:{position:'RB', value:44},
    WR1:{position:'WR', value:94}, WR2:{position:'WR', value:89}, WR3:{position:'WR', value:82},
    TE1:{position:'TE', value:72},
    O1:{position:'RB', value:80}, O2:{position:'WR', value:75},
    FA1:{position:'RB', value:67}, FA2:{position:'WR', value:62}
  };

  const report = evaluateRoster(snap, '1', values);
  assert.equal(report.rosterId, '1');
  assert.ok(report.positionalGrades.RB < report.positionalGrades.WR);
  assert.equal(report.weaknesses[0].position, 'RB');
  assert.ok(report.strengths.some(item=>item.position==='WR'));
  assert.ok(report.overallGrade >= 0 && report.overallGrade <= 100);
});

test('injury exposure lowers a position grade and surfaces health risk', () => {
  const healthy = snapshot({ rosterSlots:standardSlots, playerIds:['QB1','RB1','RB2','WR1','WR2','TE1'] });
  const injured = snapshot({
    rosterSlots:standardSlots,
    playerIds:['QB1','RB1','RB2','WR1','WR2','TE1'],
    statuses:{ RB1:{raw:'Out'}, RB2:{raw:'Questionable'} }
  });
  const values = {
    QB1:{position:'QB', value:80}, RB1:{position:'RB', value:88}, RB2:{position:'RB', value:80},
    WR1:{position:'WR', value:82}, WR2:{position:'WR', value:78}, TE1:{position:'TE', value:75}
  };

  const healthyReport = evaluateRoster(healthy, '1', values);
  const injuredReport = evaluateRoster(injured, '1', values);
  assert.ok(injuredReport.positionalGrades.RB < healthyReport.positionalGrades.RB);
  assert.ok(injuredReport.healthRisk.score > healthyReport.healthRisk.score);
  assert.deepEqual([...injuredReport.healthRisk.flaggedPlayerIds].sort(), ['RB1','RB2']);
});

test('bench depth and surplus are recognized beyond required starter demand', () => {
  const snap = snapshot({
    rosterSlots:standardSlots,
    playerIds:['QB1','RB1','RB2','RB3','WR1','WR2','WR3','WR4','TE1']
  });
  const values = {
    QB1:{position:'QB', value:75},
    RB1:{position:'RB', value:80}, RB2:{position:'RB', value:76}, RB3:{position:'RB', value:73},
    WR1:{position:'WR', value:92}, WR2:{position:'WR', value:88}, WR3:{position:'WR', value:84}, WR4:{position:'WR', value:79},
    TE1:{position:'TE', value:71}
  };
  const report = evaluateRoster(snap, '1', values);
  assert.ok(report.benchDepth.count >= 3);
  assert.ok(report.surplus.some(item=>item.position==='WR'));
});

test('uses alternate superflex league slots instead of assuming a standard lineup', () => {
  const slots = [
    { id:'QB', type:'QB', count:1, eligiblePositions:['QB'], isBench:false, isReserve:false },
    { id:'SUPER_FLEX', type:'SUPER_FLEX', count:2, eligiblePositions:['QB','RB','WR','TE'], isBench:false, isReserve:false },
    { id:'WR', type:'WR', count:1, eligiblePositions:['WR'], isBench:false, isReserve:false },
    { id:'BN', type:'BN', count:5, eligiblePositions:['QB','RB','WR','TE'], isBench:true, isReserve:false }
  ];
  const snap = snapshot({ rosterSlots:slots, playerIds:['QB1','QB2','QB3','WR1','RB1'] });
  const values = {
    QB1:{position:'QB', value:91}, QB2:{position:'QB', value:86}, QB3:{position:'QB', value:79},
    WR1:{position:'WR', value:72}, RB1:{position:'RB', value:70}
  };
  const report = evaluateRoster(snap, '1', values);
  assert.equal(report.demand.flexibleStarterSlots, 2);
  assert.ok(report.demand.positionWeights.QB > 1);
  assert.ok(report.positionalGrades.QB > report.positionalGrades.WR);
});

test('bye-week concentration is surfaced as schedule risk', () => {
  const snap = snapshot({ rosterSlots:standardSlots, playerIds:['QB1','RB1','RB2','WR1','WR2','TE1'] });
  const values = {
    QB1:{position:'QB', value:80, byeWeek:8}, RB1:{position:'RB', value:80, byeWeek:8},
    RB2:{position:'RB', value:78, byeWeek:8}, WR1:{position:'WR', value:82, byeWeek:8},
    WR2:{position:'WR', value:80, byeWeek:10}, TE1:{position:'TE', value:76, byeWeek:11}
  };
  const report = evaluateRoster(snap, '1', values);
  assert.equal(report.byeRisk.peakWeek, 8);
  assert.ok(report.byeRisk.score > 0);
  assert.equal(report.byeRisk.weeks[0].week, 8);
});
