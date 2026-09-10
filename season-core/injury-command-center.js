(function(root,factory){
  const playerStatus=typeof module==='object'&&module.exports?require('./player-status'):root.FFMPlayerStatus;
  const dataConfidence=typeof module==='object'&&module.exports?require('./data-confidence'):root.FFMDataConfidence;
  const lineupOptimizer=typeof module==='object'&&module.exports?require('./lineup-optimizer'):root.FFMLineupOptimizer;
  const api=factory(playerStatus,dataConfidence,lineupOptimizer);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FFMInjuryCommandCenter=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(playerStatus,dataConfidence,lineupOptimizer){
  'use strict';

  const SEVERITY_ORDER=Object.freeze({CRITICAL:0,HIGH:1,WATCH:2,INFO:3});
  const text=value=>value==null?'':String(value).trim();
  const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const round=(value,digits=1)=>{const p=10**digits;return Math.round((num(value)+Number.EPSILON)*p)/p;};
  const pos=value=>{const p=text(value).toUpperCase();return p==='DEF'?'DST':p;};
  const mapValues=values=>Array.isArray(values)
    ?new Map(values.map(item=>[text(item?.id||item?.playerId),item]).filter(([id])=>id))
    :new Map(Object.entries(values&&typeof values==='object'?values:{}));

  function projection(raw={}){
    for(const value of [raw.weeklyProjection,raw.projection,raw.value,raw.restOfSeasonValue]){
      if(Number.isFinite(Number(value)))return Number(value);
    }
    return 0;
  }

  function kickoffFor(playerId,raw,context){
    const byPlayer=context?.kickoffsByPlayerId&&typeof context.kickoffsByPlayerId==='object'?context.kickoffsByPlayerId:{};
    const byTeam=context?.kickoffsByTeam&&typeof context.kickoffsByTeam==='object'?context.kickoffsByTeam:{};
    const candidate=byPlayer[playerId]??byTeam[text(raw?.team).toUpperCase()]??null;
    if(!candidate||!Number.isFinite(Date.parse(candidate)))return null;
    return new Date(candidate).toISOString();
  }

  function lockState(kickoffAt,context){
    if(!kickoffAt)return 'UNKNOWN';
    const nowInput=context?.now;
    const nowMs=nowInput&&Number.isFinite(Date.parse(nowInput))?Date.parse(nowInput):Date.now();
    return nowMs>=Date.parse(kickoffAt)?'LOCKED':'OPEN';
  }

  function onBye(raw,snapshot){
    if(raw?.onBye===true)return true;
    const bye=Number(raw?.byeWeek);
    const week=Number(snapshot?.week);
    return Number.isInteger(bye)&&bye>0&&Number.isInteger(week)&&week>0&&bye===week;
  }

  function starterIds(roster,snapshot,rosterId,playerValues){
    const explicit=(roster?.starterPlayerIds||[]).map(text).filter(Boolean);
    if(explicit.length)return explicit;
    try{return (lineupOptimizer.optimizeLineup(snapshot,rosterId,playerValues)?.starters||[]).map(item=>text(item.playerId)).filter(Boolean);}
    catch(_){return [];}
  }

  function expandedSlots(snapshot){
    try{return lineupOptimizer.expandStarterSlots(snapshot?.league?.rosterSlots||[]);}
    catch(_){return [];}
  }

  function assignStarterSlots(ids,values,snapshot){
    const slots=expandedSlots(snapshot);
    const records=ids.map(id=>({id,position:pos(values.get(id)?.position),compatible:[]}));
    for(const record of records){
      record.compatible=slots.map((slot,index)=>({slot,index})).filter(item=>item.slot.eligiblePositions.includes(record.position));
    }
    records.sort((a,b)=>a.compatible.length-b.compatible.length||a.id.localeCompare(b.id));
    const used=new Set(),result=new Map();
    function walk(index){
      if(index>=records.length)return true;
      const record=records[index];
      for(const item of record.compatible){
        if(used.has(item.index))continue;
        used.add(item.index);result.set(record.id,item.slot);
        if(walk(index+1))return true;
        used.delete(item.index);result.delete(record.id);
      }
      return false;
    }
    if(walk(0))return result;
    const fallback=new Map();
    for(const id of ids){
      const position=pos(values.get(id)?.position);
      fallback.set(id,{slotId:`${position}:fallback`,slotType:position,eligiblePositions:[position]});
    }
    return fallback;
  }

  function normalizedStatus(id,snapshot){
    return playerStatus.normalizePlayerStatus(snapshot?.playerStatuses?.[id]||{});
  }

  function assessment(id,raw,snapshot,context){
    if(dataConfidence?.assessPlayerConfidence){
      return dataConfidence.assessPlayerConfidence({...raw,id},snapshot,{sourceHealth:context?.sourceHealth||'LIVE'});
    }
    const risk=playerStatus.statusRisk(normalizedStatus(id,snapshot),snapshot?.freshness||{});
    return {score:round(risk.confidenceMultiplier*100,1),label:'MEDIUM',available:true,reasons:[]};
  }

  function candidateReplacement({starterId,slot,roster,starterSet,values,snapshot,context}){
    const candidates=[];
    for(const rawId of roster?.playerIds||[]){
      const id=text(rawId);
      if(!id||id===starterId||starterSet.has(id))continue;
      const raw=values.get(id)||{};
      const position=pos(raw.position);
      if(!slot?.eligiblePositions?.includes(position))continue;
      const status=normalizedStatus(id,snapshot);
      if(status.available===false||['OUT','IR','PUP'].includes(status.category)||onBye(raw,snapshot))continue;
      const kickoffAt=kickoffFor(id,raw,context);
      if(lockState(kickoffAt,context)==='LOCKED')continue;
      candidates.push({id,raw,status,kickoffAt,score:projection(raw)});
    }
    candidates.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
    return candidates[0]||null;
  }

  function lateSwapUrgent(starterKickoff,replacementKickoff,context){
    if(!starterKickoff||!replacementKickoff)return false;
    const nowInput=context?.now;
    if(!nowInput||!Number.isFinite(Date.parse(nowInput)))return false;
    const now=Date.parse(nowInput),backup=Date.parse(replacementKickoff),starter=Date.parse(starterKickoff);
    if(!(backup>now&&starter>backup))return false;
    const windowMs=Math.max(0,num(context?.lateSwapWindowMinutes,120))*60000;
    return backup-now<=windowMs;
  }

  function alertReason(type,name,status,replacement,lock,kickoffAt,lateSwap){
    if(lock==='LOCKED')return `${name} is ${status} and that player's game is already locked${kickoffAt?` at ${kickoffAt}`:''}; no lineup swap should be recommended after lock.`;
    if(type==='BYE_STARTER')return `${name} is in an active starter slot during the current bye week${replacement?`; ${replacement.raw.name||replacement.id} is the best legal unlocked roster replacement`:' and no legal unlocked replacement is available'}.`;
    if(type==='UNAVAILABLE_STARTER')return `${name} is ${status} in an active starter slot${replacement?`; replace with ${replacement.raw.name||replacement.id}, the best legal unlocked roster option`:' and no legal unlocked replacement is currently available'}.`;
    if(type==='DOUBTFUL_STARTER')return `${name} is Doubtful in an active starter slot${replacement?`; keep ${replacement.raw.name||replacement.id} ready as the best legal unlocked replacement`:'; no legal unlocked replacement is currently available'}.`;
    if(type==='QUESTIONABLE_STARTER'&&lateSwap)return `${name} is Questionable and the best viable backup, ${replacement.raw.name||replacement.id}, locks at ${replacement.kickoffAt} before ${name}'s later kickoff; decide before the backup locks.`;
    if(type==='QUESTIONABLE_STARTER')return `${name} is Questionable in an active starter slot${replacement?`; monitor the status and keep ${replacement.raw.name||replacement.id} ready`:'; monitor the status because no legal unlocked replacement is currently available'}.`;
    return `${name}'s game is locked${kickoffAt?` at ${kickoffAt}`:''}; the starter can no longer be changed.`;
  }

  function buildCommandCenter(snapshot,rosterId,playerValues,context={}){
    if(!snapshot||typeof snapshot!=='object')throw new Error('Injury Command Center requires a LeagueSnapshot');
    const id=text(rosterId||snapshot.myRosterId);
    const roster=(snapshot.rosters||[]).find(item=>text(item?.rosterId)===id);
    if(!roster)throw new Error(`Injury Command Center could not find roster ${id||'(blank)'}`);
    const values=mapValues(playerValues);
    const starters=starterIds(roster,snapshot,id,playerValues);
    const starterSet=new Set(starters);
    const assignments=assignStarterSlots(starters,values,snapshot);
    const alerts=[];

    for(const playerId of starters){
      const raw=values.get(playerId)||{};
      const name=text(raw.name)||playerId;
      const position=pos(raw.position);
      const status=normalizedStatus(playerId,snapshot);
      const bye=onBye(raw,snapshot);
      const kickoffAt=kickoffFor(playerId,raw,context);
      const lock=lockState(kickoffAt,context);
      const slot=assignments.get(playerId)||{slotType:position,eligiblePositions:[position]};
      const replacement=candidateReplacement({starterId:playerId,slot,roster,starterSet,values,snapshot,context});
      const replacementLock=replacement?replacement.kickoffAt:null;
      const lateSwap=status.category==='QUESTIONABLE'&&lateSwapUrgent(kickoffAt,replacementLock,context);
      let type=null,severity=null;
      if(bye){type='BYE_STARTER';severity=lock==='LOCKED'?'INFO':'CRITICAL';}
      else if(['OUT','IR','PUP'].includes(status.category)){type='UNAVAILABLE_STARTER';severity=lock==='LOCKED'?'INFO':'CRITICAL';}
      else if(status.category==='DOUBTFUL'){type='DOUBTFUL_STARTER';severity=lock==='LOCKED'?'INFO':'HIGH';}
      else if(status.category==='QUESTIONABLE'){type='QUESTIONABLE_STARTER';severity=lock==='LOCKED'?'INFO':lateSwap?'HIGH':'WATCH';}
      else if(lock==='LOCKED'){type='LOCKED_STARTER';severity='INFO';}
      if(!type)continue;

      const affected=assessment(playerId,raw,snapshot,context);
      const replacementAssessment=replacement?assessment(replacement.id,replacement.raw,snapshot,context):null;
      const combined=replacementAssessment&&dataConfidence?.combineConfidence?dataConfidence.combineConfidence([affected,replacementAssessment]):affected;
      const actionable=lock!=='LOCKED'&&Boolean(replacement)&&(type!=='LOCKED_STARTER');
      const baseRisk=status.category==='OUT'||status.category==='IR'||status.category==='PUP'||bye?1:status.category==='DOUBTFUL'?.78:status.category==='QUESTIONABLE'?.5:.1;
      const risk=round(Math.min(1,baseRisk+(snapshot?.freshness?.status==='fresh'?0:.1)),2);
      alerts.push(Object.freeze({
        type,severity,playerId,name,position,status:bye?'BYE':status.category,isStarter:true,
        slotType:text(slot.slotType),lockState:lock,kickoffAt,
        actionable,replacementPlayerId:actionable?replacement.id:null,
        replacementName:actionable?(text(replacement.raw.name)||replacement.id):null,
        confidence:round(num(combined?.score,0),1),confidenceLabel:combined?.label||'UNAVAILABLE',risk,
        reason:alertReason(type,name,bye?'BYE':status.label,replacement,lock,kickoffAt,lateSwap)
      }));
    }

    alerts.sort((a,b)=>SEVERITY_ORDER[a.severity]-SEVERITY_ORDER[b.severity]||b.risk-a.risk||a.playerId.localeCompare(b.playerId));
    const count=severity=>alerts.filter(alert=>alert.severity===severity).length;
    return Object.freeze({
      rosterId:id,week:num(snapshot.week),generatedAt:context?.now&&Number.isFinite(Date.parse(context.now))?new Date(context.now).toISOString():new Date().toISOString(),
      attentionRequired:alerts.some(alert=>alert.severity!=='INFO'),criticalCount:count('CRITICAL'),highCount:count('HIGH'),watchCount:count('WATCH'),
      alerts:Object.freeze(alerts)
    });
  }

  return{buildCommandCenter,assignStarterSlots,kickoffFor,lockState};
});
