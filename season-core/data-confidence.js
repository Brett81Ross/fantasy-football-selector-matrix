(function(root,factory){
  const playerStatus=typeof module==='object'&&module.exports?require('./player-status'):root.FFMPlayerStatus;
  const api=factory(playerStatus);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FFMDataConfidence=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(playerStatus){
  'use strict';

  const text=value=>value==null?'':String(value).trim();
  const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,num(value,min)));
  const round=(value,digits=1)=>{const p=10**digits;return Math.round((num(value)+Number.EPSILON)*p)/p;};

  function labelFor(score,available=true){
    if(!available||score<=0)return'UNAVAILABLE';
    if(score>=80)return'HIGH';
    if(score>=60)return'MEDIUM';
    return'LOW';
  }

  function normalizedStatus(input){
    if(playerStatus&&typeof playerStatus.normalizePlayerStatus==='function'){
      return playerStatus.normalizePlayerStatus(input||{}).category;
    }
    const raw=text(input&&typeof input==='object'?(input.status||input.category||input.raw):input).toUpperCase();
    if(raw.includes('QUESTIONABLE'))return'QUESTIONABLE';
    if(raw.includes('DOUBTFUL'))return'DOUBTFUL';
    if(raw==='OUT'||raw.includes('INACTIVE'))return'OUT';
    if(raw==='IR'||raw.includes('INJURED RESERVE'))return'IR';
    if(raw==='PUP'||raw.includes('PHYSICALLY UNABLE'))return'PUP';
    if(['ACTIVE','HEALTHY','PROBABLE'].includes(raw))return'ACTIVE';
    return'UNKNOWN';
  }

  function addPenalty(components,reasons,key,amount,reason){
    const penalty=round(Math.max(0,num(amount)),1);
    components[key]=penalty;
    if(penalty>0&&reason)reasons.push(reason);
    return penalty;
  }

  function assessConfidence(input={}){
    const components={};
    const reasons=[];
    let totalPenalty=0;
    let hardUnavailable=false;

    const freshness=text(input.freshness&&typeof input.freshness==='object'?input.freshness.status:input.freshness).toLowerCase()||'unknown';
    const freshnessPenalty={fresh:0,stale:18,disconnected:32,unknown:24}[freshness]??24;
    totalPenalty+=addPenalty(components,reasons,'freshness',freshnessPenalty,
      freshness==='stale'?'League data is stale.':freshness==='disconnected'?'League data is disconnected.':freshness==='unknown'?'League data freshness is unknown.':'');

    const sourceHealth=text(input.sourceHealth||'LIVE').toUpperCase();
    if(sourceHealth==='OFFLINE'){
      hardUnavailable=true;
      totalPenalty+=addPenalty(components,reasons,'sourceHealth',100,'A required data source is offline.');
    }else{
      const sourcePenalty={LIVE:0,DEGRADED:10,STALE:18}[sourceHealth]??10;
      totalPenalty+=addPenalty(components,reasons,'sourceHealth',sourcePenalty,
        sourceHealth==='DEGRADED'?'A required data source is degraded.':sourceHealth==='STALE'?'A required data source is stale.':sourceHealth!=='LIVE'?'Data-source health is uncertain.':'');
    }

    const hasSample=input.sampleSize!==undefined&&input.sampleSize!==null&&Number.isFinite(Number(input.sampleSize));
    const sampleSize=hasSample?Math.max(0,Math.trunc(Number(input.sampleSize))):null;
    let samplePenalty=0;
    if(hasSample){
      if(sampleSize===0)samplePenalty=30;
      else if(sampleSize<=3)samplePenalty=24-sampleSize*4;
      else if(sampleSize<=7)samplePenalty=(8-sampleSize)*2;
    }
    totalPenalty+=addPenalty(components,reasons,'sampleSize',samplePenalty,
      samplePenalty?`Limited sample size (${sampleSize} game${sampleSize===1?'':'s'}) reduces certainty.`:'');

    const status=normalizedStatus(input.status);
    const statusPenalty={ACTIVE:0,QUESTIONABLE:10,DOUBTFUL:24,OUT:40,IR:40,PUP:40,UNKNOWN:12}[status]??12;
    totalPenalty+=addPenalty(components,reasons,'availability',statusPenalty,
      statusPenalty?`${status==='UNKNOWN'?'Unknown':status.charAt(0)+status.slice(1).toLowerCase()} availability reduces certainty.`:'');

    const hasRole=input.roleStability!==undefined&&input.roleStability!==null&&Number.isFinite(Number(input.roleStability));
    const rolePenalty=hasRole?(100-clamp(input.roleStability))*0.15:0;
    totalPenalty+=addPenalty(components,reasons,'roleStability',rolePenalty,
      rolePenalty?`Role stability is ${round(clamp(input.roleStability),0)}/100.`:'');

    const ownership=text(input.ownershipState||'known').toLowerCase();
    const ownershipPenalty={known:0,unknown:15,contradictory:35}[ownership]??15;
    totalPenalty+=addPenalty(components,reasons,'ownership',ownershipPenalty,
      ownership==='contradictory'?'Ownership data is contradictory.':ownership!=='known'?'Ownership certainty is incomplete.':'');

    const hasVolatility=input.volatility!==undefined&&input.volatility!==null&&Number.isFinite(Number(input.volatility));
    const volatility=hasVolatility?clamp(Number(input.volatility),0,1):0;
    const volatilityPenalty=volatility*12;
    totalPenalty+=addPenalty(components,reasons,'volatility',volatilityPenalty,
      volatilityPenalty?`Projection volatility is ${round(volatility*100,0)}%.`:'');

    let score=hardUnavailable?0:clamp(100-totalPenalty);
    const rookie=input.rookie===true;
    if(!hardUnavailable&&rookie&&hasSample&&sampleSize<4&&score>72){
      const before=score;
      score=72;
      addPenalty(components,reasons,'rookieCap',before-score,'Limited rookie sample caps confidence until more NFL games are available.');
    }else components.rookieCap=0;

    score=round(score,1);
    const available=!hardUnavailable&&score>0;
    return Object.freeze({
      score,
      label:labelFor(score,available),
      available,
      components:Object.freeze({...components}),
      reasons:Object.freeze([...reasons])
    });
  }

  function inferOwnership(playerId,snapshot,explicit){
    if(explicit)return text(explicit).toLowerCase();
    if(!snapshot||!playerId)return'unknown';
    const owned=new Set((Array.isArray(snapshot.ownedPlayerIds)?snapshot.ownedPlayerIds:[]).map(String));
    const free=new Set((Array.isArray(snapshot.freeAgentPlayerIds)?snapshot.freeAgentPlayerIds:[]).map(String));
    const isOwned=owned.has(String(playerId));
    const isFree=free.has(String(playerId));
    if(isOwned&&isFree)return'contradictory';
    if(isOwned||isFree)return'known';
    return'unknown';
  }

  function inferVolatility(player,explicit){
    if(explicit!==undefined&&explicit!==null&&Number.isFinite(Number(explicit)))return clamp(Number(explicit),0,1);
    const projection=Number(player?.projection??player?.weeklyProjection??player?.value);
    const floor=Number(player?.floor);
    const ceiling=Number(player?.ceiling);
    if(!Number.isFinite(projection)||!Number.isFinite(floor)||!Number.isFinite(ceiling))return undefined;
    return clamp(Math.abs(ceiling-floor)/Math.max(1,Math.abs(projection)),0,1);
  }

  function assessPlayerConfidence(player={},snapshot={},options={}){
    const playerId=text(player.id||player.playerId);
    const status=snapshot?.playerStatuses?.[playerId]??player.status??player.injuryStatus??player.injury_status??{};
    const games=Number(player.games);
    const sampleSize=Number.isFinite(games)?games:undefined;
    const yearsExp=Number(player.yearsExp??player.years_exp);
    const rookie=player.rookie===true||(Number.isFinite(yearsExp)&&yearsExp===0);
    const roleStability=options.roleStability??player?.metrics?.consistency;
    return assessConfidence({
      freshness:options.freshness??snapshot?.freshness??'unknown',
      sourceHealth:options.sourceHealth??'LIVE',
      sampleSize,
      rookie,
      status,
      roleStability,
      ownershipState:inferOwnership(playerId,snapshot,options.ownershipState),
      volatility:inferVolatility(player,options.volatility)
    });
  }

  function combineConfidence(results,options={}){
    const list=(Array.isArray(results)?results:[]).filter(item=>item&&Number.isFinite(Number(item.score)));
    if(!list.length)return Object.freeze({score:0,label:'UNAVAILABLE',available:false,components:Object.freeze({}),reasons:Object.freeze(['No confidence inputs are available.'])});
    if(options.requireAll===true&&list.some(item=>item.available===false||Number(item.score)<=0)){
      const reasons=[...new Set(list.flatMap(item=>Array.isArray(item.reasons)?item.reasons:[]))];
      return Object.freeze({score:0,label:'UNAVAILABLE',available:false,components:Object.freeze({}),reasons:Object.freeze(reasons)});
    }
    const usable=list.filter(item=>item.available!==false&&Number(item.score)>0);
    if(!usable.length)return Object.freeze({score:0,label:'UNAVAILABLE',available:false,components:Object.freeze({}),reasons:Object.freeze([...new Set(list.flatMap(item=>Array.isArray(item.reasons)?item.reasons:[]))])});
    const score=round(usable.reduce((sum,item)=>sum+Number(item.score),0)/usable.length,1);
    const reasons=[...new Set(usable.flatMap(item=>Array.isArray(item.reasons)?item.reasons:[]))];
    return Object.freeze({score,label:labelFor(score,true),available:true,components:Object.freeze({}),reasons:Object.freeze(reasons)});
  }

  return { assessConfidence, assessPlayerConfidence, combineConfidence, labelFor };
});
