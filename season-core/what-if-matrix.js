(function(root,factory){
  const contracts=typeof module==='object'&&module.exports?require('./contracts'):root.FFMSeasonContracts;
  const lineupOptimizer=typeof module==='object'&&module.exports?require('./lineup-optimizer'):root.FFMLineupOptimizer;
  const rosterDoctor=typeof module==='object'&&module.exports?require('./roster-doctor'):root.FFMRosterDoctor;
  const restOfSeasonValue=typeof module==='object'&&module.exports?require('./rest-of-season-value'):root.FFMRestOfSeasonValue;
  const dataConfidence=typeof module==='object'&&module.exports?require('./data-confidence'):root.FFMDataConfidence;
  const matchupSimulator=typeof module==='object'&&module.exports?require('./matchup-simulator'):root.FFMMatchupSimulator;
  const tradeAnalyzer=typeof module==='object'&&module.exports?require('./trade-analyzer'):root.FFMTradeAnalyzer;
  const api=factory(contracts,lineupOptimizer,rosterDoctor,restOfSeasonValue,dataConfidence,matchupSimulator,tradeAnalyzer);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FFMWhatIfMatrix=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(contracts,lineupOptimizer,rosterDoctor,restOfSeasonValue,dataConfidence,matchupSimulator,tradeAnalyzer){
  'use strict';

  const text=value=>value==null?'':String(value).trim();
  const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const round=(value,digits=2)=>{const p=10**digits;return Math.round((num(value)+Number.EPSILON)*p)/p;};
  const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,num(value,min)));
  const pos=value=>{const p=text(value).toUpperCase();return p==='DEF'?'DST':p;};

  function clone(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
  function deepFreeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.freeze(value);Object.values(value).forEach(deepFreeze);return value;
  }
  function uniqueIds(values){return[...new Set((Array.isArray(values)?values:[]).map(text).filter(Boolean))];}
  function valueObject(playerValues){
    const out={};
    if(Array.isArray(playerValues)){
      for(const player of playerValues){const id=text(player?.id||player?.playerId);if(id)out[id]={...player,id};}
      return out;
    }
    for(const [key,player] of Object.entries(playerValues&&typeof playerValues==='object'?playerValues:{})){
      const id=text(player?.id||player?.playerId||key);if(id)out[id]={...player,id};
    }
    return out;
  }
  function findRoster(snapshot,rosterId){return(Array.isArray(snapshot?.rosters)?snapshot.rosters:[]).find(roster=>text(roster?.rosterId)===text(rosterId))||null;}

  function normalizeScenario(raw={}){
    const type=text(raw.type).toUpperCase().replace(/[ -]+/g,'_');
    if(type==='START_SIT')return deepFreeze({type,startPlayerId:text(raw.startPlayerId),sitPlayerId:text(raw.sitPlayerId)});
    if(type==='ADD_DROP')return deepFreeze({type,addPlayerId:text(raw.addPlayerId),dropPlayerId:text(raw.dropPlayerId)});
    if(type==='TRADE')return deepFreeze({type,counterpartRosterId:text(raw.counterpartRosterId),givePlayerIds:uniqueIds(raw.givePlayerIds),getPlayerIds:uniqueIds(raw.getPlayerIds)});
    return deepFreeze({type:type||'UNKNOWN'});
  }

  function invalidResult(snapshot,scenario,errors){
    return deepFreeze({
      valid:false,errors:[...errors],scenario,recommendation:null,before:null,after:null,deltas:null,
      confidence:0,risk:1,reasons:[],simulatedSnapshot:null,
      freshness:clone(snapshot?.freshness||{status:'unknown',asOf:null,source:null})
    });
  }

  function playerPool(snapshot,values){
    const ids=uniqueIds([
      ...Object.keys(values),
      ...(snapshot?.ownedPlayerIds||[]),
      ...(snapshot?.freeAgentPlayerIds||[]),
      ...(snapshot?.rosters||[]).flatMap(roster=>roster?.playerIds||[])
    ]);
    return ids.map(id=>values[id]?{...values[id],id}:{id});
  }

  function recanonicalize(snapshot,rosters,values){
    if(!contracts?.normalizeLeagueSnapshot)throw new Error('What-If Matrix requires Season Contracts');
    return contracts.normalizeLeagueSnapshot({
      league:clone(snapshot.league),week:snapshot.week,myRosterId:snapshot.myRosterId,opponentRosterId:snapshot.opponentRosterId,
      rosters:clone(rosters),playerPool:playerPool(snapshot,values),playerStatuses:clone(snapshot.playerStatuses),
      remainingSchedule:clone(snapshot.remainingSchedule),scheduleCoverage:clone(snapshot.scheduleCoverage),freshness:clone(snapshot.freshness)
    });
  }

  function replaceRoster(roster,removeIds,addIds,{starterSwap=null}={}){
    const remove=new Set(removeIds.map(text));
    const playerIds=uniqueIds([...(roster.playerIds||[]).filter(id=>!remove.has(text(id))),...addIds]);
    let starterPlayerIds=uniqueIds((roster.starterPlayerIds||[]).filter(id=>!remove.has(text(id))&&playerIds.includes(text(id))));
    if(starterSwap){starterPlayerIds=starterPlayerIds.map(id=>text(id)===starterSwap.sitPlayerId?starterSwap.startPlayerId:id);}
    const reservePlayerIds=uniqueIds((roster.reservePlayerIds||[]).filter(id=>!remove.has(text(id))&&playerIds.includes(text(id))));
    return{...roster,playerIds,starterPlayerIds,reservePlayerIds};
  }

  function validationErrors(snapshot,rosterId,scenario,values){
    const errors=[];
    if(!snapshot||typeof snapshot!=='object')return['What-If Matrix requires a LeagueSnapshot.'];
    const mine=findRoster(snapshot,rosterId);
    if(!mine)return[`Roster ${text(rosterId)||'(blank)'} was not found.`];
    if(!['START_SIT','ADD_DROP','TRADE'].includes(scenario.type))return[`Unsupported What-If scenario: ${scenario.type}.`];
    const owned=new Set((mine.playerIds||[]).map(text));

    if(scenario.type==='START_SIT'){
      if(!scenario.startPlayerId||!scenario.sitPlayerId)errors.push('START_SIT requires one player to start and one player to sit.');
      if(scenario.startPlayerId===scenario.sitPlayerId&&scenario.startPlayerId)errors.push('Start and sit players must be different.');
      if(scenario.startPlayerId&&!owned.has(scenario.startPlayerId))errors.push(`${scenario.startPlayerId} is not owned by roster ${text(rosterId)}.`);
      if(scenario.sitPlayerId&&!owned.has(scenario.sitPlayerId))errors.push(`${scenario.sitPlayerId} is not owned by roster ${text(rosterId)}.`);
      const starters=new Set((mine.starterPlayerIds||[]).map(text));
      if(scenario.sitPlayerId&&!starters.has(scenario.sitPlayerId))errors.push(`${scenario.sitPlayerId} is not currently in the starting lineup.`);
      if(scenario.startPlayerId&&starters.has(scenario.startPlayerId))errors.push(`${scenario.startPlayerId} is already in the starting lineup.`);
      if(scenario.startPlayerId&&!values[scenario.startPlayerId])errors.push(`Player data is unavailable for ${scenario.startPlayerId}.`);
      if(scenario.sitPlayerId&&!values[scenario.sitPlayerId])errors.push(`Player data is unavailable for ${scenario.sitPlayerId}.`);
    }

    if(scenario.type==='ADD_DROP'){
      if(!scenario.addPlayerId||!scenario.dropPlayerId)errors.push('ADD_DROP requires one player to add and one player to drop.');
      const free=new Set((snapshot.freeAgentPlayerIds||[]).map(text));
      if(scenario.addPlayerId&&!free.has(scenario.addPlayerId))errors.push(`${scenario.addPlayerId} is not a confirmed free agent.`);
      if(scenario.dropPlayerId&&!owned.has(scenario.dropPlayerId))errors.push(`${scenario.dropPlayerId} is not owned by roster ${text(rosterId)}.`);
      if(scenario.addPlayerId&&!values[scenario.addPlayerId])errors.push(`Player data is unavailable for ${scenario.addPlayerId}.`);
      if(scenario.dropPlayerId&&!values[scenario.dropPlayerId])errors.push(`Player data is unavailable for ${scenario.dropPlayerId}.`);
    }

    if(scenario.type==='TRADE'){
      if(!tradeAnalyzer?.analyzeTrade){errors.push('Trade Analyzer is unavailable.');return errors;}
      const trade=tradeAnalyzer.analyzeTrade(snapshot,rosterId,scenario,values);
      if(!trade.valid)errors.push(...(trade.errors||['Trade scenario is invalid.']));
    }
    return errors;
  }

  function applyScenario(snapshot,rosterId,scenario,values){
    const id=text(rosterId);
    const rosters=clone(snapshot.rosters||[]);
    if(scenario.type==='START_SIT'){
      const changed=rosters.map(roster=>text(roster.rosterId)===id
        ?replaceRoster(roster,[],[],{starterSwap:{startPlayerId:scenario.startPlayerId,sitPlayerId:scenario.sitPlayerId}})
        :roster);
      return recanonicalize(snapshot,changed,values);
    }
    if(scenario.type==='ADD_DROP'){
      const changed=rosters.map(roster=>text(roster.rosterId)===id?replaceRoster(roster,[scenario.dropPlayerId],[scenario.addPlayerId]):roster);
      return recanonicalize(snapshot,changed,values);
    }
    const otherId=scenario.counterpartRosterId;
    const changed=rosters.map(roster=>{
      const rid=text(roster.rosterId);
      if(rid===id)return replaceRoster(roster,scenario.givePlayerIds,scenario.getPlayerIds);
      if(rid===otherId)return replaceRoster(roster,scenario.getPlayerIds,scenario.givePlayerIds);
      return roster;
    });
    return recanonicalize(snapshot,changed,values);
  }

  function withRosValues(values,snapshot,context={}){
    let generated={};
    try{generated=valueObject(restOfSeasonValue?.enrichPlayerValues?restOfSeasonValue.enrichPlayerValues(values,snapshot,context.rosContext||{}):values);}catch(_){generated={};}
    const out={};
    for(const [id,player] of Object.entries(values)){
      const explicit=Number(player.restOfSeasonValue);
      out[id]={...generated[id],...player,id,restOfSeasonValue:Number.isFinite(explicit)?explicit:num(generated[id]?.restOfSeasonValue,num(player.value,num(player.projection)))};
    }
    return out;
  }

  function statusAvailable(snapshot,playerId){
    const raw=snapshot?.playerStatuses?.[playerId];
    const label=text(raw?.category||raw?.raw||raw?.status||raw).toUpperCase();
    if(!label)return true;
    return !/(^|\b)(OUT|IR|PUP)(\b|$)|INJURED RESERVE|PHYSICALLY UNABLE/.test(label);
  }

  function confidenceRisk(playerIds,values,snapshot){
    const ids=uniqueIds(playerIds);
    if(!ids.length)return{confidence:0,risk:1};
    if(dataConfidence?.assessPlayerConfidence&&dataConfidence?.combineConfidence){
      const assessments=ids.map(id=>dataConfidence.assessPlayerConfidence({...values[id],id},snapshot,{ownershipState:'known'}));
      const combined=dataConfidence.combineConfidence(assessments,{requireAll:false});
      const confidence=round(clamp(combined?.score),1);
      return{confidence,risk:round(clamp(1-confidence/100,0,1),2)};
    }
    return{confidence:50,risk:.5};
  }

  function explicitLineup(snapshot,rosterId,values,starterIds){
    const ids=uniqueIds(starterIds);
    const slots=lineupOptimizer?.expandStarterSlots?lineupOptimizer.expandStarterSlots(snapshot?.league?.rosterSlots):[];
    if(!slots.length)return{legal:false,error:'League starter slots are unavailable.',expectedTotal:0,starterIds:ids};
    if(ids.length!==slots.length)return{legal:false,error:`Canonical lineup has ${ids.length} starters for ${slots.length} required slots.`,expectedTotal:0,starterIds:ids};
    const players=ids.map(id=>({id,position:pos(values[id]?.position),projection:num(values[id]?.projection,num(values[id]?.value)),available:statusAvailable(snapshot,id)}));
    if(players.some(player=>!player.position||!player.available))return{legal:false,error:'Requested starting lineup contains an unavailable player or missing position.',expectedTotal:0,starterIds:ids};
    const used=new Set();
    function assign(index){
      if(index>=slots.length)return[];
      const slot=slots[index];
      for(const player of players){
        if(used.has(player.id)||!slot.eligiblePositions.includes(player.position))continue;
        used.add(player.id);const tail=assign(index+1);if(tail)return[{slotId:slot.slotId,slotType:slot.slotType,playerId:player.id},...tail];used.delete(player.id);
      }
      return null;
    }
    const assignments=assign(0);
    if(!assignments)return{legal:false,error:'Requested start/sit swap cannot fill the league starter slots legally.',expectedTotal:0,starterIds:ids};
    return{legal:true,error:null,expectedTotal:round(players.reduce((sum,player)=>sum+player.projection,0),2),starterIds:ids,assignments};
  }

  function doctorMetrics(snapshot,rosterId,values){
    const doctorValues={};
    for(const [id,player] of Object.entries(values))doctorValues[id]={...player,value:num(player.restOfSeasonValue,num(player.value,num(player.projection)))};
    try{
      const report=rosterDoctor.evaluateRoster(snapshot,rosterId,doctorValues);
      return{depth:round(report?.benchDepth?.score,1),grade:round(report?.overallGrade,1),report};
    }catch(_){return{depth:0,grade:0,report:null};}
  }

  function rosterValue(snapshot,rosterId,values){
    const roster=findRoster(snapshot,rosterId);if(!roster)return 0;
    return round((roster.playerIds||[]).reduce((sum,id)=>sum+num(values[text(id)]?.restOfSeasonValue,num(values[text(id)]?.value,num(values[text(id)]?.projection))),0),2);
  }

  function forcedMatchupProbability(snapshot,rosterId,values,starterIds,context){
    if(!snapshot?.opponentRosterId||!matchupSimulator?.simulateMatchup)return null;
    try{
      const id=text(rosterId);
      const rosters=clone(snapshot.rosters||[]).map(roster=>text(roster.rosterId)===id?{...roster,playerIds:[...starterIds],starterPlayerIds:[...starterIds],reservePlayerIds:[]}:roster);
      const forced=recanonicalize(snapshot,rosters,values);
      const result=matchupSimulator.simulateMatchup(forced,id,values,{seed:`${text(context.seed)||'what-if'}:forced`,iterations:context.iterations||700});
      return Number.isFinite(Number(result?.winProbability))?round(result.winProbability,1):null;
    }catch(_){return null;}
  }

  function optimizedMatchupProbability(snapshot,rosterId,values,context){
    if(!snapshot?.opponentRosterId||!matchupSimulator?.simulateMatchup)return null;
    try{
      const result=matchupSimulator.simulateMatchup(snapshot,rosterId,values,{seed:`${text(context.seed)||'what-if'}:optimized`,iterations:context.iterations||700});
      return Number.isFinite(Number(result?.winProbability))?round(result.winProbability,1):null;
    }catch(_){return null;}
  }

  function evaluateState(snapshot,rosterId,rawValues,context={},explicitStarterIds=null){
    const values=withRosValues(rawValues,snapshot,context);
    let lineupPoints=0,starterIds=[];
    if(explicitStarterIds){
      const lineup=explicitLineup(snapshot,rosterId,values,explicitStarterIds);
      if(!lineup.legal)throw new Error(lineup.error);
      lineupPoints=lineup.expectedTotal;starterIds=lineup.starterIds;
    }else{
      const lineup=lineupOptimizer.optimizeLineup(snapshot,rosterId,values);
      if(!lineup.legal)throw new Error('Scenario cannot produce a legal optimized starting lineup.');
      lineupPoints=round(lineup.expectedTotal,2);starterIds=(lineup.starters||[]).map(item=>item.playerId);
    }
    const doctor=doctorMetrics(snapshot,rosterId,values);
    const cr=confidenceRisk(starterIds,values,snapshot);
    const matchupWinProbability=explicitStarterIds
      ?forcedMatchupProbability(snapshot,rosterId,values,starterIds,context)
      :optimizedMatchupProbability(snapshot,rosterId,values,context);
    return deepFreeze({
      lineupPoints,rosterValue:rosterValue(snapshot,rosterId,values),positionalDepth:doctor.depth,
      matchupWinProbability,confidence:cr.confidence,risk:cr.risk,starterPlayerIds:[...starterIds]
    });
  }

  function classify(deltas){
    const matchup=deltas.matchupWinProbability===null?0:deltas.matchupWinProbability;
    const score=num(deltas.lineupEdge)*2.5+num(deltas.rosterValue)*.08+num(deltas.positionalDepth)*.08+matchup*.18+num(deltas.confidence)*.04-num(deltas.risk)*25;
    return score>1?'IMPROVES TEAM':score<-1?'HURTS TEAM':'NEUTRAL';
  }

  function simulateScenario(snapshot,rosterId,playerValues,rawScenario={},context={}){
    const id=text(rosterId||snapshot?.myRosterId);
    const scenario=normalizeScenario(rawScenario);
    const values=valueObject(playerValues);
    const errors=validationErrors(snapshot,id,scenario,values);
    if(errors.length)return invalidResult(snapshot,scenario,errors);

    let simulated;
    try{simulated=applyScenario(snapshot,id,scenario,values);}catch(error){return invalidResult(snapshot,scenario,[text(error?.message||error)]);}

    let before,after;
    try{
      if(scenario.type==='START_SIT'){
        const mine=findRoster(snapshot,id);
        const beforeStarters=uniqueIds(mine?.starterPlayerIds);
        const afterStarters=uniqueIds(findRoster(simulated,id)?.starterPlayerIds);
        before=evaluateState(snapshot,id,values,context,beforeStarters);
        after=evaluateState(simulated,id,values,context,afterStarters);
      }else{
        before=evaluateState(snapshot,id,values,context);
        after=evaluateState(simulated,id,values,context);
      }
    }catch(error){return invalidResult(snapshot,scenario,[text(error?.message||error)]);}

    const matchupDelta=before.matchupWinProbability===null||after.matchupWinProbability===null?null:round(after.matchupWinProbability-before.matchupWinProbability,1);
    const deltas=deepFreeze({
      lineupEdge:round(after.lineupPoints-before.lineupPoints,2),
      rosterValue:round(after.rosterValue-before.rosterValue,2),
      positionalDepth:round(after.positionalDepth-before.positionalDepth,1),
      matchupWinProbability:matchupDelta,
      confidence:round(after.confidence-before.confidence,1),
      risk:round(after.risk-before.risk,2)
    });
    const recommendation=classify(deltas);
    const confidence=round((before.confidence+after.confidence)/2,1);
    const risk=round(Math.max(before.risk,after.risk),2);
    const reasons=[
      `${scenario.type.replace('_','/')} simulation is isolated from the synced league state.`,
      `${recommendation}: lineup edge ${deltas.lineupEdge>=0?'+':''}${deltas.lineupEdge}, roster value ${deltas.rosterValue>=0?'+':''}${deltas.rosterValue}, and positional depth ${deltas.positionalDepth>=0?'+':''}${deltas.positionalDepth}.`,
      matchupDelta===null?'Current matchup probability is unavailable for this scenario, so no win-probability edge is invented.':`Current matchup win probability changes ${matchupDelta>=0?'+':''}${matchupDelta} percentage points.`
    ];
    if(scenario.type==='TRADE'){
      const trade=tradeAnalyzer.analyzeTrade(snapshot,id,scenario,values);
      if(trade?.fairness?.label)reasons.push(`Trade Analyzer market fairness: ${trade.fairness.label}; roster benefit: ${trade.rosterBenefit?.label||'UNKNOWN'}.`);
    }
    return deepFreeze({
      valid:true,errors:[],scenario,recommendation,before,after,deltas,confidence,risk,reasons,
      simulatedSnapshot:simulated,freshness:clone(snapshot?.freshness||{status:'unknown',asOf:null,source:null})
    });
  }

  return{simulateScenario,normalizeScenario};
});
