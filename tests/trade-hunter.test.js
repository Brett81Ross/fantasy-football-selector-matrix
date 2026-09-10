const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLeagueSnapshot } = require('../season-core/contracts');
const { findTradeOpportunities } = require('../season-core/trade-hunter');

const slots = [
  {id:'QB',type:'QB',count:1,eligiblePositions:['QB'],isBench:false,isReserve:false},
  {id:'RB',type:'RB',count:2,eligiblePositions:['RB'],isBench:false,isReserve:false},
  {id:'WR',type:'WR',count:2,eligiblePositions:['WR'],isBench:false,isReserve:false},
  {id:'TE',type:'TE',count:1,eligiblePositions:['TE'],isBench:false,isReserve:false},
  {id:'FLEX',type:'FLEX',count:1,eligiblePositions:['RB','WR','TE'],isBench:false,isReserve:false},
  {id:'BN',type:'BN',count:5,eligiblePositions:['QB','RB','WR','TE'],isBench:true,isReserve:false}
];

function makeSnapshot(rosters, statuses={}) {
  const ids=rosters.flatMap(r=>r.playerIds);
  return normalizeLeagueSnapshot({
    league:{leagueId:'L1',platform:'sleeper',season:2026,teams:rosters.length,scoring:{rec:1},rosterSlots:slots},
    week:7,myRosterId:'1',opponentRosterId:'2',rosters,
    playerPool:ids.map(id=>({id})),playerStatuses:statuses,
    freshness:{status:'fresh',asOf:'2026-09-08T03:00:00.000Z'}
  });
}

test('finds complementary trade where my WR surplus solves their WR weakness and their RB surplus solves my RB weakness', () => {
  const snap=makeSnapshot([
    {rosterId:'1',ownerId:'ME',playerIds:['Q1','R1','R2','W1','W2','W3','W4','T1']},
    {rosterId:'2',ownerId:'THEM',playerIds:['Q2','R3','R4','R5','W5','W6','T2']}
  ]);
  const values={
    Q1:{position:'QB',value:75,projection:18},R1:{position:'RB',value:48,projection:9},R2:{position:'RB',value:46,projection:8},
    W1:{position:'WR',value:92,projection:18},W2:{position:'WR',value:88,projection:17},W3:{position:'WR',value:83,projection:15},W4:{position:'WR',value:78,projection:14},T1:{position:'TE',value:70,projection:11},
    Q2:{position:'QB',value:74,projection:17},R3:{position:'RB',value:88,projection:17},R4:{position:'RB',value:82,projection:15},R5:{position:'RB',value:76,projection:13},
    W5:{position:'WR',value:48,projection:8},W6:{position:'WR',value:44,projection:7},T2:{position:'TE',value:69,projection:10}
  };
  const trades=findTradeOpportunities(snap,'1',values);
  assert.ok(trades.length>0);
  const best=trades[0];
  assert.equal(best.counterpartRosterId,'2');
  assert.ok(['W3','W4'].includes(best.givePlayerIds[0]));
  assert.ok(['R4','R5'].includes(best.getPlayerIds[0]));
  assert.equal(best.needSolved,'RB');
  assert.equal(best.counterpartNeedSolved,'WR');
  assert.ok(best.expectedImprovement>0);
});

test('rejects trades that fail to improve my roster or use invalid ownership', () => {
  const snap=makeSnapshot([
    {rosterId:'1',playerIds:['Q1','R1','R2','W1','W2','T1']},
    {rosterId:'2',playerIds:['Q2','R3','W3','W4','T2']}
  ]);
  const values={
    Q1:{position:'QB',value:90,projection:22},R1:{position:'RB',value:90,projection:18},R2:{position:'RB',value:85,projection:17},
    W1:{position:'WR',value:90,projection:18},W2:{position:'WR',value:85,projection:17},T1:{position:'TE',value:85,projection:15},
    Q2:{position:'QB',value:40,projection:8},R3:{position:'RB',value:40,projection:7},W3:{position:'WR',value:40,projection:7},W4:{position:'WR',value:35,projection:6},T2:{position:'TE',value:40,projection:7},
    NOT_OWNED:{position:'RB',value:100,projection:25}
  };
  const trades=findTradeOpportunities(snap,'1',values);
  assert.equal(trades.some(t=>t.getPlayerIds.includes('NOT_OWNED')),false);
  assert.equal(trades.some(t=>t.expectedImprovement<=0),false);
});

