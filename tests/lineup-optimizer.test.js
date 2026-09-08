const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLeagueSnapshot } = require('../season-core/contracts');
const { optimizeLineup } = require('../season-core/lineup-optimizer');

function makeSnapshot(rosterSlots, playerIds, statuses = {}) {
  return normalizeLeagueSnapshot({
    league:{ leagueId:'L1', platform:'sleeper', season:2026, teams:2, scoring:{rec:1}, rosterSlots },
    week:5, myRosterId:'1', opponentRosterId:'2',
    rosters:[{rosterId:'1',playerIds},{rosterId:'2',playerIds:['O1']}],
    playerPool:[...playerIds,'O1'].map(id=>({id})),
    playerStatuses:statuses,
    freshness:{status:'fresh',asOf:'2026-09-08T03:00:00.000Z'}
  });
}

const slots = [
  {id:'QB',type:'QB',count:1,eligiblePositions:['QB'],isBench:false,isReserve:false},
  {id:'RB',type:'RB',count:2,eligiblePositions:['RB'],isBench:false,isReserve:false},
  {id:'WR',type:'WR',count:2,eligiblePositions:['WR'],isBench:false,isReserve:false},
  {id:'TE',type:'TE',count:1,eligiblePositions:['TE'],isBench:false,isReserve:false},
  {id:'FLEX',type:'FLEX',count:1,eligiblePositions:['RB','WR','TE'],isBench:false,isReserve:false},
  {id:'K',type:'K',count:1,eligiblePositions:['K'],isBench:false,isReserve:false},
  {id:'DST',type:'DST',count:1,eligiblePositions:['DST'],isBench:false,isReserve:false},
  {id:'BN',type:'BN',count:5,eligiblePositions:['QB','RB','WR','TE','K','DST'],isBench:true,isReserve:false}
];

test('builds a legal QB RB WR TE FLEX K DST lineup from league slot rules', () => {
  const ids=['QB1','RB1','RB2','RB3','WR1','WR2','WR3','TE1','TE2','K1','DST1'];
  const snap=makeSnapshot(slots,ids);
  const values={
    QB1:{position:'QB',projection:20},
    RB1:{position:'RB',projection:18},RB2:{position:'RB',projection:16},RB3:{position:'RB',projection:15},
    WR1:{position:'WR',projection:19},WR2:{position:'WR',projection:17},WR3:{position:'WR',projection:14},
    TE1:{position:'TE',projection:13},TE2:{position:'TE',projection:9},
    K1:{position:'K',projection:9},DST1:{position:'DST',projection:8}
  };
  const result=optimizeLineup(snap,'1',values);
  assert.equal(result.starters.length,9);
  assert.equal(result.starters.filter(x=>x.slotType==='RB').length,2);
  assert.equal(result.starters.filter(x=>x.slotType==='WR').length,2);
  assert.equal(result.starters.filter(x=>x.slotType==='FLEX').length,1);
  assert.equal(result.starters.find(x=>x.slotType==='FLEX').playerId,'RB3');
  assert.equal(new Set(result.starters.map(x=>x.playerId)).size,result.starters.length);
});

test('benches a famous high-value player when another player has the better weekly projection', () => {
  const smallSlots=[
    {id:'WR',type:'WR',count:1,eligiblePositions:['WR'],isBench:false,isReserve:false},
    {id:'BN',type:'BN',count:2,eligiblePositions:['WR'],isBench:true,isReserve:false}
  ];
  const snap=makeSnapshot(smallSlots,['STAR','EDGE']);
  const result=optimizeLineup(snap,'1',{
    STAR:{name:'Big Name Star',position:'WR',value:98,projection:12},
    EDGE:{name:'Unsexy Better Play',position:'WR',value:76,projection:18}
  });
  assert.equal(result.starters[0].playerId,'EDGE');
  assert.ok(result.bench.some(x=>x.playerId==='STAR'));
  assert.ok(result.decisions.some(x=>x.action==='START' && x.playerId==='EDGE'));
  assert.ok(result.decisions.some(x=>x.action==='BENCH' && x.playerId==='STAR'));
});

