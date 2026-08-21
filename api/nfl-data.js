const NOW = new Date();
const SEASON = NOW.getUTCMonth() >= 2 ? NOW.getUTCFullYear() : NOW.getUTCFullYear() - 1;
const VERSION = '1.4.1';
const FANTASY_POSITIONS = new Set(['QB','RB','WR','TE']);
const TEAMS = {
  1:'ATL',2:'BUF',3:'CHI',4:'CIN',5:'CLE',6:'DAL',7:'DEN',8:'DET',9:'GB',10:'TEN',11:'IND',12:'KC',13:'LV',14:'LAR',15:'MIA',16:'MIN',17:'NE',18:'NO',19:'NYG',20:'NYJ',21:'PHI',22:'ARI',23:'PIT',24:'LAC',25:'SF',26:'SEA',27:'TB',28:'WSH',29:'CAR',30:'JAX',33:'BAL',34:'HOU'
};
const TEAM_IDS = Object.keys(TEAMS);
const baseCache = new Map();
const liveCache = new Map();

const num=v=>Number.isFinite(Number(v))?Number(v):0;
const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));

async function fetchJson(url, timeoutMs=9000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(url,{signal:controller.signal,redirect:'follow',headers:{Accept:'application/json','User-Agent':`Fantasy-Football-Matrix/${VERSION}`}});
    if(!r.ok)throw new Error(`${new URL(url).hostname} ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

function availability(status){
  const s=String(status?.name||status||'ACTIVE').toUpperCase();
  if(s.includes('ACTIVE')||s.includes('NORMAL'))return 96;
  if(s.includes('QUESTION'))return 82;
  if(s.includes('DOUBT'))return 58;
  if(s.includes('OUT')||s.includes('RESERVE')||s.includes('IR')||s.includes('PUP')||s.includes('SUSP'))return 28;
  return 76;
}

function roleBase(pos, depth){
  const table={
    QB:[76,50,40,34],
    RB:[75,67,58,50,44,40],
    WR:[76,72,66,58,51,45,41],
    TE:[69,57,49,43,39]
  };
  const arr=table[pos]||[50];
  return arr[Math.min(depth,arr.length-1)];
}

function makeMetrics(pos, depth, years, status){
  const role=roleBase(pos,depth);
  const veteran=Math.min(5,Math.max(0,years))*0.8;
  const rookie=years===0;
  const avail=availability(status);
  const production=clamp(role+veteran-(depth>1?3:0));
  const opportunity=clamp(role+(depth===0?7:depth===1?3:-2));
  const consistency=clamp(role*.64+avail*.30+veteran);
  const ceiling=clamp(role+(rookie?9:5)+(depth===0?4:0));
  const trend=rookie?59:52;
  const tov=clamp(opportunity*.7+ceiling*.3);
  const mvi=clamp(100-(consistency*.62+avail*.38));
  return {production:Math.round(production),opportunity:Math.round(opportunity),consistency:Math.round(consistency),ceiling:Math.round(ceiling),trend:Math.round(trend),tov:Math.round(tov),mvi:Math.round(mvi),availability:Math.round(avail)};
}

function normalizeRoster(teamId, roster){
  const team=TEAMS[teamId]||String(teamId);
  const out=[];
  for(const group of roster?.athletes||[]){
    const items=Array.isArray(group?.items)?group.items:[];
    const fantasyItems=items.filter(a=>FANTASY_POSITIONS.has(a?.position?.abbreviation));
    const depthByPos={};
    for(const a of fantasyItems){
      const pos=a.position.abbreviation;
      const depth=depthByPos[pos]||0;
      depthByPos[pos]=depth+1;
      if(!a.id||!(a.fullName||a.displayName))continue;
      const years=num(a.experience?.years);
      const status=a.status?.name||a.status?.type||'Active';
      out.push({
        id:String(a.id),
        name:a.fullName||a.displayName,
        position:pos,
        team,
        status,
        yearsExp:years,
        rookie:years===0,
        headshot:a.headshot?.href||`https://a.espncdn.com/i/headshots/nfl/players/full/${a.id}.png`,
        metrics:makeMetrics(pos,depth,years,status)
      });
    }
  }
  return out;
}

