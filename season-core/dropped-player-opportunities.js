(function(root,factory){
 const waiverAssassin=typeof module==='object'&&module.exports?require('./waiver-assassin'):root.FFMWaiverAssassin;
 const api=factory(waiverAssassin);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.FFMDroppedPlayerOpportunities=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(waiverAssassin){
 'use strict';
 const text=v=>v==null?'':String(v).trim();
 function recentDroppedPlayerIds(snapshot){
  const free=new Set(snapshot?.freeAgentPlayerIds||[]);
  const seen=new Set(), ids=[];
  for(const tx of snapshot?.transactions||[]){
   if(text(tx?.status).toLowerCase()!=='complete')continue;
   for(const playerId of Object.keys(tx?.drops||{})){
    const id=text(playerId);
    if(id&&free.has(id)&&!seen.has(id)){seen.add(id);ids.push(id);}
   }
  }
  return ids;
 }
 function evaluateDroppedPlayers(snapshot,rosterId,playerValues,context={}){
  const dropped=recentDroppedPlayerIds(snapshot);
  if(!dropped.length)return Object.freeze([]);
  const moves=waiverAssassin.rankWaiverMoves(snapshot,rosterId,playerValues,context);
  const byAdd=new Map(moves.map(move=>[text(move.addPlayerId),move]));
  return Object.freeze(dropped.map(playerId=>{
   const move=byAdd.get(playerId)||null;
   return Object.freeze({
    playerId,
    worthConsidering:!!move&&Number(move.expectedImprovement)>0,
    recommendedAction:move&&Number(move.expectedImprovement)>0?'ADD_DROP':'NO_MOVE',
    addPlayerId:move?.addPlayerId||null,
    dropPlayerId:move?.dropPlayerId||null,
    expectedImprovement:move?.expectedImprovement??null,
    weeklyLineupDelta:move?.weeklyLineupDelta??null,
    confidence:move?.confidence??null,
    risk:move?.risk??null,
    reason:move&&Number(move.expectedImprovement)>0?move.reason:'Recently dropped, but no positive roster-improving add/drop move is currently supported.'
   });
  }));
 }
 return{recentDroppedPlayerIds,evaluateDroppedPlayers};
});
