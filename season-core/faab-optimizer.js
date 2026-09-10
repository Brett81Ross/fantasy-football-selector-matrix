(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FFMFaabOptimizer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(Number(value))?Number(value):0));
  const round=(value,digits=1)=>{const p=10**digits;return Math.round((Number(value)+Number.EPSILON)*p)/p;};
  const text=value=>value==null?'':String(value).trim();
  const numeric=(value,fallback=null)=>{
    if(value===null||value===undefined||value==='')return fallback;
    const n=Number(value);return Number.isFinite(n)?n:fallback;
  };

  function mapValues(playerValues){
    if(Array.isArray(playerValues))return new Map(playerValues.map(player=>[text(player?.id||player?.playerId),player]).filter(([id])=>id));
    return new Map(Object.entries(playerValues&&typeof playerValues==='object'?playerValues:{}));
  }

  function playerValue(player={}){
    for(const candidate of [player.restOfSeasonValue,player.value,player.marketValue,player.projection]){
      const n=numeric(candidate,null);if(n!==null)return n;
    }
    return 0;
  }

  function unavailable(reason,budgetTotal=null,budgetRemaining=null){
    return Object.freeze({
      available:false,recommendedBid:null,minBid:null,maxBid:null,
      budgetRemaining,budgetTotal,budgetShare:null,confidence:0,risk:1,
      aggressiveness:'UNAVAILABLE',
      factors:Object.freeze({need:0,valueEdge:0,scarcity:0,leaguePressure:0,improvement:0}),
      reason
    });
  }

  function targetPosition(move,addPlayer){
    return text(move?.targetPosition||addPlayer?.position).toUpperCase();
  }

  function needFactor(move,position,context){
    const grades=context?.rosterReport?.positionalGrades;
    const rawGrade=grades&&typeof grades==='object'?numeric(grades[position],null):null;
    if(rawGrade!==null)return round(clamp((80-rawGrade)/50),3);
    return round(clamp(numeric(move?.expectedImprovement,0)/25),3);
  }

  function valueEdgeFactor(addPlayer,dropPlayer,move){
    const edge=Math.max(0,playerValue(addPlayer)-playerValue(dropPlayer));
    const moveEdge=Math.max(0,numeric(move?.expectedImprovement,0));
    return round(clamp(Math.max(edge/45,moveEdge/35)),3);
  }

  function scarcityFactor(snapshot,position,targetId,values,addPlayer){
    const target=playerValue(addPlayer);
    const alternatives=(snapshot?.freeAgentPlayerIds||[])
      .map(text)
      .filter(id=>id&&id!==targetId)
      .map(id=>values.get(id))
      .filter(player=>player&&text(player.position).toUpperCase()===position)
      .map(playerValue)
      .filter(Number.isFinite)
      .sort((a,b)=>b-a);
    if(!alternatives.length)return 1;
    const bestAlternative=alternatives[0];
    return round(clamp((target-bestAlternative)/40),3);
  }

  function leaguePressureFactor(snapshot){
    const teams=numeric(snapshot?.league?.teams,0);
    return round(clamp((teams-8)/8),3);
  }

  function improvementFactor(move){
    const edge=clamp(numeric(move?.expectedImprovement,0)/25);
    const priority=clamp(numeric(move?.priority,0)/45);
    return round(edge*.65+priority*.35,3);
  }

  function confidenceFor(snapshot,move){
    let confidence=clamp(numeric(move?.confidence,70),0,100);
    const freshness=text(snapshot?.freshness?.status).toLowerCase();
    if(freshness==='stale')confidence-=15;
    else if(freshness==='disconnected')confidence-=35;
    else if(freshness==='unknown')confidence-=20;
    return round(clamp(confidence,0,100),1);
  }

  function aggressivenessFor(share){
    if(share<=10)return 'CONSERVATIVE';
    if(share<=25)return 'BALANCED';
    if(share<=45)return 'AGGRESSIVE';
    return 'MAXIMUM_EDGE';
  }

  function optimizeFaabBid(snapshot,rosterId,waiverMove,playerValues,context={}){
    if(!snapshot||typeof snapshot!=='object')return unavailable('FAAB bid unavailable because the league snapshot is missing.');
    const id=text(rosterId||snapshot.myRosterId);
    const roster=(snapshot.rosters||[]).find(item=>text(item?.rosterId)===id);
    const budgetTotal=numeric(snapshot?.league?.waiverBudgetTotal,null);
    const waiverType=text(snapshot?.league?.waiverType).toLowerCase();
    if(waiverType!=='faab')return unavailable('FAAB bid unavailable because this league is not confirmed as a FAAB league.',budgetTotal,roster?numeric(roster.waiverBudgetRemaining,null):null);
    if(budgetTotal===null||budgetTotal<=0)return unavailable('FAAB bid unavailable because the league budget total is unknown; the Matrix will not invent a dollar budget.',budgetTotal,roster?numeric(roster.waiverBudgetRemaining,null):null);
    if(!roster)return unavailable(`FAAB bid unavailable because roster ${id||'(blank)'} was not found.`,budgetTotal,null);
    const budgetRemaining=numeric(roster.waiverBudgetRemaining,null);
    if(budgetRemaining===null)return unavailable('FAAB bid unavailable because remaining budget is unknown.',budgetTotal,null);
    if(budgetRemaining<=0)return unavailable('FAAB bid unavailable because this roster has no FAAB remaining.',budgetTotal,0);

    const addId=text(waiverMove?.addPlayerId),dropId=text(waiverMove?.dropPlayerId);
    if(!addId||!dropId)return unavailable('FAAB bid unavailable because the waiver move is missing an add or drop player.',budgetTotal,budgetRemaining);
    if(!(snapshot.freeAgentPlayerIds||[]).map(text).includes(addId))return unavailable('FAAB bid unavailable because the target is not a confirmed free agent.',budgetTotal,budgetRemaining);
    if(!(roster.playerIds||[]).map(text).includes(dropId))return unavailable('FAAB bid unavailable because the proposed drop is not owned by this roster.',budgetTotal,budgetRemaining);

    const values=mapValues(playerValues);
    const addPlayer=values.get(addId)||{};
    const dropPlayer=values.get(dropId)||{};
    const position=targetPosition(waiverMove,addPlayer);
    const need=needFactor(waiverMove,position,context);
    const valueEdge=valueEdgeFactor(addPlayer,dropPlayer,waiverMove);
    const scarcity=scarcityFactor(snapshot,position,addId,values,addPlayer);
    const leaguePressure=leaguePressureFactor(snapshot);
    const improvement=improvementFactor(waiverMove);

    const targetShare=clamp(
      .025+
      need*.20+
      valueEdge*.23+
      scarcity*.20+
      leaguePressure*.08+
      improvement*.22,
      .01,.70
    );
    const uncapped=Math.max(1,Math.round(budgetTotal*targetShare));
    const recommendedBid=Math.min(Math.floor(budgetRemaining),uncapped);
    if(recommendedBid<=0)return unavailable('FAAB bid unavailable because the remaining budget cannot support a positive bid.',budgetTotal,budgetRemaining);

    const minBid=Math.min(recommendedBid,Math.max(1,Math.floor(recommendedBid*.75)));
    const maxBid=Math.min(Math.floor(budgetRemaining),Math.max(recommendedBid,Math.ceil(recommendedBid*1.25)));
    const budgetShare=round(recommendedBid/budgetTotal*100,1);
    const confidence=confidenceFor(snapshot,waiverMove);
    const moveRisk=clamp(numeric(waiverMove?.risk,.35));
    const spendPressure=clamp(recommendedBid/Math.max(1,budgetRemaining));
    const risk=round(clamp(moveRisk*.6+spendPressure*.4),2);
    const aggressiveness=aggressivenessFor(budgetShare);
    const addName=text(addPlayer?.name)||addId;
    const reason=`Bid $${recommendedBid} (range $${minBid}–$${maxBid}) for ${addName}. The recommendation uses ${position||'target-position'} need, a ${round(valueEdge*100)}% value-edge signal, ${round(scarcity*100)}% scarcity pressure, ${round(leaguePressure*100)}% league-size pressure, and preserves the hard $${round(budgetRemaining,0)} remaining-budget cap.`;

    return Object.freeze({
      available:true,recommendedBid,minBid,maxBid,budgetRemaining:round(budgetRemaining,2),budgetTotal:round(budgetTotal,2),budgetShare,
      confidence,risk,aggressiveness,
      factors:Object.freeze({need,valueEdge,scarcity,leaguePressure,improvement}),
      reason
    });
  }

  return{optimizeFaabBid,playerValue};
});
