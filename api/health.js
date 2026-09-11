const VERSION=require('../version');
const {buildNflSourcePolicy}=require('./nfl-source-policy');
const SOURCE_POLICY=buildNflSourcePolicy(new Date());
const lastSuccess={roster:null,performance:null,schedule:null,scoreboard:null};

async function probeCsv(candidate,timeoutMs=7000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs),started=Date.now();
  try{
    const response=await fetch(candidate.url,{signal:controller.signal,redirect:'follow',cache:'no-store',headers:SOURCE_POLICY.csvHeaders});
    return{ok:response.ok,http:response.status,ms:Date.now()-started,error:null};
  }catch(error){return{ok:false,http:0,ms:Date.now()-started,error:String(error?.message||error)}}
  finally{clearTimeout(timer)}
}

async function probeScoreboard(timeoutMs=6000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs),started=Date.now();
  try{
    const response=await fetch(SOURCE_POLICY.scoreboardUrl,{signal:controller.signal,cache:'no-store',headers:SOURCE_POLICY.jsonHeaders});
    const ms=Date.now()-started;
    if(!response.ok)return{ok:false,http:response.status,ms,error:null,data:null};
    const data=await response.json();
    return{ok:true,http:response.status,ms,error:null,data};
  }catch(error){return{ok:false,http:0,ms:Date.now()-started,error:String(error?.message||error),data:null}}
  finally{clearTimeout(timer)}
}

async function firstHealthy(candidates){
  const attempts=[];
  for(const candidate of candidates){
    const result=await probeCsv(candidate);
    const attempt={season:candidate.season,kind:candidate.kind||null,ok:result.ok,http:result.http,ms:result.ms,error:result.error};
    attempts.push(attempt);
    if(result.ok)return{active:{...candidate,...result},attempts};
  }
  return{active:null,attempts};
}

function markSuccess(key,ok,now){
  if(ok)lastSuccess[key]=now;
  return lastSuccess[key];
}

function compactSourceResult(result,key,now,{source,currentSeason,preferredStatsSeason}={}){
  const active=result.active;
  const fallback=Boolean(active)&&result.attempts.length>1;
  return{
    source,
    required:true,
    ok:Boolean(active),
    fallback,
    activeSeason:active?.season??null,
    activeKind:active?.kind||null,
    lastSuccessfulAt:markSuccess(key,Boolean(active),now),
    stale:Boolean(active)&&key==='roster'&&active.season!==currentSeason,
    preferredSeason:key==='performance'?preferredStatsSeason:currentSeason,
    attempts:result.attempts
  };
}

module.exports=async function handler(req,res){
  const checkedAt=new Date().toISOString();
  const scheduleCandidate={season:SOURCE_POLICY.currentSeason,kind:'schedule',url:SOURCE_POLICY.scheduleUrl};
  const [rosterResult,performanceResult,scheduleProbe,scoreboard]=await Promise.all([
    firstHealthy(SOURCE_POLICY.rosterCandidates),
    firstHealthy(SOURCE_POLICY.statsCandidates),
    probeCsv(scheduleCandidate),
    probeScoreboard()
  ]);

  const roster=compactSourceResult(rosterResult,'roster',checkedAt,{source:'nflverse',currentSeason:SOURCE_POLICY.currentSeason,preferredStatsSeason:SOURCE_POLICY.preferredStatsSeason});
  const performance=compactSourceResult(performanceResult,'performance',checkedAt,{source:'nflverse',currentSeason:SOURCE_POLICY.currentSeason,preferredStatsSeason:SOURCE_POLICY.preferredStatsSeason});
  const schedule={
    source:'nflverse',
    required:true,
    ok:scheduleProbe.ok,
    fallback:false,
    activeSeason:SOURCE_POLICY.currentSeason,
    activeKind:'schedule',
    http:scheduleProbe.http,
    ms:scheduleProbe.ms,
    error:scheduleProbe.error||null,
    lastSuccessfulAt:markSuccess('schedule',scheduleProbe.ok,checkedAt),
    attempts:[{season:SOURCE_POLICY.currentSeason,kind:'schedule',ok:scheduleProbe.ok,http:scheduleProbe.http,ms:scheduleProbe.ms,error:scheduleProbe.error}]
  };
  const games=Array.isArray(scoreboard.data?.events)?scoreboard.data.events.length:null;
  const liveScoreboard={
    source:'ESPN',
    required:false,
    ok:scoreboard.ok,
    fallback:false,
    http:scoreboard.http,
    ms:scoreboard.ms,
    games,
    error:scoreboard.error||null,
    lastSuccessfulAt:markSuccess('scoreboard',scoreboard.ok,checkedAt)
  };

  let status;
  if(!roster.ok)status='OFFLINE';
  else if(roster.activeSeason!==SOURCE_POLICY.currentSeason)status='STALE';
  else if(!performance.ok||performance.activeKind==='legacy'||!schedule.ok)status='DEGRADED';
  else status='LIVE';

  const httpStatus=status==='OFFLINE'?503:status==='LIVE'?200:206;
  res.setHeader('Cache-Control','no-store');
  res.status(httpStatus).json({
    app:'Fantasy Football Matrix',
    version:VERSION,
    status,
    checkedAt,
    seasons:{
      current:SOURCE_POLICY.currentSeason,
      preferredStats:SOURCE_POLICY.preferredStatsSeason,
      roster:roster.activeSeason,
      stats:performance.activeSeason
    },
    data:{roster,performance,schedule,liveScoreboard}
  });
};

module.exports.config={maxDuration:20};
