const NOW = new Date();
const SEASON = NOW.getUTCMonth() >= 2 ? NOW.getUTCFullYear() : NOW.getUTCFullYear() - 1;
const POSITIONS = { 1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE' };
const TEAM = {0:'FA',1:'ATL',2:'BUF',3:'CHI',4:'CIN',5:'CLE',6:'DAL',7:'DEN',8:'DET',9:'GB',10:'TEN',11:'IND',12:'KC',13:'LV',14:'LAR',15:'MIA',16:'MIN',17:'NE',18:'NO',19:'NYG',20:'NYJ',21:'PHI',22:'ARI',23:'PIT',24:'LAC',25:'SF',26:'SEA',27:'TB',28:'WAS',29:'CAR',30:'JAX',33:'BAL',34:'HOU'};
const cache = new Map();

const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const clamp = (n, min=0, max=100) => Math.max(min, Math.min(max, n));
function percentile(values, value){const x=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return 50;let c=0;for(const n of x)if(n<=value)c++;return clamp(c/x.length*100);}

async function fetchJson(url, options={}, timeoutMs=9000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(url,{...options,signal:controller.signal,redirect:'follow',headers:{'Accept':'application/json','User-Agent':'Fantasy-Football-Matrix/1.4.0',...(options.headers||{})}});
    if(!r.ok)throw new Error(`${new URL(url).hostname} ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}
async function firstJson(requests){let last;for(const r of requests){try{return await fetchJson(r.url,r.options||{},r.timeoutMs||9000);}catch(e){last=e;}}throw last||new Error('No JSON source available');}
function fantasyFilter(){return JSON.stringify({players:{limit:2000,sortPercOwned:{sortPriority:4,sortAsc:false}},filterActive:{value:true}});}

async function loadEspnPlayerPool(){
  const path=`/apis/v3/games/ffl/seasons/${SEASON}/players?scoringPeriodId=0&view=kona_player_info`;
  const data=await firstJson([
    {url:`https://lm-api-reads.fantasy.espn.com${path}`,options:{headers:{'X-Fantasy-Filter':fantasyFilter()}}},
    {url:`https://fantasy.espn.com${path}`,options:{headers:{'X-Fantasy-Filter':fantasyFilter()}}}
  ]);
  if(!Array.isArray(data)||!data.length)throw new Error('ESPN fantasy player pool was empty');
  return data;
}

