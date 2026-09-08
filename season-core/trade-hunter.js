(function (root, factory) {
  const rosterDoctor = typeof module === 'object' && module.exports ? require('./roster-doctor') : root.FFMRosterDoctor;
  const playerStatus = typeof module === 'object' && module.exports ? require('./player-status') : root.FFMPlayerStatus;
  const api = factory(rosterDoctor, playerStatus);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMTradeHunter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rosterDoctor, playerStatus) {
  'use strict';

  const text=value=>value==null?'':String(value).trim();
  const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const round=(value,digits=2)=>{const p=10**digits;return Math.round((num(value)+Number.EPSILON)*p)/p;};
  const pos=value=>{const p=text(value).toUpperCase();return p==='DEF'?'DST':p;};

  function valueMap(values){
    if(Array.isArray(values)) return new Map(values.map(v=>[text(v?.id||v?.playerId),v]).filter(([id])=>id));
    return new Map(Object.entries(values&&typeof values==='object'?values:{}));
  }

  function record(id,values,snapshot){
    const raw=values.get(id)||{};
    const status=playerStatus.normalizePlayerStatus(snapshot?.playerStatuses?.[id]||{});
    const risk=playerStatus.statusRisk(status,snapshot?.freshness||{});
    return {
      id,name:text(raw.name)||id,position:pos(raw.position),
      value:num(raw.restOfSeasonValue,num(raw.value,num(raw.projection))),
      marketValue:num(raw.marketValue,num(raw.value,num(raw.projection))),
      restOfSeasonValue:num(raw.restOfSeasonValue,num(raw.value,num(raw.projection))),
      risk:risk.risk,confidence:round(risk.confidenceMultiplier*100,1)
    };
  }

  function positionPlayers(roster,values,snapshot){
    const groups=new Map();
    for(const id of roster?.playerIds||[]){
      const player=record(text(id),values,snapshot);
      if(!player.position) continue;
      if(!groups.has(player.position)) groups.set(player.position,[]);
      groups.get(player.position).push(player);
    }
    for(const list of groups.values()) list.sort((a,b)=>b.value-a.value||a.id.localeCompare(b.id));
    return groups;
  }

  function weaknessMap(report){
    const map=new Map();
    for(const item of report?.weaknesses||[]) map.set(item.position,num(item.grade,100));
    for(const [position,grade] of Object.entries(report?.positionalGrades||{})) if(!map.has(position)) map.set(position,num(grade,100));
    return map;
  }

  function tradableFromSurplus(report,groups){
    const result=[];
    const surplusByPosition=new Map((report?.surplus||[]).map(item=>[item.position,num(item.count)]));
    for(const [position,count] of surplusByPosition){
      const players=(groups.get(position)||[]).slice().sort((a,b)=>a.value-b.value||a.id.localeCompare(b.id));
      result.push(...players.slice(0,Math.max(0,count)));
    }
    return result;
  }

  function fallbackTradable(report,groups){
    const demanded=new Set(Object.keys(report?.demand?.positionWeights||{}));
    return [...groups.entries()]
      .flatMap(([position,players])=>players.length>1||!demanded.has(position)?players.slice().sort((a,b)=>a.value-b.value).slice(0,Math.max(1,players.length-1)):[]);
  }

  function findTradeOpportunities(snapshot,rosterId,playerValues){
    const mineId=text(rosterId);
    const mine=(snapshot?.rosters||[]).find(r=>text(r.rosterId)===mineId);
    if(!mine) throw new Error(`Trade Hunter could not find roster ${mineId||'(blank)'}`);
    const values=valueMap(playerValues);
    const reports=new Map();
    for(const roster of snapshot.rosters||[]){
      try{reports.set(text(roster.rosterId),rosterDoctor.evaluateRoster(snapshot,text(roster.rosterId),playerValues));}
      catch(_){reports.set(text(roster.rosterId),null);}
    }
    const mineReport=reports.get(mineId);
    const mineGroups=positionPlayers(mine,values,snapshot);
    const mineWeak=weaknessMap(mineReport);
    const myCandidates=tradableFromSurplus(mineReport,mineGroups);
    if(!myCandidates.length) myCandidates.push(...fallbackTradable(mineReport,mineGroups));
    const opportunities=[];

    for(const other of snapshot.rosters||[]){
      const otherId=text(other.rosterId);
      if(!otherId||otherId===mineId) continue;
      const otherReport=reports.get(otherId);
      const otherGroups=positionPlayers(other,values,snapshot);
      const otherWeak=weaknessMap(otherReport);
      const otherCandidates=tradableFromSurplus(otherReport,otherGroups);
      if(!otherCandidates.length) otherCandidates.push(...fallbackTradable(otherReport,otherGroups));

      for(const give of myCandidates){
        if(!(mine.playerIds||[]).map(text).includes(give.id)) continue;
        for(const get of otherCandidates){
          if(!(other.playerIds||[]).map(text).includes(get.id)) continue;
          if(give.position===get.position) continue;
          const myNeedGrade=num(mineWeak.get(get.position),100);
          const theirNeedGrade=num(otherWeak.get(give.position),100);
          if(myNeedGrade>=78||theirNeedGrade>=78) continue;

          const marketGap=Math.abs(give.marketValue-get.marketValue);
          if(marketGap>25) continue;
          const myNeedBonus=Math.max(0,75-myNeedGrade)*0.65;
          const theirNeedBonus=Math.max(0,75-theirNeedGrade)*0.5;
          const expectedImprovement=round((get.restOfSeasonValue-give.restOfSeasonValue)+myNeedBonus,2);
          const counterpartImprovement=round((give.restOfSeasonValue-get.restOfSeasonValue)+theirNeedBonus,2);
          if(expectedImprovement<=0||counterpartImprovement<=-5) continue;

          const signals=[];
          if(give.marketValue-give.restOfSeasonValue>=8) signals.push('SELL_HIGH');
          if(get.restOfSeasonValue-get.marketValue>=8) signals.push('BUY_LOW');
          const risk=round(Math.min(1,(give.risk+get.risk)/2+marketGap/200),2);
          const confidence=round(Math.max(0,Math.min(100,Math.min(give.confidence,get.confidence)-marketGap*0.5)),1);
          opportunities.push(Object.freeze({
            counterpartRosterId:otherId,
            givePlayerIds:Object.freeze([give.id]),
            getPlayerIds:Object.freeze([get.id]),
            needSolved:get.position,
            counterpartNeedSolved:give.position,
            expectedImprovement,
            counterpartImprovement,
            risk,
            confidence,
            signals:Object.freeze(signals),
            reason:`Target ${get.name} from roster ${otherId} to strengthen ${get.position}; offer ${give.name} from your ${give.position} depth because that roster grades weaker at ${give.position}.`
          }));
        }
      }
    }

    return Object.freeze(opportunities.sort((a,b)=>b.expectedImprovement-a.expectedImprovement||b.confidence-a.confidence||a.counterpartRosterId.localeCompare(b.counterpartRosterId)));
  }

  return { findTradeOpportunities };
});
