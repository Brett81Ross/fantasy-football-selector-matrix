const test=require('node:test');
const assert=require('node:assert/strict');
const dropped=require('../season-core/dropped-player-opportunities');

test('recent drops only include completed transactions whose players remain free agents',()=>{
 const snapshot={
  freeAgentPlayerIds:['DROP_GOOD','OTHER'],
  transactions:[
   {status:'complete',createdAt:3,drops:{DROP_GOOD:'2'}},
   {status:'pending',createdAt:2,drops:{PENDING:'3'}},
   {status:'complete',createdAt:1,drops:{RECLAIMED:'4'}}
  ]
 };
 assert.deepEqual(dropped.recentDroppedPlayerIds(snapshot),['DROP_GOOD']);
});

test('dropped player with no supported positive move is explicitly NO_MOVE',()=>{
 const snapshot={
  freeAgentPlayerIds:['DROP_BAD'],
  transactions:[{status:'complete',createdAt:3,drops:{DROP_BAD:'2'}}]
 };
 const original=require('../season-core/waiver-assassin').rankWaiverMoves;
 require('../season-core/waiver-assassin').rankWaiverMoves=()=>[];
 delete require.cache[require.resolve('../season-core/dropped-player-opportunities')];
 const isolated=require('../season-core/dropped-player-opportunities');
 const result=isolated.evaluateDroppedPlayers(snapshot,'1',{});
 assert.equal(result[0].playerId,'DROP_BAD');
 assert.equal(result[0].worthConsidering,false);
 assert.equal(result[0].recommendedAction,'NO_MOVE');
 require('../season-core/waiver-assassin').rankWaiverMoves=original;
 delete require.cache[require.resolve('../season-core/dropped-player-opportunities')];
});


test('Weekly Attack Plan integration is wired to actionable dropped-player engine',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../season-core/weekly-attack-plan.js'),'utf8');
 assert.match(source,/evaluateDroppedPlayers/);
 assert.match(source,/type:'NEWLY_DROPPED'/);
 assert.match(source,/filter\(item=>item\.worthConsidering\)/);
 assert.match(source,/recommendedAction:'ADD_DROP'/);
});