function injuryAvailability(status){
  const s=String(status||'ACTIVE').toUpperCase();
  if(['ACTIVE','NORMAL',''].includes(s))return 96;
  if(s.includes('QUESTION'))return 82;
  if(s.includes('DOUBT'))return 58;
  if(s.includes('OUT')||s.includes('IR')||s.includes('SUSP'))return 25;
  return 72;
}
function bestRank(p, scoring){
  const ranks=p.draftRanksByRankType||{};
  const keys=scoring==='standard'?['STANDARD','STD','PPR']:scoring==='half'?['HALF','HALF_PPR','PPR']:['PPR','HALF_PPR','STANDARD'];
  for(const k of keys){const r=num(ranks?.[k]?.rank ?? ranks?.[k]?.overallRanking ?? ranks?.[k]?.positionalRanking);if(r>0)return r;}
  const ratings=Array.isArray(p.ratings)?p.ratings:[];
  for(const r of ratings){const n=num(r.totalRanking||r.positionalRanking);if(n>0)return n;}
  return 999;
}
function seasonTotals(p){
  const stats=Array.isArray(p.stats)?p.stats:[];
  let projection=0, previous=0, currentActual=0;
  for(const s of stats){
    const total=num(s.appliedTotal); if(!total)continue;
    const season=num(s.seasonId),src=num(s.statSourceId);
    if(season===SEASON && src===1)projection=Math.max(projection,total);
    if(season===SEASON && src===0)currentActual=Math.max(currentActual,total);
    if(season===SEASON-1 && src===0)previous=Math.max(previous,total);
  }
  return {projection,currentActual,previous};
}
function normalizeEspnPlayers(entries, scoring){
  const raw=[];
  for(const entry of entries){
    const p=entry?.player||entry;
    const position=POSITIONS[num(p?.defaultPositionId)]; if(!position)continue;
    const name=p.fullName||p.displayName||p.name; if(!name)continue;
    const own=p.ownership||{},totals=seasonTotals(p);
    raw.push({id:String(p.id),name,position,team:TEAM[num(p.proTeamId)]||'',status:p.injuryStatus||p.injuryStatusType||'ACTIVE',rank:bestRank(p,scoring),percentOwned:num(own.percentOwned),percentStarted:num(own.percentStarted),projection:totals.projection,currentActual:totals.currentActual,previous:totals.previous,headshot:`https://a.espncdn.com/i/headshots/nfl/players/full/${p.id}.png`});
  }
  if(raw.length<80)throw new Error(`ESPN fantasy player pool too small (${raw.length})`);
  const byPos={};for(const pos of Object.values(POSITIONS))byPos[pos]=raw.filter(p=>p.position===pos);
  for(const p of raw){
    const g=byPos[p.position],rankScore=clamp(104-Math.min(p.rank,300)*.34);
    const projPct=p.projection?percentile(g.map(x=>x.projection),p.projection):rankScore;
    const prevPct=p.previous?percentile(g.map(x=>x.previous),p.previous):rankScore;
    const currentPct=p.currentActual?percentile(g.map(x=>x.currentActual),p.currentActual):50;
    const owned=clamp(p.percentOwned),started=clamp(p.percentStarted),avail=injuryAvailability(p.status);
    const production=clamp(prevPct*.55+projPct*.30+currentPct*.15),opportunity=clamp(projPct*.48+owned*.30+started*.22),ceiling=clamp(projPct*.62+rankScore*.38),consistency=clamp(rankScore*.52+avail*.34+owned*.14),trend=clamp(currentPct*.45+projPct*.35+rankScore*.20),tov=clamp(opportunity*.72+ceiling*.28),mvi=clamp(100-(consistency*.58+avail*.42));
    p.metrics={production:Math.round(production),opportunity:Math.round(opportunity),consistency:Math.round(consistency),ceiling:Math.round(ceiling),trend:Math.round(trend),tov:Math.round(tov),mvi:Math.round(mvi),availability:Math.round(avail)};
    delete p.rank;delete p.percentOwned;delete p.percentStarted;delete p.projection;delete p.currentActual;delete p.previous;
  }
  return raw;
}

