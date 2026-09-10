(function(root,factory){
  const dataConfidence=typeof module==='object'&&module.exports?require('./data-confidence'):root.FFMDataConfidence;
  const playerStatus=typeof module==='object'&&module.exports?require('./player-status'):root.FFMPlayerStatus;
  const api=factory(dataConfidence,playerStatus);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FFMRestOfSeasonValue=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(dataConfidence,playerStatus){
  'use strict';

  const WEIGHTS=Object.freeze({
    production:0.18,
    opportunity:0.20,
    consistency:0.09,
    ceiling:0.11,
    trend:0.07,
    availability:0.12,
    replacementValue:0.10,
    scarcity:0.05,
    schedule:0.04,
    playoffSchedule:0.04
  });

  const text=value=>value==null?'':String(value).trim();
  const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,num(value,min)));
  const round=(value,digits=1)=>{const p=10**digits;return Math.round((num(value)+Number.EPSILON)*p)/p;};
  const position=value=>{const p=text(value).toUpperCase();return p==='DEF'?'DST':p;};

  function toPlayers(playerValues){
    if(Array.isArray(playerValues))return playerValues.map(item=>({...item,id:text(item?.id||item?.playerId)})).filter(item=>item.id);
    return Object.entries(playerValues&&typeof playerValues==='object'?playerValues:{}).map(([id,item])=>({...item,id:text(item?.id||item?.playerId||id)})).filter(item=>item.id);
  }

  function percentile(values,value){
    const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
    if(!sorted.length)return 50;
    if(sorted.length===1)return 50;
    let less=0,equal=0;
    for(const item of sorted){if(item<value)less+=1;else if(item===value)equal+=1;}
    return clamp(((less+Math.max(1,equal)*0.5)/sorted.length)*100);
  }

  function quantile(values,q){
    const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);
    if(!sorted.length)return 0;
    if(sorted.length===1)return sorted[0];
    const at=(sorted.length-1)*q;
    const low=Math.floor(at),high=Math.ceil(at),mix=at-low;
    return sorted[low]+(sorted[high]-sorted[low])*mix;
  }

  function rawMarketValue(player){
    const candidates=[player?.value,player?.projection,player?.avgPoints];
    for(const candidate of candidates)if(Number.isFinite(Number(candidate)))return Number(candidate);
    return 0;
  }

  function buildGroupContext(players,context={}){
    const byPosition=new Map();
    for(const player of players){
      const p=position(player.position);
      if(!p)continue;
      if(!byPosition.has(p))byPosition.set(p,[]);
      byPosition.get(p).push(player);
    }
    const replacementById=new Map();
    const scarcityByPosition=new Map();
    for(const [p,group] of byPosition){
      const market=group.map(rawMarketValue);
      for(const player of group)replacementById.set(player.id,round(percentile(market,rawMarketValue(player)),1));
      const explicit=context?.positionScarcity?.[p];
      if(Number.isFinite(Number(explicit))){scarcityByPosition.set(p,clamp(explicit));continue;}
      if(group.length<3){scarcityByPosition.set(p,50);continue;}
      const projections=group.map(player=>num(player.projection,num(player.value))).filter(Number.isFinite);
      const median=Math.max(1,Math.abs(quantile(projections,.5)));
      const spread=Math.max(0,quantile(projections,.75)-quantile(projections,.25));
      scarcityByPosition.set(p,round(clamp(50+(spread/median)*50),1));
    }
    return{replacementById,scarcityByPosition};
  }

  function contextScore(source,player){
    if(source===undefined||source===null)return{score:50,supplied:false};
    let value;
    if(typeof source==='function')value=source(player);
    else if(typeof source==='object')value=source[player.id]??source[player.team]??source[position(player.position)]??source.default;
    else value=source;
    if(!Number.isFinite(Number(value)))return{score:50,supplied:false};
    return{score:clamp(value),supplied:true};
  }

  function statusAvailability(player,snapshot){
    const id=text(player.id||player.playerId);
    const raw=snapshot?.playerStatuses?.[id]??player.status??player.injuryStatus??player.injury_status;
    const hasStatus=raw!==undefined&&raw!==null&&text(typeof raw==='object'?(raw.status||raw.category||raw.raw):raw)!=='';
    const normalized=playerStatus?.normalizePlayerStatus?playerStatus.normalizePlayerStatus(raw||{}):{category:'UNKNOWN'};
    const statusScores={ACTIVE:100,QUESTIONABLE:75,DOUBTFUL:50,OUT:15,IR:10,PUP:15,UNKNOWN:85};
    const metricAvailability=Number(player?.metrics?.availability);
    const metricScore=Number.isFinite(metricAvailability)?clamp(metricAvailability):100;
    const statusScore=hasStatus?(statusScores[normalized.category]??85):100;
    return{score:round(Math.min(metricScore,statusScore),1),normalized,hasStatus};
  }

  function metricScore(player,key,fallback=50){
    const value=player?.metrics?.[key];
    return Number.isFinite(Number(value))?clamp(value):fallback;
  }

  function tierFor(score){
    if(score>=85)return'ELITE';
    if(score>=72)return'STRONG';
    if(score>=58)return'STARTABLE';
    if(score>=42)return'DEPTH';
    return'REPLACEMENT';
  }

  function scoreRestOfSeasonPlayer(player={},snapshot={},context={},groupContext){
    const id=text(player.id||player.playerId);
    const p=position(player.position);
    const groups=groupContext||buildGroupContext([{...player,id}],context);
    const schedule=contextScore(context.scheduleStrength,player);
    const playoff=contextScore(context.playoffScheduleStrength,player);
    const availability=statusAvailability({...player,id},snapshot);
    const projection=Number(player.projection);
    const floor=Number(player.floor);
    const ceilingRaw=Number(player.ceiling);
    const inferredConsistency=Number.isFinite(projection)&&Number.isFinite(floor)&&Number.isFinite(ceilingRaw)
      ? clamp(100-(Math.abs(ceilingRaw-floor)/Math.max(1,Math.abs(projection)))*50)
      : 50;
    const factors=Object.freeze({
      production:round(metricScore(player,'production')),
      opportunity:round(metricScore(player,'opportunity')),
      consistency:round(Number.isFinite(Number(player?.metrics?.consistency))?metricScore(player,'consistency'):inferredConsistency),
      ceiling:round(metricScore(player,'ceiling')),
      trend:round(metricScore(player,'trend')),
      availability:availability.score,
      replacementValue:round(groups.replacementById.get(id)??50),
      scarcity:round(groups.scarcityByPosition.get(p)??50),
      schedule:round(schedule.score),
      playoffSchedule:round(playoff.score)
    });
    const restOfSeasonValue=round(Object.entries(WEIGHTS).reduce((sum,[key,weight])=>sum+factors[key]*weight,0),1);
    const statusRisk=playerStatus?.statusRisk?playerStatus.statusRisk(availability.normalized,snapshot?.freshness||{}):{risk:0.5};
    const confidenceAssessment=dataConfidence?.assessPlayerConfidence
      ? dataConfidence.assessPlayerConfidence({...player,id},snapshot,{sourceHealth:context.sourceHealth||'LIVE',roleStability:factors.consistency})
      : {score:50,label:'MEDIUM'};
    const reasons=[];
    if(factors.opportunity>=75)reasons.push(`Strong ${p||'player'} opportunity supports rest-of-season value.`);
    if(factors.trend>=80&&factors.opportunity<50)reasons.push('Recent trend is not fully supported by opportunity, so the hot streak is capped by the broader role profile.');
    if(factors.availability<70)reasons.push(`${availability.normalized.category} availability materially reduces rest-of-season value.`);
    if(factors.replacementValue>=75)reasons.push(`Value is strong relative to replacement options at ${p||'this position'}.`);
    if(schedule.supplied&&factors.schedule>=65)reasons.push('Remaining schedule context is favorable.');
    else if(schedule.supplied&&factors.schedule<=35)reasons.push('Remaining schedule context is difficult.');
    if(playoff.supplied&&factors.playoffSchedule>=65)reasons.push('Fantasy-playoff schedule context is favorable.');
    else if(playoff.supplied&&factors.playoffSchedule<=35)reasons.push('Fantasy-playoff schedule context is difficult.');
    if(!schedule.supplied||!playoff.supplied)reasons.push('Unavailable schedule inputs use a neutral 50/100 weight instead of an invented advantage.');
    if(!reasons.length)reasons.push('Balanced production, opportunity, health, and position-relative value produce this rest-of-season score.');
    return Object.freeze({
      playerId:id,
      name:text(player.name)||id,
      position:p,
      restOfSeasonValue,
      tier:tierFor(restOfSeasonValue),
      risk:round(statusRisk.risk,2),
      confidence:round(confidenceAssessment.score,1),
      confidenceLabel:confidenceAssessment.label||'UNAVAILABLE',
      factors,
      reasons:Object.freeze(reasons)
    });
  }

  function rankRestOfSeason(playerValues,snapshot={},context={}){
    const players=toPlayers(playerValues);
    const groups=buildGroupContext(players,context);
    return Object.freeze(players
      .map(player=>scoreRestOfSeasonPlayer(player,snapshot,context,groups))
      .sort((a,b)=>b.restOfSeasonValue-a.restOfSeasonValue||b.confidence-a.confidence||a.playerId.localeCompare(b.playerId)));
  }

  function enrichPlayerValues(playerValues,snapshot={},context={}){
    const ranked=rankRestOfSeason(playerValues,snapshot,context);
    const byId=new Map(ranked.map(result=>[result.playerId,result]));
    const enrich=player=>{
      const id=text(player?.id||player?.playerId);
      const result=byId.get(id);
      if(!result)return{...player};
      return{
        ...player,
        restOfSeasonValue:result.restOfSeasonValue,
        rosTier:result.tier,
        rosConfidence:result.confidence,
        rosFactors:result.factors
      };
    };
    if(Array.isArray(playerValues))return playerValues.map(enrich);
    const out={};
    for(const [key,player] of Object.entries(playerValues&&typeof playerValues==='object'?playerValues:{}))out[key]=enrich(player);
    return out;
  }

  return{WEIGHTS,rankRestOfSeason,scoreRestOfSeasonPlayer,enrichPlayerValues,tierFor};
});