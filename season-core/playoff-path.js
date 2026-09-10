(function(root,factory){
  const lineupOptimizer=typeof module==='object'&&module.exports?require('./lineup-optimizer'):root.FFMLineupOptimizer;
  const rosterDoctor=typeof module==='object'&&module.exports?require('./roster-doctor'):root.FFMRosterDoctor;
  const api=factory(lineupOptimizer,rosterDoctor);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FFMPlayoffPath=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(lineupOptimizer,rosterDoctor){
  'use strict';

  const DEFAULT_ITERATIONS=2500;
  const MIN_ITERATIONS=500;
  const MAX_ITERATIONS=10000;
  const text=value=>value==null?'':String(value).trim();
  const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
  const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,num(value,min)));
  const round=(value,digits=1)=>{const p=10**digits;return Math.round((num(value)+Number.EPSILON)*p)/p;};

  function hashSeed(value){
    const input=text(value)||'playoff-path';
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

  function uniqueGames(schedule){
    const seen=new Set();
    const games=[];
    for(const row of Array.isArray(schedule)?schedule:[]){
      const week=Math.trunc(num(row?.week));
      const a=text(row?.rosterId),b=text(row?.opponentRosterId);
      if(!week||!a||!b||a===b)continue;
      const pair=[a,b].sort();
      const key=row?.matchupId?`${week}|${text(row.matchupId)}`:`${week}|${pair[0]}|${pair[1]}`;
      if(seen.has(key))continue;
      seen.add(key);
      games.push({week,rosterA:a,rosterB:b,matchupId:text(row?.matchupId)||null,key});
    }
    return games.sort((a,b)=>a.week-b.week||a.key.localeCompare(b.key));
  }

  function buildTeamMetrics(snapshot,playerValues){
    const map=new Map();
    for(const roster of Array.isArray(snapshot?.rosters)?snapshot.rosters:[]){
      const rosterId=text(roster?.rosterId);
      if(!rosterId)continue;
      let lineup;
      let doctor;
      try{lineup=lineupOptimizer.optimizeLineup(snapshot,rosterId,playerValues);}catch(_){lineup={expectedTotal:0,legal:false};}
      try{doctor=rosterDoctor.evaluateRoster(snapshot,rosterId,playerValues);}catch(_){doctor={overallGrade:0,benchDepth:{score:0},healthRisk:{score:0},byeRisk:{score:0},weaknesses:[]};}
      const expectedTotal=Math.max(0,num(lineup?.expectedTotal));
      const grade=clamp(doctor?.overallGrade);
      const strength=round(expectedTotal+grade*.08+(lineup?.legal?2:0),3);
      map.set(rosterId,{rosterId,lineup,doctor,expectedTotal,grade,strength});
    }
    return map;
  }

  function headToHeadProbability(a,b){
    const delta=num(a?.strength)-num(b?.strength);
    return clamp(100/(1+Math.exp(-delta/6)),2,98)/100;
  }

  function completeStandings(snapshot){
    const rosters=Array.isArray(snapshot?.rosters)?snapshot.rosters:[];
    return rosters.length>0&&rosters.every(roster=>roster?.record&&Number.isFinite(Number(roster.record.wins))&&Number.isFinite(Number(roster.record.losses))&&Number.isFinite(Number(roster.record.ties)));
  }

  function scheduleSupportsProbability(snapshot,rosterId){
    const coverage=snapshot?.scheduleCoverage||{};
    if(coverage.complete!==true)return false;
    const expected=Array.isArray(coverage.expectedWeeks)?coverage.expectedWeeks.map(Number).filter(Number.isFinite):[];
    if(!expected.length)return true;
    const userWeeks=new Set((Array.isArray(snapshot?.remainingSchedule)?snapshot.remainingSchedule:[])
      .filter(row=>text(row?.rosterId)===rosterId)
      .map(row=>Number(row.week)).filter(Number.isFinite));
    return expected.every(week=>userWeeks.has(week));
  }

  function currentSeed(snapshot,rosterId){
    const sorted=(Array.isArray(snapshot?.rosters)?snapshot.rosters:[]).slice().sort((a,b)=>{
      const ar=a?.record||{},br=b?.record||{};
      const aw=num(ar.wins)+num(ar.ties)*.5,bw=num(br.wins)+num(br.ties)*.5;
      return bw-aw||num(br.pointsFor)-num(ar.pointsFor)||text(a?.rosterId).localeCompare(text(b?.rosterId));
    });
    const index=sorted.findIndex(roster=>text(roster?.rosterId)===rosterId);
    return index>=0?index+1:null;
  }

  function cloneRecords(snapshot){
    const records=new Map();
    for(const roster of Array.isArray(snapshot?.rosters)?snapshot.rosters:[]){
      const r=roster?.record||{};
      records.set(text(roster.rosterId),{
        wins:num(r.wins),losses:num(r.losses),ties:num(r.ties),
        pointsFor:num(r.pointsFor),pointsAgainst:num(r.pointsAgainst)
      });
    }
    return records;
  }

  function rankRecords(records,metrics){
    return [...records.entries()].sort((a,b)=>{
      const ar=a[1],br=b[1];
      const aw=ar.wins+ar.ties*.5,bw=br.wins+br.ties*.5;
      return bw-aw||br.pointsFor-ar.pointsFor||num(metrics.get(b[0])?.strength)-num(metrics.get(a[0])?.strength)||a[0].localeCompare(b[0]);
    }).map(([rosterId])=>rosterId);
  }

  function simulateProbability(snapshot,rosterId,metrics,games,iterations,seed,forced=null){
    const playoffTeams=Math.max(1,Math.trunc(num(snapshot?.league?.playoffTeams,0)));
    const random=seededRandom(seed);
    let made=0;
    for(let i=0;i<iterations;i+=1){
      const records=cloneRecords(snapshot);
      for(const game of games){
        const a=records.get(game.rosterA),b=records.get(game.rosterB);
        if(!a||!b)continue;
        const metricA=metrics.get(game.rosterA),metricB=metrics.get(game.rosterB);
        const pA=headToHeadProbability(metricA,metricB);
        const draw=random();
        let winner=draw<pA?game.rosterA:game.rosterB;
        if(forced&&game.week===forced.week&&(game.rosterA===rosterId||game.rosterB===rosterId)){
          winner=forced.outcome==='WIN'?rosterId:(game.rosterA===rosterId?game.rosterB:game.rosterA);
        }
        const loser=winner===game.rosterA?game.rosterB:game.rosterA;
        records.get(winner).wins+=1;
        records.get(loser).losses+=1;
        a.pointsFor+=num(metricA?.expectedTotal);a.pointsAgainst+=num(metricB?.expectedTotal);
        b.pointsFor+=num(metricB?.expectedTotal);b.pointsAgainst+=num(metricA?.expectedTotal);
      }
      if(rankRecords(records,metrics).slice(0,playoffTeams).includes(rosterId))made+=1;
    }
    return round(made/iterations*100,1);
  }

  function scheduleDifficulty(rosterId,games,metrics){
    const mine=games.filter(game=>game.rosterA===rosterId||game.rosterB===rosterId);
    if(!mine.length)return Object.freeze({score:null,label:'UNKNOWN',opponents:0,averageOpponentStrength:null,leagueAverageStrength:null});
    const league=[...metrics.values()].map(item=>num(item.strength)).filter(Number.isFinite);
    const leagueAverage=league.length?league.reduce((sum,value)=>sum+value,0)/league.length:0;
    const opponentStrengths=mine.map(game=>num(metrics.get(game.rosterA===rosterId?game.rosterB:game.rosterA)?.strength));
    const averageOpponent=opponentStrengths.reduce((sum,value)=>sum+value,0)/opponentStrengths.length;
    const score=round(clamp(50+(averageOpponent-leagueAverage)*4),1);
    const label=score>=65?'HARD':score<=35?'EASY':'AVERAGE';
    return Object.freeze({score,label,opponents:mine.length,averageOpponentStrength:round(averageOpponent,1),leagueAverageStrength:round(leagueAverage,1)});
  }

  function readinessScore(myMetrics,metrics){
    const leagueStrength=[...metrics.values()].map(item=>num(item.strength));
    const leagueAverage=leagueStrength.length?leagueStrength.reduce((sum,value)=>sum+value,0)/leagueStrength.length:0;
    const relative=clamp(50+(num(myMetrics?.strength)-leagueAverage)*4);
    const grade=clamp(myMetrics?.doctor?.overallGrade);
    const health=clamp(100-num(myMetrics?.doctor?.healthRisk?.score));
    const depth=clamp(myMetrics?.doctor?.benchDepth?.score);
    return round(grade*.45+relative*.35+health*.12+depth*.08,1);
  }

  function improvementTarget(myMetrics){
    const weakness=Array.isArray(myMetrics?.doctor?.weaknesses)?myMetrics.doctor.weaknesses[0]:null;
    if(!weakness)return null;
    return Object.freeze({
      position:text(weakness.position),
      action:`Upgrade ${text(weakness.position)} depth or starter quality`,
      grade:round(weakness.grade,1),
      reason:text(weakness.reason)||`${text(weakness.position)} is the roster's largest demanded-position weakness.`
    });
  }

  function confidence(snapshot,probabilityReady){
    const freshness=text(snapshot?.freshness?.status).toLowerCase();
    const multiplier=freshness==='fresh'?1:freshness==='stale'?.74:freshness==='disconnected'?.42:.58;
    return round(clamp((probabilityReady?92:72)*multiplier),1);
  }

  function buildPlayoffPath(snapshot,rosterId,playerValues,context={}){
    if(!snapshot||typeof snapshot!=='object')throw new Error('Playoff Path requires a LeagueSnapshot');
    const id=text(rosterId||snapshot.myRosterId);
    if(!id)throw new Error('Playoff Path requires my roster identity');
    if(!(snapshot.rosters||[]).some(roster=>text(roster?.rosterId)===id))throw new Error(`Playoff Path could not find roster ${id}`);

    const iterations=Math.trunc(clamp(context.iterations??DEFAULT_ITERATIONS,MIN_ITERATIONS,MAX_ITERATIONS));
    const seed=text(context.seed)||`${snapshot?.league?.leagueId||'league'}:${snapshot?.week||0}:${id}:playoffs`;
    const metrics=buildTeamMetrics(snapshot,playerValues);
    const myMetrics=metrics.get(id);
    const games=uniqueGames(snapshot.remainingSchedule);
    const standingsReady=completeStandings(snapshot);
    const settingsReady=Number.isInteger(Number(snapshot?.league?.playoffTeams))&&Number(snapshot.league.playoffTeams)>0&&Number(snapshot.league.playoffTeams)<=metrics.size&&Number.isInteger(Number(snapshot?.league?.playoffWeekStart))&&Number(snapshot.league.playoffWeekStart)>0;
    const scheduleReady=scheduleSupportsProbability(snapshot,id);
    const probabilityReady=standingsReady&&settingsReady&&scheduleReady;
    const reasons=[];
    if(!standingsReady)reasons.push('Complete league standings are required before Playoff Path can show a playoff probability.');
    if(!settingsReady)reasons.push('League playoff settings are incomplete, so probability mode is unavailable.');
    if(!scheduleReady)reasons.push('The remaining regular-season schedule is incomplete, so Playoff Path is using readiness mode instead of fabricating a probability.');

    const difficulty=scheduleDifficulty(id,games,metrics);
    const readiness=readinessScore(myMetrics,metrics);
    const baseProbability=probabilityReady?simulateProbability(snapshot,id,metrics,games,iterations,seed):null;
    const leverage=[];
    if(probabilityReady){
      const userGames=games.filter(game=>game.rosterA===id||game.rosterB===id);
      for(const game of userGames){
        const opponentRosterId=game.rosterA===id?game.rosterB:game.rosterA;
        const winProbability=simulateProbability(snapshot,id,metrics,games,iterations,`${seed}:leverage`,{week:game.week,outcome:'WIN'});
        const lossProbability=simulateProbability(snapshot,id,metrics,games,iterations,`${seed}:leverage`,{week:game.week,outcome:'LOSS'});
        const swing=round(Math.max(0,winProbability-lossProbability),1);
        const matchupWinProbability=round(headToHeadProbability(myMetrics,metrics.get(opponentRosterId))*100,1);
        const label=swing>=25&&lossProbability<45?'MUST-WIN':swing>=15?'HIGH LEVERAGE':'LEVERAGE';
        leverage.push(Object.freeze({week:game.week,opponentRosterId,probabilitySwing:swing,winPathProbability:winProbability,lossPathProbability:lossProbability,matchupWinProbability,label}));
      }
      leverage.sort((a,b)=>b.probabilitySwing-a.probabilitySwing||a.week-b.week||a.opponentRosterId.localeCompare(b.opponentRosterId));
    }

    const conf=confidence(snapshot,probabilityReady);
    const biggestWeakness=Array.isArray(myMetrics?.doctor?.weaknesses)&&myMetrics.doctor.weaknesses.length?Object.freeze({...myMetrics.doctor.weaknesses[0]}):null;
    const target=improvementTarget(myMetrics);
    const healthRisk=clamp(myMetrics?.doctor?.healthRisk?.score)/100;
    const risk=round(clamp((1-conf/100)+healthRisk*.35,0,1),2);
    if(probabilityReady)reasons.push(`Playoff probability uses ${iterations} deterministic simulations of the complete remaining league schedule.`);
    if(target)reasons.push(`${target.position} is the highest-priority roster improvement target for playoff readiness.`);

    return Object.freeze({
      rosterId:id,
      mode:probabilityReady?'PROBABILITY':'READINESS',
      playoffProbability:baseProbability,
      readinessScore:readiness,
      currentSeedEstimate:standingsReady?currentSeed(snapshot,id):null,
      scheduleDifficulty:difficulty,
      leverageWeeks:Object.freeze(leverage),
      biggestWeakness,
      improvementTarget:target,
      confidence:conf,
      risk,
      freshness:text(snapshot?.freshness?.status).toUpperCase()||'UNKNOWN',
      reasons:Object.freeze(reasons),
      risks:Object.freeze([
        ...(snapshot?.freshness?.status==='stale'?['League data is stale; confidence has been reduced.']:[]),
        ...(!probabilityReady?['Probability withheld until required league data is complete.']:[])
      ])
    });
  }

  return{buildPlayoffPath,seededRandom,uniqueGames,headToHeadProbability};
});
