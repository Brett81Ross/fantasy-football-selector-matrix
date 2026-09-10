(function(root,factory){
  const lineupOptimizer=typeof module==='object'&&module.exports?require('./lineup-optimizer'):root.FFMLineupOptimizer;
  const rosterDoctor=typeof module==='object'&&module.exports?require('./roster-doctor'):root.FFMRosterDoctor;
  const restOfSeasonValue=typeof module==='object'&&module.exports?require('./rest-of-season-value'):root.FFMRestOfSeasonValue;
  const dataConfidence=typeof module==='object'&&module.exports?require('./data-confidence'):root.FFMDataConfidence;
  const api=factory(lineupOptimizer,rosterDoctor,restOfSeasonValue,dataConfidence);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FFMTradeAnalyzer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(lineupOptimizer,rosterDoctor,restOfSeasonValue,dataConfidence){
  'use strict';

  const text=value=>value==null?'':String(value).trim();
  const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,num(value,min)));
  const round=(value,digits=2)=>{const p=10**digits;return Math.round((num(value)+Number.EPSILON)*p)/p;};

  function deepFreeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
    return value;
  }

  function clone(value){
    return value===undefined?undefined:JSON.parse(JSON.stringify(value));
  }

  function valueObject(playerValues){
    if(Array.isArray(playerValues)){
      const out={};
      for(const player of playerValues){
        const id=text(player?.id||player?.playerId);
        if(id)out[id]={...player,id};
      }
      return out;
    }
    const out={};
    for(const [key,player] of Object.entries(playerValues&&typeof playerValues==='object'?playerValues:{})){
      const id=text(player?.id||player?.playerId||key);
      if(id)out[id]={...player,id};
    }
    return out;
  }

  function withRosValues(playerValues,snapshot,context={}){
    const original=valueObject(playerValues);
    let computed={};
    try{
      computed=restOfSeasonValue?.enrichPlayerValues
        ? valueObject(restOfSeasonValue.enrichPlayerValues(original,snapshot,context.rosContext||{}))
        : {};
    }catch(_){computed={};}
    const out={};
    for(const [id,player] of Object.entries(original)){
      const generated=computed[id]||{};
      const explicitRos=Number(player?.restOfSeasonValue);
      out[id]={
        ...generated,
        ...player,
        id,
        restOfSeasonValue:Number.isFinite(explicitRos)?explicitRos:num(generated?.restOfSeasonValue,num(player?.value,num(player?.projection)))
      };
    }
    return out;
  }

  function uniqueIds(values){
    return [...new Set((Array.isArray(values)?values:[]).map(text).filter(Boolean))];
  }

  function findRoster(snapshot,rosterId){
    const id=text(rosterId);
    return (Array.isArray(snapshot?.rosters)?snapshot.rosters:[]).find(roster=>text(roster?.rosterId)===id)||null;
  }

  function validationErrors(snapshot,rosterId,deal){
    const errors=[];
    if(!snapshot||typeof snapshot!=='object')return['Trade Analyzer requires a LeagueSnapshot.'];
    const mine=findRoster(snapshot,rosterId);
    const counterpart=findRoster(snapshot,deal?.counterpartRosterId);
    const giveRaw=(Array.isArray(deal?.givePlayerIds)?deal.givePlayerIds:[]).map(text).filter(Boolean);
    const getRaw=(Array.isArray(deal?.getPlayerIds)?deal.getPlayerIds:[]).map(text).filter(Boolean);
    const give=uniqueIds(giveRaw);
    const get=uniqueIds(getRaw);
    if(!mine)errors.push(`Roster ${text(rosterId)||'(blank)'} was not found.`);
    if(!counterpart)errors.push(`Counterpart roster ${text(deal?.counterpartRosterId)||'(blank)'} was not found.`);
    if(!give.length)errors.push('At least one player must be given.');
    if(!get.length)errors.push('At least one player must be received.');
    if(give.length!==giveRaw.length)errors.push('Give-player IDs must be unique.');
    if(get.length!==getRaw.length)errors.push('Receive-player IDs must be unique.');
    if(give.length!==get.length)errors.push('ABL-33 requires equal player counts on both sides of the trade.');
    const overlap=give.filter(id=>get.includes(id));
    if(overlap.length)errors.push(`A player cannot be on both sides of the trade: ${overlap.join(', ')}.`);
    if(mine){
      const owned=new Set(Array.isArray(mine.playerIds)?mine.playerIds.map(text):[]);
      for(const id of give)if(!owned.has(id))errors.push(`${id} is not owned by roster ${text(rosterId)}.`);
    }
    if(counterpart){
      const owned=new Set(Array.isArray(counterpart.playerIds)?counterpart.playerIds.map(text):[]);
      for(const id of get)if(!owned.has(id))errors.push(`${id} is not owned by roster ${text(deal?.counterpartRosterId)}.`);
    }
    return errors;
  }

  function invalidResult(snapshot,deal,errors){
    return deepFreeze({
      valid:false,
      errors:[...errors],
      fairness:null,
      rosterBenefit:null,
      before:null,
      after:null,
      deltas:null,
      confidence:0,
      risk:1,
      reasons:[],
      risks:[...errors],
      freshness:clone(snapshot?.freshness||{status:'unknown',asOf:null,source:null}),
      affectedPlayerIds:uniqueIds([...(deal?.givePlayerIds||[]),...(deal?.getPlayerIds||[])]).sort()
    });
  }

  function replaceRosterPlayers(roster,removeIds,addIds){
    const remove=new Set(removeIds);
    const playerIds=uniqueIds([
      ...(Array.isArray(roster.playerIds)?roster.playerIds:[]).filter(id=>!remove.has(text(id))),
      ...addIds
    ]);
    const keepCurrent=values=>uniqueIds((Array.isArray(values)?values:[]).filter(id=>!remove.has(text(id))&&playerIds.includes(text(id))));
    return {
      ...roster,
      playerIds,
      starterPlayerIds:keepCurrent(roster.starterPlayerIds),
      reservePlayerIds:keepCurrent(roster.reservePlayerIds)
    };
  }

  function applyTrade(snapshot,rosterId,deal){
    const copy=clone(snapshot);
    const mineId=text(rosterId);
    const otherId=text(deal.counterpartRosterId);
    const give=uniqueIds(deal.givePlayerIds);
    const get=uniqueIds(deal.getPlayerIds);
    copy.rosters=(Array.isArray(copy.rosters)?copy.rosters:[]).map(roster=>{
      const id=text(roster?.rosterId);
      if(id===mineId)return replaceRosterPlayers(roster,give,get);
      if(id===otherId)return replaceRosterPlayers(roster,get,give);
      return roster;
    });
    return copy;
  }

  function explicitPlayoffOutlook(roster,values){
    const scores=[];
    for(const id of Array.isArray(roster?.playerIds)?roster.playerIds:[]){
      const raw=values[text(id)]||{};
      if(raw?.rosFactors&&Object.prototype.hasOwnProperty.call(raw.rosFactors,'playoffSchedule')){
        const score=Number(raw.rosFactors.playoffSchedule);
        if(Number.isFinite(score))scores.push(score);
      }
    }
    return scores.length?round(scores.reduce((sum,value)=>sum+value,0)/scores.length,1):null;
  }

  function demandedFloor(report){
    const weights=report?.demand?.positionWeights||{};
    const grades=report?.positionalGrades||{};
    const demanded=Object.entries(weights)
      .filter(([,weight])=>num(weight)>0)
      .map(([position])=>Number(grades[position]))
      .filter(Number.isFinite);
    return demanded.length?round(Math.min(...demanded),1):round(num(report?.overallGrade),1);
  }

  function rosterRosAverage(roster,values){
    const scores=(Array.isArray(roster?.playerIds)?roster.playerIds:[])
      .map(id=>Number(values[text(id)]?.restOfSeasonValue))
      .filter(Number.isFinite);
    return scores.length?round(scores.reduce((sum,value)=>sum+value,0)/scores.length,2):0;
  }

  function evaluateState(snapshot,rosterId,values,rawValues,counterpartRosterId){
    const roster=findRoster(snapshot,rosterId);
    const counterpart=findRoster(snapshot,counterpartRosterId);
    const doctorValues={};
    for(const [id,player] of Object.entries(values))doctorValues[id]={...player,value:num(player.restOfSeasonValue,num(player.value,num(player.projection)))};
    const lineup=lineupOptimizer.optimizeLineup(snapshot,rosterId,values);
    const counterpartLineup=lineupOptimizer.optimizeLineup(snapshot,counterpartRosterId,values);
    const report=rosterDoctor.evaluateRoster(snapshot,rosterId,doctorValues);
    const positionalResilience=demandedFloor(report);
    const depthResilience=round(clamp(
      num(report?.benchDepth?.score)*0.25+
      num(report?.overallGrade)*0.40+
      (100-num(report?.healthRisk?.score))*0.15+
      positionalResilience*0.20
    ),1);
    return deepFreeze({
      rosterCount:Array.isArray(roster?.playerIds)?roster.playerIds.length:0,
      counterpartRosterCount:Array.isArray(counterpart?.playerIds)?counterpart.playerIds.length:0,
      lineupPoints:round(lineup.expectedTotal,2),
      lineupLegal:lineup.legal===true,
      counterpartLineupLegal:counterpartLineup.legal===true,
      depthResilience,
      positionalResilience,
      restOfSeasonValue:rosterRosAverage(roster,values),
      playoffOutlook:explicitPlayoffOutlook(roster,rawValues),
      overallRosterGrade:round(report?.overallGrade,1)
    });
  }

  function marketValue(player){
    return num(player?.marketValue,num(player?.value,num(player?.projection)));
  }

  function fairnessFor(deal,values){
    const outgoing=uniqueIds(deal.givePlayerIds).reduce((sum,id)=>sum+marketValue(values[id]),0);
    const incoming=uniqueIds(deal.getPlayerIds).reduce((sum,id)=>sum+marketValue(values[id]),0);
    const delta=round(incoming-outgoing,2);
    const denominator=Math.max(1,(Math.abs(incoming)+Math.abs(outgoing))/2);
    const relativeGap=Math.abs(delta)/denominator;
    const score=round(clamp(100-relativeGap*100),1);
    let label='FAIR';
    if(relativeGap>0.10&&relativeGap<=0.25)label=delta>0?'SLIGHT_EDGE_TO_ME':'SLIGHT_EDGE_TO_THEM';
    else if(relativeGap>0.25)label=delta>0?'EDGE_TO_ME':'EDGE_TO_THEM';
    return deepFreeze({label,score,outgoing:round(outgoing,2),incoming:round(incoming,2),delta});
  }

  function confidenceFor(ids,values,snapshot){
    if(!dataConfidence?.assessPlayerConfidence||!dataConfidence?.combineConfidence)return deepFreeze({score:50,label:'LOW'});
    const assessments=ids.map(id=>dataConfidence.assessPlayerConfidence({...values[id],id},snapshot,{ownershipState:'known'}));
    return dataConfidence.combineConfidence(assessments,{requireAll:false});
  }

  function analyzeTrade(snapshot,rosterId,deal={},playerValues={},context={}){
    const errors=validationErrors(snapshot,rosterId,deal);
    if(errors.length)return invalidResult(snapshot,deal,errors);

    const rawValues=valueObject(playerValues);
    const values=withRosValues(playerValues,snapshot,context);
    const afterSnapshot=applyTrade(snapshot,rosterId,deal);
    const before=evaluateState(snapshot,rosterId,values,rawValues,deal.counterpartRosterId);
    const after=evaluateState(afterSnapshot,rosterId,values,rawValues,deal.counterpartRosterId);

    if(before.lineupLegal&&!after.lineupLegal){
      return invalidResult(snapshot,deal,['Trade would make the user roster unable to fill a legal starting lineup.']);
    }
    if(before.counterpartLineupLegal&&!after.counterpartLineupLegal){
      return invalidResult(snapshot,deal,['Trade would make the counterpart roster unable to fill a legal starting lineup.']);
    }

    const deltas=deepFreeze({
      lineupPoints:round(after.lineupPoints-before.lineupPoints,2),
      depthResilience:round(after.depthResilience-before.depthResilience,1),
      positionalResilience:round(after.positionalResilience-before.positionalResilience,1),
      restOfSeasonValue:round(after.restOfSeasonValue-before.restOfSeasonValue,2),
      playoffOutlook:before.playoffOutlook===null||after.playoffOutlook===null?null:round(after.playoffOutlook-before.playoffOutlook,1)
    });

    const playoffContribution=deltas.playoffOutlook===null?0:deltas.playoffOutlook*0.08;
    const compositeEdge=round(
      deltas.lineupPoints*3+
      deltas.depthResilience*0.12+
      deltas.positionalResilience*0.18+
      deltas.restOfSeasonValue*0.22+
      playoffContribution,
      2
    );
    const rosterBenefit=deepFreeze({
      label:compositeEdge>1?'IMPROVES_TEAM':compositeEdge<-1?'HURTS_TEAM':'NEUTRAL',
      score:round(clamp(50+compositeEdge),1),
      compositeEdge
    });
    const fairness=fairnessFor(deal,values);
    const affectedPlayerIds=uniqueIds([...(deal.givePlayerIds||[]),...(deal.getPlayerIds||[])]).sort();
    const confidenceAssessment=confidenceFor(affectedPlayerIds,values,snapshot);
    const confidence=round(confidenceAssessment.score,1);
    const risk=round(clamp(1-confidence/100,0,1),2);
    const reasons=[
      `Market fairness is ${fairness.label}: incoming market value ${fairness.incoming} versus ${fairness.outgoing} outgoing.`,
      `${rosterBenefit.label}: optimized weekly lineup changes ${deltas.lineupPoints>=0?'+':''}${deltas.lineupPoints}, depth ${deltas.depthResilience>=0?'+':''}${deltas.depthResilience}, positional resilience ${deltas.positionalResilience>=0?'+':''}${deltas.positionalResilience}, and rest-of-season roster value ${deltas.restOfSeasonValue>=0?'+':''}${deltas.restOfSeasonValue}.`
    ];
    if(deltas.playoffOutlook===null)reasons.push('Playoff outlook is unavailable, so no playoff advantage is invented.');
    else reasons.push(`Playoff outlook changes ${deltas.playoffOutlook>=0?'+':''}${deltas.playoffOutlook}.`);
    const risks=[...new Set(Array.isArray(confidenceAssessment.reasons)?confidenceAssessment.reasons:[])];

    return deepFreeze({
      valid:true,
      errors:[],
      fairness,
      rosterBenefit,
      before,
      after,
      deltas,
      confidence,
      confidenceLabel:confidenceAssessment.label||'UNAVAILABLE',
      risk,
      reasons,
      risks,
      freshness:clone(snapshot?.freshness||{status:'unknown',asOf:null,source:null}),
      affectedPlayerIds
    });
  }

  return{analyzeTrade};
});