async function loadEspnPublicRoster(){
  const results=await Promise.allSettled(TEAM_IDS.map(id=>fetchJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/roster`,10000).then(data=>({id,data}))));
  const players=[];const failed=[];
  for(const result of results){
    if(result.status==='fulfilled')players.push(...normalizeRoster(result.value.id,result.value.data));
    else failed.push(String(result.reason?.message||result.reason));
  }
  const unique=[...new Map(players.map(p=>[p.id,p])).values()];
  if(unique.length<100)throw new Error(`ESPN public rosters incomplete (${unique.length} fantasy players)`);
  return {players:unique,teamsLoaded:TEAM_IDS.length-failed.length,failures:failed.length};
}

async function loadNflverseEmergency(){
  const seasons=[SEASON,SEASON-1];
  let last;
  for(const season of seasons){
    try{
      const url=`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`;
      const r=await fetch(url,{headers:{'User-Agent':`Fantasy-Football-Matrix/${VERSION}`}});
      if(!r.ok)throw new Error(`nflverse ${r.status}`);
      const lines=(await r.text()).split(/\r?\n/).filter(Boolean);const header=lines.shift().split(',');const idx=k=>header.indexOf(k);const players=[];
      for(const line of lines){
        const c=line.split(','),pos=c[idx('position')],id=c[idx('gsis_id')],name=c[idx('full_name')],team=c[idx('team')];
        if(!FANTASY_POSITIONS.has(pos)||!id||!name||!team)continue;
        const years=num(c[idx('years_exp')]),status=c[idx('status')]||'ACT';
        players.push({id,name,position:pos,team,status,yearsExp:years,rookie:years===0,metrics:makeMetrics(pos,0,years,status)});
      }
      if(players.length<100)throw new Error('nflverse emergency roster incomplete');
      return {players,teamsLoaded:32,failures:0,season};
    }catch(e){last=e;}
  }
  throw last||new Error('No emergency roster source available');
}

async function getBasePlayers(){
  const hit=baseCache.get('base');
  if(hit&&hit.expires>Date.now())return hit.value;
  let value;
  try{
    const espn=await loadEspnPublicRoster();
    value={...espn,source:'ESPN Public NFL API',fallback:false};
  }catch(espnError){
    const backup=await loadNflverseEmergency();
    value={...backup,source:'nflverse emergency backup',fallback:true,primaryError:String(espnError?.message||espnError)};
  }
  baseCache.set('base',{value,expires:Date.now()+10*60*1000});
  return value;
}

function getLabelValue(labels,stats,names){for(const name of names){const i=labels.findIndex(x=>String(x).toUpperCase()===name);if(i>=0)return num(stats[i]);}return 0;}
function parseLiveSummary(summary,scoring){
  const out=new Map();
  for(const group of summary?.boxscore?.players||[]){
    for(const category of group.statistics||[]){
      const cname=String(category.name||category.displayName||'').toLowerCase();
      const labels=(category.labels||[]).map(x=>String(x).toUpperCase());
      for(const row of category.athletes||[]){
        const a=row.athlete||{};if(!a.id)continue;
        const rec=out.get(String(a.id))||{passYds:0,passTd:0,int:0,rushYds:0,rushTd:0,rec:0,recYds:0,recTd:0,lost:0};
        const s=row.stats||[];
        if(cname.includes('passing')){rec.passYds+=getLabelValue(labels,s,['YDS','PASS YDS']);rec.passTd+=getLabelValue(labels,s,['TD']);rec.int+=getLabelValue(labels,s,['INT']);}
        else if(cname.includes('rushing')){rec.rushYds+=getLabelValue(labels,s,['YDS','RUSH YDS']);rec.rushTd+=getLabelValue(labels,s,['TD']);}
        else if(cname.includes('receiving')){rec.rec+=getLabelValue(labels,s,['REC']);rec.recYds+=getLabelValue(labels,s,['YDS','REC YDS']);rec.recTd+=getLabelValue(labels,s,['TD']);}
        else if(cname.includes('fumble'))rec.lost+=getLabelValue(labels,s,['LOST']);
        out.set(String(a.id),rec);
      }
    }
  }
  const reception=scoring==='ppr'?1:scoring==='half'?.5:0;
  for(const rec of out.values())rec.points=rec.passYds*.04+rec.passTd*4-rec.int*2+rec.rushYds*.1+rec.rushTd*6+rec.rec*reception+rec.recYds*.1+rec.recTd*6-rec.lost*2;
  return out;
}

async function loadEspnLive(scoring){
  const key=`live:${scoring}`;const hit=liveCache.get(key);if(hit&&hit.expires>Date.now())return hit.value;
  const board=await fetchJson('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100',7000);
  const events=Array.isArray(board?.events)?board.events:[];
  const active=events.filter(e=>e?.status?.type?.state==='in');
  const players=new Map();
  if(active.length){
    const summaries=await Promise.allSettled(active.map(e=>fetchJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(e.id)}`,7000)));
    summaries.forEach((r,i)=>{
      if(r.status!=='fulfilled')return;
      for(const [id,stat] of parseLiveSummary(r.value,scoring))players.set(id,{...stat,eventId:active[i].id,status:active[i]?.status?.type?.shortDetail||'LIVE'});
    });
  }
  const value={games:active.length,players,events:active.map(e=>({id:e.id,name:e.name,status:e?.status?.type?.shortDetail||'LIVE'})),season:board?.season?.year||SEASON,week:board?.week?.number||null};
  liveCache.set(key,{value,expires:Date.now()+15000});return value;
}

