const VERSION='1.5.4';
const NOW=new Date();
const CURRENT_SEASON=NOW.getUTCMonth()>=2?NOW.getUTCFullYear():NOW.getUTCFullYear()-1;
const PRESEASON=NOW.getUTCMonth()<8;
const FANTASY_POSITIONS=new Set(['QB','RB','WR','TE','K']);
const EXCLUDED_STATUSES=new Set(['CUT','RET','UFA','TRC','TRD','TRT','NWT']);
const TEAM_IDS=['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WSH'];
const cache=new Map();

const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
const mean=a=>a.length?a.reduce((s,n)=>s+n,0)/a.length:0;
const stdev=a=>{if(a.length<2)return 0;const m=mean(a);return Math.sqrt(mean(a.map(n=>(n-m)**2)))};
const quantile=(a,q)=>{const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return 0;const p=(x.length-1)*q,b=Math.floor(p),r=p-b;return x[b+1]!==undefined?x[b]+r*(x[b+1]-x[b]):x[b]};
const percentile=(a,value,inverse=false)=>{const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return 50;let c=0;for(const n of x)if(n<=value)c++;const p=c/x.length*100;return clamp(inverse?100-p:p)};
const normalizeTeam=t=>String(t||'').toUpperCase()==='WAS'?'WSH':String(t||'').toUpperCase();

function parseCsvLine(line){const out=[];let field='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){field+='"';i++}else quoted=!quoted}else if(ch===','&&!quoted){out.push(field);field=''}else field+=ch}out.push(field);return out}
function csvRows(text,wanted){const lines=text.split(/\r?\n/).filter(Boolean);if(!lines.length)return[];const header=parseCsvLine(lines[0]).map(x=>x.replace(/^\uFEFF/,''));const idx={};for(const key of wanted){const i=header.indexOf(key);if(i>=0)idx[key]=i}const rows=[];for(let i=1;i<lines.length;i++){const cols=parseCsvLine(lines[i]),row={};for(const [key,j] of Object.entries(idx))row[key]=cols[j]??'';rows.push(row)}return rows}
async function fetchText(url,timeoutMs=20000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetch(url,{redirect:'follow',signal:controller.signal,cache:'no-store',headers:{'User-Agent':`Fantasy-Football-Matrix/${VERSION}`,'Accept':'text/csv,text/plain,*/*'}});if(!response.ok)throw new Error(`${response.status} ${url}`);const text=await response.text();if(!text||!text.includes(','))throw new Error(`Invalid CSV ${url}`);return text}finally{clearTimeout(timer)}}
async function firstText(urls){let last;for(const url of urls){try{return{url,text:await fetchText(url)}}catch(e){last=e}}throw last||new Error('No text source available')}
async function fetchJson(url,timeout=5500){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{const response=await fetch(url,{signal:controller.signal,cache:'no-store',headers:{Accept:'application/json','User-Agent':`Fantasy-Football-Matrix/${VERSION}`}});if(!response.ok)throw new Error(`HTTP ${response.status}`);return await response.json()}finally{clearTimeout(timer)}}

function fantasyPoints(r,scoring){const rec=scoring==='ppr'?1:scoring==='half'?.5:0;return num(r.passing_yards)*.04+num(r.passing_tds)*4-num(r.interceptions)*2+num(r.rushing_yards)*.1+num(r.rushing_tds)*6+num(r.receptions)*rec+num(r.receiving_yards)*.1+num(r.receiving_tds)*6+num(r.receiving_2pt_conversions)*2+num(r.rushing_2pt_conversions)*2+num(r.passing_2pt_conversions)*2-num(r.fumbles_lost)*2}
function statusPenalty(s){const status=String(s||'ACT').toUpperCase();if(status==='ACT'||status==='ACTIVE')return 0;if(status==='INA')return 7;if(status==='PUP')return 12;if(status==='RES'||status==='RSN'||status.includes('IR'))return 18;if(status==='SUS')return 20;return 5}
function rookieBase(p){return p==='RB'?59:p==='WR'?57:p==='QB'?53:p==='TE'?50:p==='K'?47:50}
function roleFallback(pos,years,status){const base=rookieBase(pos)+(years>0?Math.min(5,years)*.8:0),avail=clamp(82-statusPenalty(status));return{production:Math.round(clamp(base)),opportunity:Math.round(clamp(base+3)),consistency:Math.round(clamp(base-7+avail*.18)),ceiling:Math.round(clamp(base+7)),trend:50,tov:Math.round(clamp(base+4)),mvi:Math.round(clamp(100-(base*.58+avail*.42))),availability:Math.round(avail)}}
function dstMetrics(){return{production:61,opportunity:64,consistency:60,ceiling:69,trend:55,tov:63,mvi:38,availability:100}}

