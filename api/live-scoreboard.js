'use strict';

function eventArray(payload){
  if(Array.isArray(payload?.events))return payload.events;
  if(Array.isArray(payload?.content?.sbData?.events))return payload.content.sbData.events;
  const leagues=Array.isArray(payload?.sports)?payload.sports.flatMap(s=>Array.isArray(s?.leagues)?s.leagues:[]):[];
  const events=leagues.flatMap(l=>Array.isArray(l?.events)?l.events:[]);
  return events;
}

function numericScore(value){
  const text=String(value??'').trim();
  return text!==''&&Number.isFinite(Number(text))?Number(text):null;
}

function normalizeTeam(value){
  const team=String(value||'').trim().toUpperCase();
  if(team==='WAS')return'WSH';
  if(team==='LA')return'LAR';
  return team;
}

function normalizeEspnEvent(event){
  const competition=Array.isArray(event?.competitions)?event.competitions[0]:event;
  const competitors=Array.isArray(competition?.competitors)?competition.competitors:[];
  const away=competitors.find(c=>c?.homeAway==='away')||competitors[0];
  const home=competitors.find(c=>c?.homeAway==='home')||competitors[1];
  const awayTeam=normalizeTeam(away?.team?.abbreviation||away?.abbreviation);
  const homeTeam=normalizeTeam(home?.team?.abbreviation||home?.abbreviation);
  if(!awayTeam||!homeTeam)return null;
  const type=event?.status?.type||competition?.status?.type||{};
  const state=String(type.state||'pre').toLowerCase();
  return{
    id:String(event?.id||competition?.id||`${awayTeam}-${homeTeam}`),
    name:String(event?.name||event?.shortName||`${awayTeam} at ${homeTeam}`),
    status:String(type.shortDetail||type.detail||type.description||(state==='in'?'LIVE':state==='post'?'FINAL':'SCHEDULED')),
    state:['pre','in','post'].includes(state)?state:'pre',
    kickoffAt:event?.date||competition?.date||null,
    teams:[awayTeam,homeTeam],
    scores:{away:numericScore(away?.score),home:numericScore(home?.score)},
    provider:'ESPN'
  };
}

function normalizeEspnScoreboard(payload){
  return eventArray(payload).map(normalizeEspnEvent).filter(Boolean);
}

function gameKey(teams){
  return (Array.isArray(teams)?teams:[]).map(normalizeTeam).sort().join(':');
}

function mergeScheduleWithScoreboard(schedule,scoreboard){
  const liveByTeams=new Map((Array.isArray(scoreboard)?scoreboard:[]).map(game=>[gameKey(game.teams),game]));
  return (Array.isArray(schedule)?schedule:[]).map(game=>{
    const live=liveByTeams.get(gameKey(game.teams));
    if(!live)return game;
    return{...game,state:live.state,status:live.status,scores:live.scores,scoreProvider:live.provider};
  });
}

module.exports={normalizeEspnEvent,normalizeEspnScoreboard,mergeScheduleWithScoreboard};