function applyLive(base,live){
  return base.map(p=>{
    const copy={...p,metrics:{...p.metrics}};
    const l=live.players.get(String(copy.id));
    if(!l)return copy;
    copy.live=true;copy.liveFantasyPoints=Math.round(l.points*10)/10;copy.liveGameStatus=l.status;copy.liveEventId=l.eventId;
    const liveSignal=clamp(l.points*5);
    copy.metrics.production=clamp(Math.round(copy.metrics.production*.82+liveSignal*.18));
    copy.metrics.trend=clamp(Math.round(copy.metrics.trend*.68+liveSignal*.32));
    return copy;
  });
}

function matrixSort(players){
  const score=p=>p.metrics.production*.34+p.metrics.opportunity*.26+p.metrics.ceiling*.16+p.metrics.consistency*.10+p.metrics.availability*.08+p.metrics.trend*.06;
  return players.sort((a,b)=>score(b)-score(a)).slice(0,400);
}

async function build(scoring){
  const base=await getBasePlayers();
  let live={games:0,players:new Map(),events:[],season:SEASON,week:null},liveError='';
  try{live=await loadEspnLive(scoring);}catch(e){liveError=String(e?.message||e);}
  const players=matrixSort(applyLive(base.players,live));
  return {
    generatedAt:new Date().toISOString(),currentSeason:live.season||SEASON,statsSeason:SEASON,scoring,
    liveGames:live.games,liveEvents:live.events,
    health:{online:true,primary:base.source,teamsLoaded:base.teamsLoaded,rosterFailures:base.failures,liveFeed:liveError?'degraded':'online'},
    source:{name:base.source,live:'ESPN public scoreboard + game summaries',note:live.games?`${live.games} NFL game${live.games===1?'':'s'} live — player stats refresh automatically`:`ESPN NFL player engine online · ${base.teamsLoaded}/32 team rosters loaded`,fallback:base.fallback,primaryError:base.primaryError||'',liveError},
    players
  };
}

module.exports=async function handler(req,res){
  try{
    const raw=String(req.query?.scoring||'ppr').toLowerCase();const scoring=raw==='standard'?'standard':raw==='half'?'half':'ppr';
    const data=await build(scoring);
    res.setHeader('Cache-Control','s-maxage=10, stale-while-revalidate=20');res.setHeader('Content-Type','application/json; charset=utf-8');res.status(200).json(data);
  }catch(error){
    console.error('nfl-data fatal',error);res.setHeader('Cache-Control','no-store');res.status(503).json({error:'Football data engine unavailable.',detail:String(error?.message||error),version:VERSION});
  }
};
module.exports.config={maxDuration:60};
