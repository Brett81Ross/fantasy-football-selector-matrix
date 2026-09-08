const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeLeagueSnapshot } = require('../season-core/contracts');
const { rankWaiverMoves } = require('../season-core/waiver-assassin');

const slots = [
  {id:'QB',type:'QB',count:1,eligiblePositions:['QB'],isBench:false,isReserve:false},
  {id:'RB',type:'RB',count:2,eligiblePositions:['RB'],isBench:false,isReserve:false},
  {id:'WR',type:'WR',count:2,eligiblePositions:['WR'],isBench:false,isReserve:false},
  {id:'TE',type:'TE',count:1,eligiblePositions:['TE'],isBench:false,isReserve:false},
  {id:'FLEX',type:'FLEX',count:1,eligiblePositions:['RB','WR','TE'],isBench:false,isReserve:false},
  {id:'BN',type:'BN',count:4,eligiblePositions:['QB','RB','WR','TE'],isBench:true,isReserve:false},
  {id:'IR',type:'IR',count:1,eligiblePositions:['QB','RB','WR','TE'],isBench:false,isReserve:true}
];

function makeSnapshot({mine, other=['OWNED'], free=['FA_RB','FA_WR','FA_PUP'], statuses={}}) {
  return normalizeLeagueSnapshot({
    league:{leagueId:'L1',platform:'sleeper',season:2026,teams:2,scoring:{rec:1},rosterSlots:slots},
    week:6,myRosterId:'1',opponentRosterId:'2',
    rosters:[{rosterId:'1',playerIds:mine},{rosterId:'2',playerIds:other}],
    playerPool:[...mine,...other,...free].map(id=>({id})),
    playerStatuses:statuses,
    freshness:{status:'fresh',asOf:'2026-09-08T03:00:00.000Z'}
  });
}

test('never recommends a player owned by any roster as a waiver add', () => {
  const snap=makeSnapshot({mine:['QB1','RB1','RB2','WR1','WR2','TE1','B1'],other:['OWNED']});
  const moves=rankWaiverMoves(snap,'1',{
    QB1:{position:'QB',value:70,projection:18},RB1:{position:'RB',value:65,projection:12},RB2:{position:'RB',value:60,projection:11},
    WR1:{position:'WR',value:85,projection:17},WR2:{position:'WR',value:80,projection:16},TE1:{position:'TE',value:70,projection:12},B1:{position:'WR',value:40,projection:6},
    OWNED:{position:'RB',value:99,projection:25},FA_RB:{position:'RB',value:75,projection:15},FA_WR:{position:'WR',value:60,projection:10},FA_PUP:{position:'RB',value:90,projection:20}
  });
  assert.ok(moves.length>0);
  assert.equal(moves.some(move=>move.addPlayerId==='OWNED'),false);
});

test('prioritizes an upgrade at the roster biggest weakness', () => {
  const snap=makeSnapshot({mine:['QB1','RB1','RB2','WR1','WR2','WR3','TE1'],free:['FA_RB','FA_WR']});
  const values={
    QB1:{position:'QB',value:78,projection:18},RB1:{position:'RB',value:48,projection:9},RB2:{position:'RB',value:45,projection:8},
    WR1:{position:'WR',value:92,projection:18},WR2:{position:'WR',value:88,projection:17},WR3:{position:'WR',value:82,projection:14},TE1:{position:'TE',value:72,projection:12},
    FA_RB:{position:'RB',value:76,projection:15},FA_WR:{position:'WR',value:79,projection:15},OWNED:{position:'QB',value:50,projection:8}
  };
  const moves=rankWaiverMoves(snap,'1',values);
  assert.equal(moves[0].addPlayerId,'FA_RB');
  assert.equal(moves[0].targetPosition,'RB');
  assert.ok(moves[0].expectedImprovement>0);
});

test('Maximum Edge allows aggressive bench churn when the replacement materially improves the roster', () => {
  const snap=makeSnapshot({mine:['QB1','RB1','RB2','WR1','WR2','TE1','BUST'],free:['UPSIDE']});
  const moves=rankWaiverMoves(snap,'1',{
    QB1:{position:'QB',value:75,projection:18},RB1:{position:'RB',value:72,projection:13},RB2:{position:'RB',value:70,projection:12},
    WR1:{position:'WR',value:80,projection:16},WR2:{position:'WR',value:78,projection:15},TE1:{position:'TE',value:68,projection:11},
    BUST:{position:'WR',value:34,projection:4},UPSIDE:{position:'RB',value:72,projection:14},OWNED:{position:'QB',value:40,projection:7}
  });
  const move=moves.find(item=>item.addPlayerId==='UPSIDE');
  assert.ok(move);
  assert.equal(move.dropPlayerId,'BUST');
  assert.equal(move.aggressiveness,'MAXIMUM_EDGE');
});

test('PUP and IR waiver targets are treated as stashes rather than healthy immediate upgrades', () => {
  const snap=makeSnapshot({
    mine:['QB1','RB1','RB2','WR1','WR2','TE1','B1'],
    free:['HEALTHY','PUPSTAR'],
    statuses:{HEALTHY:{raw:'Active'},PUPSTAR:{raw:'PUP'}}
  });
  const moves=rankWaiverMoves(snap,'1',{
    QB1:{position:'QB',value:75,projection:18},RB1:{position:'RB',value:60,projection:10},RB2:{position:'RB',value:58,projection:9},
    WR1:{position:'WR',value:80,projection:16},WR2:{position:'WR',value:78,projection:15},TE1:{position:'TE',value:68,projection:11},B1:{position:'WR',value:38,projection:5},
    HEALTHY:{position:'RB',value:74,projection:14},PUPSTAR:{position:'RB',value:92,projection:20},OWNED:{position:'QB',value:40,projection:7}
  });
  assert.equal(moves[0].addPlayerId,'HEALTHY');
  const pup=moves.find(move=>move.addPlayerId==='PUPSTAR');
  assert.ok(pup);
  assert.equal(pup.classification,'STASH');
  assert.ok(pup.risk>moves[0].risk);
});

test('waiver moves expose priority improvement risk confidence and reasoning', () => {
  const snap=makeSnapshot({mine:['RB1','B1'],free:['FA1']});
  const [move]=rankWaiverMoves(snap,'1',{
    RB1:{position:'RB',value:50,projection:8},B1:{position:'WR',value:30,projection:4},FA1:{position:'RB',value:75,projection:14},OWNED:{position:'QB',value:40,projection:7}
  });
  assert.equal(typeof move.priority,'number');
  assert.equal(typeof move.expectedImprovement,'number');
  assert.equal(typeof move.risk,'number');
  assert.equal(typeof move.confidence,'number');
  assert.ok(move.reason.length>15);
  assert.ok(['IMMEDIATE','STREAMER','STASH'].includes(move.classification));
});
