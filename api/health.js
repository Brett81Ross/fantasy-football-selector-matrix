const VERSION='1.5.5';
const NOW=new Date();
const CURRENT_SEASON=NOW.getUTCMonth()>=2?NOW.getUTCFullYear():NOW.getUTCFullYear()-1;
const PRESEASON=NOW.getUTCMonth()<8;
const STATS_SEASON=PRESEASON?CURRENT_SEASON-1:CURRENT_SEASON;

async function probeHeaders(name,url,timeoutMs=7000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs),started=Date.now();
  try{
    const response=await fetch(url,{signal:controller.signal,redirect:'follow',cache:'no-store',headers:{'User-Agent':`Fantasy-Football-Matrix/${VERSION}`,'Accept':'text/csv,text/plain,*/*'}});
    return{name,ok:response.ok,status:response.status,ms:Date.now()-started};
  }catch(error){return{name,ok:false,status:0,ms:Date.now()-started,error:String(error?.message||error)}}
  finally{clearTimeout(timer)}
}
async function probeJson(name,url,timeoutMs=6000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs),started=Date.now();
  try{
    const response=await fetch(url,{signal:controller.signal,cache:'no-store',headers:{Accept:'application/json','User-Agent':`Fantasy-Football-Matrix/${VERSION}`}});
    const ms=Date.now()-started;if(!response.ok)return{name,ok:false,status:response.status,ms};
    const data=await response.json();return{name,ok:true,status:response.status,ms,data};
  }catch(error){return{name,ok:false,status:0,ms:Date.now()-started,error:String(error?.message||error)}}
  finally{clearTimeout(timer)}
}

module.exports=async function handler(req,res){
  const [roster,stats,scoreboard]=await Promise.all([
    probeHeaders('nflverse-roster',`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${CURRENT_SEASON}.csv`),
    probeHeaders('nflverse-stats',`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${STATS_SEASON}.csv`),
    probeJson('espn-scoreboard','https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=5')
  ]);
  const games=Array.isArray(scoreboard.data?.events)?scoreboard.data.events.length:null;
  const status=!roster.ok?'down':(!stats.ok||!scoreboard.ok?'degraded':'ok');
  res.setHeader('Cache-Control','no-store');
  res.status(roster.ok?200:503).json({
    app:'Fantasy Football Matrix',version:VERSION,status,checkedAt:new Date().toISOString(),
    seasons:{roster:CURRENT_SEASON,stats:STATS_SEASON},
    data:{
      roster:{source:'nflverse',ok:roster.ok,http:roster.status,ms:roster.ms,error:roster.error||null},
      performance:{source:'nflverse',ok:stats.ok,http:stats.status,ms:stats.ms,error:stats.error||null},
      liveScoreboard:{source:'ESPN',ok:scoreboard.ok,http:scoreboard.status,ms:scoreboard.ms,games,error:scoreboard.error||null}
    }
  });
};
module.exports.config={maxDuration:20};