async function loadRoster(){let last;for(const season of [CURRENT_SEASON,CURRENT_SEASON-1]){try{const src=await firstText([`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`]);return{season,...src}}catch(e){last=e}}throw last||new Error('Current roster unavailable')}
async function loadStats(){const preferred=PRESEASON?CURRENT_SEASON-1:CURRENT_SEASON;const seasons=[preferred,CURRENT_SEASON-1].filter((v,i,a)=>a.indexOf(v)===i);let last;for(const season of seasons){try{const src=await firstText([`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`]);return{season,...src}}catch(e){last=e}}try{const src=await firstText(['https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv']);return{season:preferred,...src}}catch(e){throw last||e}}
async function live(){try{const board=await fetchJson('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100',5000);const events=Array.isArray(board?.events)?board.events:[],active=events.filter(e=>e?.status?.type?.state==='in');return{games:active.length,events:active.map(e=>({id:e.id,name:e.name,status:e?.status?.type?.shortDetail||'LIVE'})),season:board?.season?.year||CURRENT_SEASON,week:board?.week?.number||null,error:''}}catch(e){return{games:0,events:[],season:CURRENT_SEASON,week:null,error:String(e?.message||e)}}}

async function buildPayload(scoring){
  const hit=cache.get(scoring);if(hit&&hit.expires>Date.now())return hit.payload;
  const [rosterSource,statsSource,liveData]=await Promise.all([loadRoster(),loadStats().catch(e=>({season:null,text:'',error:String(e?.message||e)})),live()]);
  const rosterRows=csvRows(rosterSource.text,['team','position','status','full_name','gsis_id','years_exp','headshot_url']);
  const statRowsRaw=statsSource.text?csvRows(statsSource.text,['player_id','position','season','week','season_type','attempts','passing_yards','passing_tds','interceptions','carries','rushing_yards','rushing_tds','targets','receptions','receiving_yards','receiving_tds','receiving_2pt_conversions','rushing_2pt_conversions','passing_2pt_conversions','fumbles_lost']):[];
  if(!rosterRows.length)throw new Error('nflverse roster returned no rows');

  const active=new Map();
  for(const r of rosterRows){const pos=String(r.position||'').toUpperCase(),team=normalizeTeam(r.team),status=String(r.status||'ACT').toUpperCase();if(!r.gsis_id||!FANTASY_POSITIONS.has(pos)||!team||EXCLUDED_STATUSES.has(status))continue;active.set(r.gsis_id,{...r,position:pos,team,status})}
  if(active.size<100)throw new Error(`nflverse current roster returned only ${active.size} fantasy players`);

  const statRows=statRowsRaw.filter(r=>(!statsSource.season||!r.season||num(r.season)===statsSource.season)&&(!r.season_type||String(r.season_type).toUpperCase()==='REG'));
  const weeksById=new Map();
  for(const r of statRows){const pos=String(r.position||'').toUpperCase();if(!r.player_id||!['QB','RB','WR','TE'].includes(pos))continue;const points=fantasyPoints(r,scoring);const opportunity=pos==='QB'?num(r.attempts)*.18+num(r.carries)*.85:num(r.carries)+num(r.targets)*1.55;const highValue=pos==='QB'?num(r.passing_tds)*4+num(r.rushing_tds)*7:num(r.targets)*1.7+num(r.receptions)*.7+(num(r.rushing_tds)+num(r.receiving_tds))*6;if(!weeksById.has(r.player_id))weeksById.set(r.player_id,[]);weeksById.get(r.player_id).push({week:num(r.week),points,opportunity,highValue})}

  const players=[];
  for(const [id,r] of active){
    const weeks=(weeksById.get(id)||[]).sort((a,b)=>a.week-b.week),pointWeeks=weeks.map(w=>w.points).filter(Number.isFinite),oppWeeks=weeks.map(w=>w.opportunity),last4=weeks.slice(-4),avgPoints=mean(pointWeeks),avgOpportunity=mean(oppWeeks),recentPoints=mean(last4.map(w=>w.points)),cv=avgPoints>0?stdev(pointWeeks)/avgPoints:1.25,yearsExp=num(r.years_exp),rookie=yearsExp===0;
    players.push({id,name:r.full_name||'Unknown Player',position:r.position,team:r.team,status:r.status||'ACT',yearsExp,rookie,games:pointWeeks.length,avgPoints:Math.round(avgPoints*10)/10,floor:Math.round(quantile(pointWeeks,.25)*10)/10,ceiling:Math.round(quantile(pointWeeks,.9)*10)/10,headshot:r.headshot_url||'',_avgOpportunity:avgOpportunity,_recentPoints:recentPoints,_trendRatio:avgPoints>0?recentPoints/avgPoints:1,_cv:cv,_highValuePerGame:mean(weeks.map(w=>w.highValue)),metrics:null})
  }

  const byPos={};for(const pos of ['QB','RB','WR','TE'])byPos[pos]=players.filter(p=>p.position===pos&&p.games>=3);
  for(const p of players){
    if(p.position==='K'||p.games<1){p.metrics=roleFallback(p.position,p.yearsExp,p.status)}
    else{const group=byPos[p.position]||[],production=percentile(group.map(x=>x.avgPoints),p.avgPoints),opportunity=percentile(group.map(x=>x._avgOpportunity),p._avgOpportunity),consistency=percentile(group.map(x=>x._cv),p._cv,true),ceiling=percentile(group.map(x=>x.ceiling),p.ceiling),trend=percentile(group.map(x=>x._trendRatio),p._trendRatio),tov=clamp(opportunity*.68+percentile(group.map(x=>x._highValuePerGame),p._highValuePerGame)*.32),mvi=percentile(group.map(x=>x._cv),p._cv),availability=clamp((Math.min(17,p.games)/17)*100-statusPenalty(p.status));p.metrics={production:Math.round(production),opportunity:Math.round(opportunity),consistency:Math.round(consistency),ceiling:Math.round(ceiling),trend:Math.round(trend),tov:Math.round(tov),mvi:Math.round(mvi),availability:Math.round(availability)}}
    delete p._avgOpportunity;delete p._recentPoints;delete p._trendRatio;delete p._cv;delete p._highValuePerGame;
  }

  players.push(...TEAM_IDS.map(team=>({id:`DST-${team}`,name:`${team} Defense / Special Teams`,position:'DST',team,status:'Active',yearsExp:0,rookie:false,games:0,avgPoints:0,floor:0,ceiling:0,headshot:`https://a.espncdn.com/i/teamlogos/nfl/500/${team.toLowerCase()}.png`,metrics:dstMetrics()})));
  const unique=[...new Map(players.filter(p=>p.name!=='Unknown Player').map(p=>[`${p.position}:${p.id}`,p])).values()];
  const score=p=>p.metrics.production*.34+p.metrics.opportunity*.26+p.metrics.ceiling*.16+p.metrics.consistency*.10+p.metrics.availability*.08+p.metrics.trend*.06;
  unique.sort((a,b)=>score(b)-score(a));
  const teamsLoaded=new Set(rosterRows.map(r=>normalizeTeam(r.team)).filter(Boolean)).size;
  const payload={version:VERSION,generatedAt:new Date().toISOString(),currentSeason:liveData.season,rosterSeason:rosterSource.season,statsSeason:statsSource.season,scoring,liveGames:liveData.games,liveEvents:liveData.events,health:{online:true,primary:'nflverse',teamsLoaded,rosterFailures:0,performanceFeed:statsSource.error?'degraded':'online',liveFeed:liveData.error?'degraded':'online'},source:{name:'nflverse + ESPN',license:'nflverse CC BY 4.0',live:'ESPN public scoreboard',note:`Current nflverse roster${statsSource.season?` · ${statsSource.season} performance baseline`:' · role-based performance fallback'}${liveData.error?' · live scoreboard degraded':''}`,fallback:rosterSource.season!==CURRENT_SEASON||Boolean(statsSource.error),liveError:liveData.error,statsError:statsSource.error||''},players:unique.slice(0,650)};
  cache.set(scoring,{payload,expires:Date.now()+5*60*1000});return payload;
}
module.exports=async function handler(req,res){try{const raw=String(req.query?.scoring||'ppr').toLowerCase(),scoring=raw==='standard'?'standard':raw==='half'?'half':'ppr',data=await buildPayload(scoring);res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=120');res.status(200).json(data)}catch(error){console.error('nfl-data fatal',error);res.setHeader('Cache-Control','no-store');res.status(503).json({error:'Football data engine unavailable.',detail:String(error?.message||error),version:VERSION})}}
module.exports.config={maxDuration:60};