test('creates a contingency when a Questionable starter has a viable backup', () => {
  const smallSlots=[
    {id:'RB',type:'RB',count:1,eligiblePositions:['RB'],isBench:false,isReserve:false},
    {id:'BN',type:'BN',count:2,eligiblePositions:['RB'],isBench:true,isReserve:false}
  ];
  const snap=makeSnapshot(smallSlots,['Q1','B1'],{Q1:{raw:'Questionable'},B1:{raw:'Active'}});
  const result=optimizeLineup(snap,'1',{
    Q1:{position:'RB',projection:18},B1:{position:'RB',projection:14}
  });
  assert.equal(result.starters[0].playerId,'Q1');
  assert.equal(result.contingencies.length,1);
  assert.equal(result.contingencies[0].starterPlayerId,'Q1');
  assert.equal(result.contingencies[0].backupPlayerId,'B1');
  assert.ok(result.contingencies[0].reason.includes('Questionable'));
});

test('Out IR and PUP players are never selected into active starter slots', () => {
  const smallSlots=[
    {id:'RB',type:'RB',count:1,eligiblePositions:['RB'],isBench:false,isReserve:false},
    {id:'BN',type:'BN',count:4,eligiblePositions:['RB'],isBench:true,isReserve:false}
  ];
  const snap=makeSnapshot(smallSlots,['OUT','IR','PUP','OK'],{
    OUT:{raw:'Out'},IR:{raw:'IR'},PUP:{raw:'PUP'},OK:{raw:'Active'}
  });
  const result=optimizeLineup(snap,'1',{
    OUT:{position:'RB',projection:30},IR:{position:'RB',projection:29},PUP:{position:'RB',projection:28},OK:{position:'RB',projection:10}
  });
  assert.equal(result.starters[0].playerId,'OK');
});

test('supports multiple SUPERFLEX slots and permits QB by eligibility instead of a special-case lineup', () => {
  const sfSlots=[
    {id:'QB',type:'QB',count:1,eligiblePositions:['QB'],isBench:false,isReserve:false},
    {id:'SUPER_FLEX',type:'SUPER_FLEX',count:2,eligiblePositions:['QB','RB','WR','TE'],isBench:false,isReserve:false},
    {id:'BN',type:'BN',count:4,eligiblePositions:['QB','RB','WR','TE'],isBench:true,isReserve:false}
  ];
  const snap=makeSnapshot(sfSlots,['QB1','QB2','QB3','RB1','WR1']);
  const result=optimizeLineup(snap,'1',{
    QB1:{position:'QB',projection:24},QB2:{position:'QB',projection:21},QB3:{position:'QB',projection:19},
    RB1:{position:'RB',projection:15},WR1:{position:'WR',projection:14}
  });
  assert.equal(result.starters.filter(x=>x.slotType==='SUPER_FLEX').length,2);
  assert.deepEqual(result.starters.filter(x=>x.slotType==='SUPER_FLEX').map(x=>x.playerId).sort(),['QB2','QB3']);
});

test('every recommendation exposes expected edge confidence risk and reasoning', () => {
  const smallSlots=[
    {id:'WR',type:'WR',count:1,eligiblePositions:['WR'],isBench:false,isReserve:false},
    {id:'BN',type:'BN',count:1,eligiblePositions:['WR'],isBench:true,isReserve:false}
  ];
  const snap=makeSnapshot(smallSlots,['A','B']);
  const result=optimizeLineup(snap,'1',{A:{position:'WR',projection:17},B:{position:'WR',projection:13}});
  const decision=result.decisions.find(x=>x.action==='START');
  assert.equal(typeof decision.expectedEdge,'number');
  assert.equal(typeof decision.confidence,'number');
  assert.equal(typeof decision.risk,'number');
  assert.ok(decision.reason.length>10);
});