function getLabelValue(labels,stats,names){for(const n of names){const i=labels.findIndex(x=>String(x).toUpperCase()===n);if(i>=0)return num(stats[i]);}return 0;}
function parseLiveSummary(summary, scoring){
  const out=new Map();
  for(const group of summary?.boxscore?.players||[]){
    for(const category of group.statistics||[]){
      const cname=String(category.name||category.displayName||'').toLowerCase(),labels=(category.labels||[]).map(x=>String(x).toUpperCase());
      for(const row of category.athletes||[]){
        const a=row.athlete||{};if(!a.id)continue;
        const rec=out.get(String(a.id))||{passYds:0,passTd:0,int:0,rushYds:0,rushTd:0,rec:0,recYds:0,recTd:0,lost:0},s=row.stats||[];
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
async function loadLiveEspn(scoring){
  const board=await fetchJson('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100',{},7000);
  const active=(Array.isArray(board?.events)?board.events:[]).filter(e=>e?.status?.type?.state==='in');
  if(!active.length)return {games:0,players:new Map(),events:[]};
  const summaries=await Promise.allSettled(active.map(e=>fetchJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(e.id)}`,{},7000)));
  const players=new Map();
  summaries.forEach((r,i)=>{if(r.status!=='fulfilled')return;for(const [id,stat] of parseLiveSummary(r.value,scoring))players.set(id,{...stat,eventId:active[i].id,status:active[i]?.status?.type?.shortDetail||'LIVE'});});
  return {games:active.length,players,events:active.map(e=>({id:e.id,name:e.name,status:e?.status?.type?.shortDetail||'LIVE'}))};
}
function applyLive(players,live){
  if(!live?.players?.size)return players;
  for(const p of players){const l=live.players.get(String(p.id));if(!l)continue;p.live=true;p.liveFantasyPoints=Math.round(l.points*10)/10;p.liveGameStatus=l.status;p.liveEventId=l.eventId;p.metrics.production=clamp(Math.round(p.metrics.production*.84+Math.min(100,l.points*4)*.16));p.metrics.trend=clamp(Math.round(p.metrics.trend*.72+Math.min(100,l.points*5)*.28));}
  return players;
}

async function loadNflverseFallback(){
  const rosterUrl=`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${SEASON}.csv`;
  const r=await fetch(rosterUrl,{headers:{'User-Agent':'Fantasy-Football-Matrix/1.4.0'}});if(!r.ok)throw new Error(`nflverse roster ${r.status}`);
  const lines=(await r.text()).split(/\r?\n/).filter(Boolean),head=lines.shift().split(','),idx=k=>head.indexOf(k),list=[];
  for(const line of lines){const c=line.split(','),pos=c[idx('position')];if(!['QB','RB','WR','TE'].includes(pos))continue;const name=c[idx('full_name')],id=c[idx('gsis_id')],team=c[idx('team')];if(!name||!id||!team)continue;const base=pos==='RB'?62:pos==='WR'?61:pos==='QB'?57:55;list.push({id,name,position:pos,team,status:c[idx('status')]||'ACT',metrics:{production:base,opportunity:base,consistency:58,ceiling:base+5,trend:50,tov:base,mvi:42,availability:85}});}
  if(list.length<80)throw new Error('nflverse fallback roster too small');return list.slice(0,500);
}

async function build(scoring,force=false){
  const hit=cache.get(scoring);if(!force&&hit&&hit.expires>Date.now())return hit.payload;
  let players,primary='ESPN Fantasy',primaryError='';
  try{players=normalizeEspnPlayers(await loadEspnPlayerPool(),scoring);}catch(e){primaryError=String(e.message||e);primary='nflverse fallback';players=await loadNflverseFallback();}
  let live={games:0,players:new Map(),events:[]},liveError='';
  try{live=await loadLiveEspn(scoring);applyLive(players,live);}catch(e){liveError=String(e.message||e);}
  const sorted=players.sort((a,b)=>{const score=p=>p.metrics.production*.36+p.metrics.opportunity*.24+p.metrics.ceiling*.16+p.metrics.consistency*.10+p.metrics.availability*.08+p.metrics.trend*.06;return score(b)-score(a);}).slice(0,350);
  const payload={generatedAt:new Date().toISOString(),currentSeason:SEASON,statsSeason:SEASON,scoring,liveGames:live.games,liveEvents:live.events,source:{name:primary,live:'ESPN live scoreboard + game summaries',note:live.games?`${live.games} NFL game${live.games===1?'':'s'} live — player stats refreshing`:'ESPN player engine online — no NFL game currently live',primaryError,liveError},players:sorted};
  cache.set(scoring,{payload,expires:Date.now()+30000});return payload;
}

module.exports=async function handler(req,res){
  try{const raw=String(req.query?.scoring||'ppr').toLowerCase(),scoring=raw==='standard'?'standard':raw==='half'?'half':'ppr',data=await build(scoring,req.query?.force==='1');res.setHeader('Cache-Control','s-maxage=20, stale-while-revalidate=40');res.setHeader('Content-Type','application/json; charset=utf-8');res.status(200).json(data);}
  catch(error){console.error('nfl-data fatal',error);res.setHeader('Cache-Control','no-store');res.status(503).json({error:'Football data engine unavailable.',detail:String(error?.message||error)});}
};
module.exports.config={maxDuration:60};
