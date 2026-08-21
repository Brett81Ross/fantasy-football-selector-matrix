const NOW = new Date();
const CURRENT_SEASON = NOW.getUTCMonth() >= 2 ? NOW.getUTCFullYear() : NOW.getUTCFullYear() - 1;
const PRESEASON = NOW.getUTCMonth() < 8;
const POSITIONS = new Set(['QB','RB','WR','TE']);
const EXCLUDED_STATUSES = new Set(['CUT','RET','UFA','TRC','TRD','TRT','NWT']);
const cache = new Map();

const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
const mean=a=>a.length?a.reduce((s,n)=>s+n,0)/a.length:0;
const stdev=a=>{if(a.length<2)return 0;const m=mean(a);return Math.sqrt(mean(a.map(n=>(n-m)**2)))};
const quantile=(a,q)=>{const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return 0;const p=(x.length-1)*q,b=Math.floor(p),r=p-b;return x[b+1]!==undefined?x[b]+r*(x[b+1]-x[b]):x[b]};
const percentile=(a,value,inverse=false)=>{const x=a.filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)return 50;let c=0;for(const n of x)if(n<=value)c++;const p=c/x.length*100;return clamp(inverse?100-p:p)};

function parseCsvLine(line){const out=[];let field='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){field+='"';i++}else quoted=!quoted}else if(ch===','&&!quoted){out.push(field);field=''}else field+=ch}out.push(field);return out}
function csvRows(text,wanted){const lines=text.split(/\r?\n/).filter(Boolean);if(!lines.length)return[];const header=parseCsvLine(lines[0]).map(x=>x.replace(/^\uFEFF/,''));const idx={};for(const key of wanted){const i=header.indexOf(key);if(i>=0)idx[key]=i}const rows=[];for(let i=1;i<lines.length;i++){const cols=parseCsvLine(lines[i]),row={};for(const [key,j] of Object.entries(idx))row[key]=cols[j]??'';rows.push(row)}return rows}

async function getText(url,timeoutMs=20000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetch(url,{redirect:'follow',signal:controller.signal,headers:{'User-Agent':'Fantasy-Football-Matrix/1.3.8','Accept':'text/csv,text/plain,*/*'}});if(!response.ok)throw new Error(`${response.status} ${url}`);const text=await response.text();if(!text||!text.includes(','))throw new Error(`Invalid CSV ${url}`);return text}finally{clearTimeout(timer)}}
async function firstAvailable(urls){let last;for(const url of urls){try{return{url,text:await getText(url)}}catch(e){last=e}}throw last||new Error('No source available')}

function fantasyPoints(r,scoring){const rec=scoring==='ppr'?1:scoring==='half'?.5:0;return num(r.passing_yards)*.04+num(r.passing_tds)*4-num(r.interceptions)*2+num(r.rushing_yards)*.1+num(r.rushing_tds)*6+num(r.receptions)*rec+num(r.receiving_yards)*.1+num(r.receiving_tds)*6+num(r.receiving_2pt_conversions)*2+num(r.rushing_2pt_conversions)*2+num(r.passing_2pt_conversions)*2-num(r.fumbles_lost)*2}
function statusPenalty(s){if(!s||s==='ACT')return 0;if(s==='INA')return 7;if(s==='PUP')return 12;if(s==='RES'||s==='RSN')return 18;if(s==='SUS')return 20;return 5}
function rookieBase(p){return p==='RB'?59:p==='WR'?57:p==='QB'?53:p==='TE'?50:50}

async function loadRoster(){let last;for(const season of [CURRENT_SEASON,CURRENT_SEASON-1]){try{const src=await firstAvailable([`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`]);return{season,...src}}catch(e){last=e}}throw last||new Error('Roster unavailable')}
async function loadStats(){const src=await firstAvailable([
  'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv',
  `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${CURRENT_SEASON-1}.csv`
]);return src}

