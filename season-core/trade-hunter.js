(function (root, factory) {
  const rosterDoctor = typeof module === 'object' && module.exports ? require('./roster-doctor') : root.FFMRosterDoctor;
  const playerStatus = typeof module === 'object' && module.exports ? require('./player-status') : root.FFMPlayerStatus;
  const dataConfidence = typeof module === 'object' && module.exports ? require('./data-confidence') : root.FFMDataConfidence;
  const tradeAnalyzer = typeof module === 'object' && module.exports ? require('./trade-analyzer') : root.FFMTradeAnalyzer;
  const api = factory(rosterDoctor, playerStatus, dataConfidence, tradeAnalyzer);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.FFMTradeHunter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rosterDoctor, playerStatus, dataConfidence, tradeAnalyzer) {
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
    const confidenceAssessment=dataConfidence?.assessPlayerConfidence
      ? dataConfidence.assessPlayerConfidence({...raw,id},snapshot,{ownershipState:'known'})
      : {score:risk.confidenceMultiplier*100};
    return {
      id,name:text(raw.name)||id,position:pos(raw.position),
      value:num(raw.restOfSeasonValue,num(raw.value,num(raw.projection))),
      marketValue:num(raw.marketValue,num(raw.value,num(raw.projection))),
      restOfSeasonValue:num(raw.restOfSeasonValue,num(raw.value,num(raw.projection))),
      risk:risk.risk,confidence:round(confidenceAssessment.score,1)
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

  function addStrategicCandidates(candidates, report, groups, signalType){
    const seen=new Set(candidates.map(player=>player.id));
    const fixed=report?.demand?.fixed||{};
    for(const [position,players] of groups){
      const fixedDemand=num(fixed[position],0);
      if(players.length<=fixedDemand) continue;
      for(const player of players){
        const signal=signalType==='BUY_LOW'
          ? player.restOfSeasonValue-player.marketValue>=8
          : player.marketValue-player.restOfSeasonValue>=8;
        if(signal&&!seen.has(player.id)){
          candidates.push(player);
          seen.add(player.id);
        }
      }
    }
  }

  function findTradeOpportunities(snapshot,rosterId,playerValues){
    const mineId=text(rosterId);
    const mine=(snapshot?.rosters||[]).find(r=>text(r.rosterId)===mineId);
    if(!mine) throw new Error(`Trade Hunter could not find roster ${mineId||'(blank)'}`);
    if(!tradeAnalyzer?.analyzeTrade) throw new Error('Trade Hunter requires Trade Analyzer');
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
    addStrategicCandidates(myCandidates,mineReport,mineGroups,'SELL_HIGH');
    const opportunities=[];

    for(const other of snapshot.rosters||[]){
      const otherId=text(other.rosterId);
      if(!otherId||otherId===mineId) continue;
      const otherReport=reports.get(otherId);
      const otherGroups=positionPlayers(other,values,snapshot);
      const otherWeak=weaknessMap(otherReport);
      const otherCandidates=tradableFromSurplus(otherReport,otherGroups);
      if(!otherCandidates.length) otherCandidates.push(...fallbackTradable(otherReport,otherGroups));
      addStrategicCandidates(otherCandidates,otherReport,otherGroups,'BUY_LOW');

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
          const theirNeedBonus=Math.max(0,75-theirNeedGrade)*0.5;
          const counterpartImprovement=round((give.restOfSeasonValue-get.restOfSeasonValue)+theirNeedBonus,2);
          if(counterpartImprovement<=-5) continue;

          const analysis=tradeAnalyzer.analyzeTrade(snapshot,mineId,{
            counterpartRosterId:otherId,
            givePlayerIds:[give.id],
            getPlayerIds:[get.id]
          },playerValues);
          if(!analysis?.valid||analysis.rosterBenefit?.label==='HURTS_TEAM'||num(analysis.rosterBenefit?.compositeEdge)<=0) continue;

          const signals=[];
          if(give.marketValue-give.restOfSeasonValue>=8) signals.push('SELL_HIGH');
          if(get.restOfSeasonValue-get.marketValue>=8) signals.push('BUY_LOW');
          const expectedImprovement=round(analysis.rosterBenefit.compositeEdge,2);
          opportunities.push(Object.freeze({
            counterpartRosterId:otherId,
            givePlayerIds:Object.freeze([give.id]),
            getPlayerIds:Object.freeze([get.id]),
            needSolved:get.position,
            counterpartNeedSolved:give.position,
            expectedImprovement,
            counterpartImprovement,
            risk:analysis.risk,
            confidence:analysis.confidence,
            signals:Object.freeze(signals),
            analysis,
            fairness:analysis.fairness,
            rosterBenefit:analysis.rosterBenefit,
            before:analysis.before,
            after:analysis.after,
            deltas:analysis.deltas,
            reason:`Target ${get.name} from roster ${otherId} to strengthen ${get.position}; offer ${give.name} from your ${give.position} depth. ${analysis.reasons?.[1]||''}`.trim()
          }));
        }
      }
    }

    return Object.freeze(opportunities.sort((a,b)=>
      num(b.rosterBenefit?.compositeEdge)-num(a.rosterBenefit?.compositeEdge)||
      b.confidence-a.confidence||
      num(b.fairness?.score)-num(a.fairness?.score)||
      a.counterpartRosterId.localeCompare(b.counterpartRosterId)
    ));
  }

  return { findTradeOpportunities };
});