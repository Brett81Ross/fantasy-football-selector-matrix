(function(root,factory){
  const lineupOptimizer=typeof module==='object'&&module.exports?require('./lineup-optimizer'):root.FFMLineupOptimizer;
  const dataConfidence=typeof module==='object'&&module.exports?require('./data-confidence'):root.FFMDataConfidence;
  const api=factory(lineupOptimizer,dataConfidence);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FFMMatchupSimulator=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(lineupOptimizer,dataConfidence){
  'use strict';

  const DEFAULT_ITERATIONS=2500;
  const MIN_ITERATIONS=500;
  const MAX_ITERATIONS=10000;
  const DEFAULT_VOLATILITY=Object.freeze({QB:.22,RB:.38,WR:.42,TE:.38,K:.28,DST:.35,FLEX:.40});
  const text=value=>value==null?'':String(value).trim();
  const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,num(value,min)));
  const round=(value,digits=1)=>{const p=10**digits;return Math.round((num(value)+Number.EPSILON)*p)/p;};
  const pos=value=>{const p=text(value).toUpperCase();return p==='DEF'?'DST':p;};

  function mapValues(values){
    if(Array.isArray(values))return new Map(values.map(item=>[text(item?.id||item?.playerId),item]).filter(([id])=>id));
    return new Map(Object.entries(values&&typeof values==='object'?values:{}));
  }

  function hashSeed(value){
    const input=text(value)||'matrix';
    let hash=2166136261;
    for(let i=0;i<input.length;i+=1){hash^=input.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return hash>>>0;
  }

  function seededRandom(seed){
    let state=hashSeed(seed);
    return function(){
      state=(state+0x6D2B79F5)>>>0;
      let t=state;
      t=Math.imul(t^(t>>>15),t|1);
      t^=t+Math.imul(t^(t>>>7),t|61);
      return((t^(t>>>14))>>>0)/4294967296;
    };
  }

  function normalSample(random){
    const u1=Math.max(Number.EPSILON,random());
    const u2=Math.max(Number.EPSILON,random());
    return Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
  }

  function playerMean(raw={},entry={}){
    for(const candidate of [raw.weeklyProjection,raw.projection,entry.expectedPoints,raw.value]){
      if(Number.isFinite(Number(candidate)))return Math.max(0,Number(candidate));
    }
    return 0;
  }

  function playerDistribution(entry,raw={}){
    const mean=playerMean(raw,entry);
    const position=pos(raw.position||entry.position||entry.slotType);
    let sd;
    for(const candidate of [raw.weeklyStdDev,raw.stdDev]){
      if(Number.isFinite(Number(candidate))&&Number(candidate)>=0){sd=Number(candidate);break;}
    }
    if(sd===undefined&&Number.isFinite(Number(raw.volatility))){
      const volatility=Math.max(0,Number(raw.volatility));
      sd=volatility<=1?mean*volatility:volatility;
    }
    if(sd===undefined)sd=mean*(DEFAULT_VOLATILITY[position]??.38);
    const risk=clamp(entry?.risk,0,1);
    sd=Math.max(.25,sd*(1+risk*.35));
    const explicitFloor=Number(raw.weeklyFloor??raw.floor);
    const explicitCeiling=Number(raw.weeklyCeiling??raw.ceiling);
    let floor=Number.isFinite(explicitFloor)?explicitFloor:Math.max(0,mean-1.35*sd*(1+risk*.15));
    let ceiling=Number.isFinite(explicitCeiling)?explicitCeiling:mean+1.65*sd*(1+risk*.15);
    floor=Math.max(0,Math.min(floor,mean));
    ceiling=Math.max(mean,ceiling);
    return Object.freeze({playerId:text(entry.playerId),position,mean:round(mean,2),sd:round(sd,3),floor:round(floor,2),ceiling:round(ceiling,2),risk:round(risk,3)});
  }

  function freezeLineup(lineup){
    return Object.freeze({
      rosterId:text(lineup?.rosterId),
      legal:lineup?.legal===true,
      expectedTotal:round(lineup?.expectedTotal,2),
      requiredStarterSlots:num(lineup?.requiredStarterSlots),
      filledStarterSlots:num(lineup?.filledStarterSlots),
      starters:Object.freeze((lineup?.starters||[]).map(starter=>Object.freeze({...starter,eligiblePositions:Object.freeze([...(starter.eligiblePositions||[])])}))),
      bench:Object.freeze((lineup?.bench||[]).map(player=>Object.freeze({...player})))
    });
  }

  function simulateLineups(myStarters,opponentStarters,values,iterations,seed){
    const random=seededRandom(seed);
    const myDistributions=myStarters.map(entry=>playerDistribution(entry,values.get(text(entry.playerId))||{}));
    const opponentDistributions=opponentStarters.map(entry=>playerDistribution(entry,values.get(text(entry.playerId))||{}));
    let wins=0,losses=0,ties=0,myTotalSum=0,opponentTotalSum=0,marginSum=0;
    for(let i=0;i<iterations;i+=1){
      let mine=0,theirs=0;
      for(const d of myDistributions)mine+=clamp(d.mean+normalSample(random)*d.sd,d.floor,d.ceiling);
      for(const d of opponentDistributions)theirs+=clamp(d.mean+normalSample(random)*d.sd,d.floor,d.ceiling);
      const margin=mine-theirs;
      myTotalSum+=mine;opponentTotalSum+=theirs;marginSum+=margin;
      if(Math.abs(margin)<.01)ties+=1;
      else if(margin>0)wins+=1;
      else losses+=1;
    }
    return Object.freeze({
      winProbability:round(wins/iterations*100,1),
      tieProbability:round(ties/iterations*100,1),
      lossProbability:round(losses/iterations*100,1),
      myAverageScore:round(myTotalSum/iterations,1),
      opponentAverageScore:round(opponentTotalSum/iterations,1),
      averageMargin:round(marginSum/iterations,1)
    });
  }

  function confidenceForStarters(starters,values,snapshot,sourceHealth){
    const results=starters.map(starter=>{
      const id=text(starter.playerId);
      const raw=values.get(id)||{};
      return dataConfidence?.assessPlayerConfidence
        ? dataConfidence.assessPlayerConfidence({...raw,id},snapshot,{sourceHealth:sourceHealth||'LIVE',volatility:normalizedVolatility(raw,starter)})
        : {score:num(starter.confidence,50),label:'MEDIUM',available:true,reasons:[]};
    });
    return dataConfidence?.combineConfidence?dataConfidence.combineConfidence(results):{score:round(results.reduce((s,r)=>s+num(r.score,50),0)/Math.max(1,results.length),1),label:'MEDIUM',available:true,reasons:[]};
  }

  function normalizedVolatility(raw,entry){
    const mean=Math.max(1,playerMean(raw,entry));
    if(Number.isFinite(Number(raw.volatility))){const v=Math.max(0,Number(raw.volatility));return clamp(v<=1?v:v/mean,0,1);}
    const sd=Number(raw.weeklyStdDev??raw.stdDev);
    if(Number.isFinite(sd))return clamp(sd/mean,0,1);
    const floor=Number(raw.weeklyFloor??raw.floor),ceiling=Number(raw.weeklyCeiling??raw.ceiling);
    if(Number.isFinite(floor)&&Number.isFinite(ceiling))return clamp(Math.abs(ceiling-floor)/mean,0,1);
    return DEFAULT_VOLATILITY[pos(raw.position||entry.position||entry.slotType)]??.38;
  }

  function swapStarter(starters,outPlayerId,inPlayer,values){
    return starters.map(starter=>{
      if(text(starter.playerId)!==outPlayerId)return starter;
      const raw=values.get(text(inPlayer.playerId))||{};
      return Object.freeze({
        ...starter,
        playerId:text(inPlayer.playerId),
        name:text(inPlayer.name)||text(raw.name)||text(inPlayer.playerId),
        position:pos(inPlayer.position||raw.position),
        expectedPoints:playerMean(raw,inPlayer),
        lineupScore:num(inPlayer.lineupScore,playerMean(raw,inPlayer)),
        status:inPlayer.status,
        statusLabel:inPlayer.statusLabel,
        risk:num(inPlayer.risk),
        confidence:num(inPlayer.confidence)
      });
    });
  }

  function recommendedSwaps(baseline,myLineup,opponentLineup,values,snapshot,options){
    const minDelta=Math.max(0,num(options.minSwapDelta,.5));
    const result=[];
    for(const starter of myLineup.starters||[]){
      const allowed=new Set((starter.eligiblePositions||[]).map(pos));
      for(const bench of myLineup.bench||[]){
        if(bench.available===false||!allowed.has(pos(bench.position)))continue;
        const outId=text(starter.playerId),inId=text(bench.playerId);
        if(!outId||!inId)continue;
        const candidateStarters=swapStarter(myLineup.starters,outId,bench,values);
        const sim=simulateLineups(candidateStarters,opponentLineup.starters,values,options.iterations,`${options.seed}:swap:${outId}:${inId}`);
        const delta=round(sim.winProbability-baseline.winProbability,1);
        if(delta<minDelta)continue;
        const outAssessment=dataConfidence?.assessPlayerConfidence?dataConfidence.assessPlayerConfidence({...values.get(outId),id:outId},snapshot,{sourceHealth:options.sourceHealth||'LIVE',volatility:normalizedVolatility(values.get(outId)||{},starter)}):{score:num(starter.confidence,50),available:true,reasons:[]};
        const inAssessment=dataConfidence?.assessPlayerConfidence?dataConfidence.assessPlayerConfidence({...values.get(inId),id:inId},snapshot,{sourceHealth:options.sourceHealth||'LIVE',volatility:normalizedVolatility(values.get(inId)||{},bench)}):{score:num(bench.confidence,50),available:true,reasons:[]};
        const combined=dataConfidence?.combineConfidence?dataConfidence.combineConfidence([outAssessment,inAssessment]):{score:round((num(outAssessment.score,50)+num(inAssessment.score,50))/2,1),label:'MEDIUM'};
        result.push(Object.freeze({
          outPlayerId:outId,
          inPlayerId:inId,
          slotType:starter.slotType,
          legal:true,
          winProbability:sim.winProbability,
          winProbabilityDelta:delta,
          expectedPointDelta:round(playerMean(values.get(inId)||{},bench)-playerMean(values.get(outId)||{},starter),1),
          confidence:round(combined.score,1),
          confidenceLabel:combined.label||'UNAVAILABLE',
          risk:round(clamp(num(bench.risk)+normalizedVolatility(values.get(inId)||{},bench)*.25,0,1),2),
          reason:`Start ${text(bench.name)||inId} over ${text(starter.name)||outId} in ${starter.slotType}: the seeded matchup simulation improves win probability by ${delta} percentage points, trading ${round(playerMean(values.get(inId)||{},bench)-playerMean(values.get(outId)||{},starter),1)} projected points for a different weekly outcome distribution.`
        }));
      }
    }
    return Object.freeze(result.sort((a,b)=>b.winProbabilityDelta-a.winProbabilityDelta||b.confidence-a.confidence||a.outPlayerId.localeCompare(b.outPlayerId)).slice(0,5));
  }

  function simulateMatchup(snapshot,rosterId,playerValues,options={}){
    if(!snapshot||typeof snapshot!=='object')throw new Error('Matchup Simulator requires a LeagueSnapshot');
    const myRosterId=text(rosterId||snapshot.myRosterId);
    const opponentRosterId=text(snapshot.opponentRosterId);
    if(!myRosterId)throw new Error('Matchup Simulator requires my roster identity');
    if(!opponentRosterId)throw new Error('Matchup Simulator requires a current-week opponent');
    const iterations=Math.trunc(clamp(options.iterations??DEFAULT_ITERATIONS,MIN_ITERATIONS,MAX_ITERATIONS));
    const seed=text(options.seed)||`${snapshot?.league?.leagueId||'league'}:${snapshot?.week||0}:${myRosterId}:${opponentRosterId}`;
    const values=mapValues(playerValues);
    const myLineup=lineupOptimizer.optimizeLineup(snapshot,myRosterId,playerValues);
    const opponentLineup=lineupOptimizer.optimizeLineup(snapshot,opponentRosterId,playerValues);
    const baseline=simulateLineups(myLineup.starters,opponentLineup.starters,values,iterations,seed);
    const confidenceAssessment=confidenceForStarters([...myLineup.starters,...opponentLineup.starters],values,snapshot,options.sourceHealth||'LIVE');
    const starterRisk=[...myLineup.starters,...opponentLineup.starters].map(item=>num(item.risk)).filter(Number.isFinite);
    const avgRisk=starterRisk.length?starterRisk.reduce((sum,value)=>sum+value,0)/starterRisk.length:0;
    const risk=round(clamp(avgRisk+(1-num(confidenceAssessment.score,0)/100)*.15,0,1),2);
    const swaps=recommendedSwaps(baseline,myLineup,opponentLineup,values,snapshot,{...options,iterations,seed});
    return Object.freeze({
      myRosterId,
      opponentRosterId,
      week:num(snapshot.week),
      seed,
      iterations,
      ...baseline,
      myLineup:freezeLineup(myLineup),
      opponentLineup:freezeLineup(opponentLineup),
      confidence:round(confidenceAssessment.score,1),
      confidenceLabel:confidenceAssessment.label||'UNAVAILABLE',
      risk,
      recommendedSwaps:swaps
    });
  }

  return{simulateMatchup,playerDistribution,seededRandom};
});