test('scans every other roster, not only this weeks opponent', () => {
  const snap=makeSnapshot([
    {rosterId:'1',playerIds:['Q1','R1','R2','W1','W2','W3','T1']},
    {rosterId:'2',playerIds:['Q2','R3','R4','W4','W5','T2']},
    {rosterId:'3',playerIds:['Q3','R5','R6','R7','W6','W7','T3']}
  ]);
  const values={
    Q1:{position:'QB',value:70},R1:{position:'RB',value:50},R2:{position:'RB',value:48},W1:{position:'WR',value:90},W2:{position:'WR',value:85},W3:{position:'WR',value:80},T1:{position:'TE',value:70},
    Q2:{position:'QB',value:70},R3:{position:'RB',value:60},R4:{position:'RB',value:58},W4:{position:'WR',value:60},W5:{position:'WR',value:58},T2:{position:'TE',value:70},
    Q3:{position:'QB',value:70},R5:{position:'RB',value:90},R6:{position:'RB',value:85},R7:{position:'RB',value:78},W6:{position:'WR',value:44},W7:{position:'WR',value:42},T3:{position:'TE',value:70}
  };
  const trades=findTradeOpportunities(snap,'1',values);
  assert.ok(trades.some(t=>t.counterpartRosterId==='3'));
});

test('marks buy-low and sell-high signals when market and rest-of-season values diverge', () => {
  const snap=makeSnapshot([
    {rosterId:'1',playerIds:['Q1','R1','R2','W1','W2','SELL','T1']},
    {rosterId:'2',playerIds:['Q2','BUY','R4','R5','W4','W5','T2']}
  ]);
  const values={
    Q1:{position:'QB',value:70},R1:{position:'RB',value:50},R2:{position:'RB',value:48},W1:{position:'WR',value:88},W2:{position:'WR',value:84},T1:{position:'TE',value:70},
    SELL:{position:'WR',value:72,marketValue:88,restOfSeasonValue:70},
    Q2:{position:'QB',value:70},BUY:{position:'RB',value:82,marketValue:68,restOfSeasonValue:86},R4:{position:'RB',value:75},R5:{position:'RB',value:72},W4:{position:'WR',value:48},W5:{position:'WR',value:45},T2:{position:'TE',value:70}
  };
  const trades=findTradeOpportunities(snap,'1',values);
  const signal=trades.find(t=>t.givePlayerIds.includes('SELL') && t.getPlayerIds.includes('BUY'));
  assert.ok(signal);
  assert.ok(signal.signals.includes('SELL_HIGH'));
  assert.ok(signal.signals.includes('BUY_LOW'));
});

test('trade recommendations include expected improvement risk confidence and rationale', () => {
  // Use a legal, complete roster shape because ABL-33 now evaluates real before/after lineup impact.
  const snap=makeSnapshot([
    {rosterId:'1',playerIds:['Q1','R1','R2','W1','W2','W3','W4','T1']},
    {rosterId:'2',playerIds:['Q2','R3','R4','R5','W5','W6','T2']}
  ]);
  const values={
    Q1:{position:'QB',value:75,projection:18},R1:{position:'RB',value:48,projection:9},R2:{position:'RB',value:46,projection:8},
    W1:{position:'WR',value:92,projection:18},W2:{position:'WR',value:88,projection:17},W3:{position:'WR',value:83,projection:15},W4:{position:'WR',value:78,projection:14},T1:{position:'TE',value:70,projection:11},
    Q2:{position:'QB',value:74,projection:17},R3:{position:'RB',value:88,projection:17},R4:{position:'RB',value:82,projection:15},R5:{position:'RB',value:76,projection:13},
    W5:{position:'WR',value:48,projection:8},W6:{position:'WR',value:44,projection:7},T2:{position:'TE',value:69,projection:10}
  };
  const [trade]=findTradeOpportunities(snap,'1',values);
  assert.equal(typeof trade.expectedImprovement,'number');
  assert.equal(typeof trade.risk,'number');
  assert.equal(typeof trade.confidence,'number');
  assert.ok(trade.reason.length>20);
});