async function buildPayload(scoring){
  const hit=cache.get(scoring);if(hit&&hit.expires>Date.now())return hit.payload;
  const [rosterSource,statsSource]=await Promise.all([loadRoster(),loadStats()]);
  const rosterRows=csvRows(rosterSource.text,['team','position','status','full_name','gsis_id','years_exp','headshot_url']);
  const allStats=csvRows(statsSource.text,['player_id','position','season','week','season_type','attempts','passing_yards','passing_tds','interceptions','carries','rushing_yards','rushing_tds','targets','receptions','receiving_yards','receiving_tds','receiving_2pt_conversions','rushing_2pt_conversions','passing_2pt_conversions','fumbles_lost']);
  if(!rosterRows.length||!allStats.length)throw new Error('NFL source returned no rows');

  const seasons=[...new Set(allStats.map(r=>num(r.season)).filter(Boolean))].sort((a,b)=>b-a);
  const statsSeason=seasons.includes(CURRENT_SEASON)&&!PRESEASON?CURRENT_SEASON:(seasons.find(s=>s<=CURRENT_SEASON-1)||seasons[0]);
  const statRows=allStats.filter(r=>(!r.season||num(r.season)===statsSeason)&&(!r.season_type||r.season_type==='REG'));
  if(!statRows.length)throw new Error(`No usable player stats for ${statsSeason}`);

  const active=new Map();
  for(const r of rosterRows){if(!r.gsis_id||!POSITIONS.has(r.position)||!r.team||EXCLUDED_STATUSES.has(r.status))continue;active.set(r.gsis_id,r)}
  if(!active.size)throw new Error('Current roster produced no active fantasy players');

  const weeksById=new Map();
  for(const r of statRows){if(!r.player_id||!POSITIONS.has(r.position))continue;const points=fantasyPoints(r,scoring);const opportunity=r.position==='QB'?num(r.attempts)*.18+num(r.carries)*.85:num(r.carries)+num(r.targets)*1.55;const highValue=r.position==='QB'?num(r.passing_tds)*4+num(r.rushing_tds)*7:num(r.targets)*1.7+num(r.receptions)*.7+(num(r.rushing_tds)+num(r.receiving_tds))*6;if(!weeksById.has(r.player_id))weeksById.set(r.player_id,[]);weeksById.get(r.player_id).push({week:num(r.week),points,opportunity,highValue})}

  const players=[];
  for(const [id,r] of active){const weeks=(weeksById.get(id)||[]).sort((a,b)=>a.week-b.week),pointWeeks=weeks.map(w=>w.points).filter(v=>v>=0),oppWeeks=weeks.map(w=>w.opportunity),last4=weeks.slice(-4),avgPoints=mean(pointWeeks),avgOpportunity=mean(oppWeeks),recentPoints=mean(last4.map(w=>w.points)),cv=avgPoints>0?stdev(pointWeeks)/avgPoints:1.25,yearsExp=num(r.years_exp),rookie=yearsExp===0;players.push({id,name:r.full_name||'Unknown Player',position:r.position,team:r.team,status:r.status||'ACT',yearsExp,rookie,games:pointWeeks.length,avgPoints,avgOpportunity,recentPoints,trendRatio:avgPoints>0?recentPoints/avgPoints:1,cv,floor:quantile(pointWeeks,.25),ceiling:quantile(pointWeeks,.9),highValuePerGame:mean(weeks.map(w=>w.highValue)),draftBase:rookieBase(r.position)})}

  const byPos={};for(const pos of POSITIONS)byPos[pos]=players.filter(p=>p.position===pos&&p.games>=3);
  for(const p of players){const group=byPos[p.position]||[],base=p.games>=3?null:p.draftBase,production=base??percentile(group.map(x=>x.avgPoints),p.avgPoints),opportunity=base??percentile(group.map(x=>x.avgOpportunity),p.avgOpportunity),consistency=base!==null?clamp(base-9):percentile(group.map(x=>x.cv),p.cv,true),ceiling=base!==null?clamp(base+5):percentile(group.map(x=>x.ceiling),p.ceiling),trend=base!==null?50:percentile(group.map(x=>x.trendRatio),p.trendRatio),tov=base!==null?base:clamp(percentile(group.map(x=>x.avgOpportunity),p.avgOpportunity)*.68+percentile(group.map(x=>x.highValuePerGame),p.highValuePerGame)*.32),mvi=base!==null?64:clamp(percentile(group.map(x=>x.cv),p.cv)),availability=base!==null?clamp(78-statusPenalty(p.status)):clamp((p.games/17)*100-statusPenalty(p.status));p.metrics={production:Math.round(production),opportunity:Math.round(opportunity),consistency:Math.round(consistency),ceiling:Math.round(ceiling),trend:Math.round(trend),tov:Math.round(tov),mvi:Math.round(mvi),availability:Math.round(availability)}}

  const sorted=players.filter(p=>p.name!=='Unknown Player').sort((a,b)=>{const score=p=>p.metrics.production*.42+p.metrics.opportunity*.24+p.metrics.ceiling*.14+p.metrics.consistency*.1+p.metrics.availability*.1;return score(b)-score(a)}).slice(0,300);
  if(!sorted.length)throw new Error('No current fantasy players produced');
  const payload={generatedAt:new Date().toISOString(),currentSeason:CURRENT_SEASON,rosterSeason:rosterSource.season,statsSeason,scoring,freshness:{roster:'current nflverse roster feed',performance:`${statsSeason} regular-season baseline`,cacheMinutes:5},source:{name:'nflverse',license:'CC BY 4.0'},players:sorted};
  cache.set(scoring,{payload,expires:Date.now()+5*60*1000});return payload;
}

module.exports=async function handler(req,res){try{const raw=String(req.query?.scoring||'ppr').toLowerCase(),scoring=raw==='standard'?'standard':raw==='half'?'half':'ppr',data=await buildPayload(scoring);res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=300');res.setHeader('Content-Type','application/json; charset=utf-8');res.status(200).json(data)}catch(error){console.error('nfl-data error',error);res.setHeader('Cache-Control','no-store');res.status(503).json({error:'Live football data is temporarily unavailable.',detail:String(error?.message||error)})}}
module.exports.config={maxDuration:60};
