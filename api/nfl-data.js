const NOW = new Date();
const CURRENT_SEASON = NOW.getUTCMonth() >= 2 ? NOW.getUTCFullYear() : NOW.getUTCFullYear() - 1;
const PRESEASON = NOW.getUTCMonth() < 8;
const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const EXCLUDED_STATUSES = new Set(['CUT', 'RET', 'UFA', 'TRC', 'TRD', 'TRT', 'NWT']);
const cache = new Map();

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function clamp(n, min = 0, max = 100) { return Math.max(min, Math.min(max, n)); }
function mean(a) { return a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0; }
function stdev(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(mean(a.map(n => (n - m) ** 2))); }
function quantile(a, q) { const x = a.filter(Number.isFinite).sort((a,b)=>a-b); if (!x.length) return 0; const p=(x.length-1)*q,b=Math.floor(p),r=p-b; return x[b+1]!==undefined?x[b]+r*(x[b+1]-x[b]):x[b]; }
function percentile(a, value, inverse=false) { const x=a.filter(Number.isFinite).sort((a,b)=>a-b); if(!x.length)return 50; let c=0; for(const n of x)if(n<=value)c++; let p=c/x.length*100; return clamp(inverse?100-p:p); }

function parseCsvLine(line) {
  const out=[]; let field=''; let quoted=false;
  for(let i=0;i<line.length;i++){
    const ch=line[i];
    if(ch==='"'){
      if(quoted&&line[i+1]==='"'){field+='"';i++;} else quoted=!quoted;
    } else if(ch===','&&!quoted){out.push(field);field='';} else field+=ch;
  }
  out.push(field); return out;
}

function csvRows(text, wanted) {
  const lines=text.split(/\r?\n/).filter(Boolean); if(!lines.length)return [];
  const header=parseCsvLine(lines[0]); const idx={};
  for(const key of wanted){const i=header.indexOf(key);if(i>=0)idx[key]=i;}
  const rows=[];
  for(let i=1;i<lines.length;i++){
    const cols=parseCsvLine(lines[i]); const row={};
    for(const [key,j] of Object.entries(idx))row[key]=cols[j]??'';
    rows.push(row);
  }
  return rows;
}

async function getText(url, timeoutMs=6500) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{redirect:'follow',signal:controller.signal,headers:{'User-Agent':'Fantasy-Football-Matrix/1.3.5','Accept':'text/csv,text/plain;q=0.9,*/*;q=0.8'}});
    if(!response.ok)throw new Error(`Source request failed ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}

function fantasyPoints(row, scoring) {
  const recPts=scoring==='ppr'?1:scoring==='half'?0.5:0;
  return num(row.passing_yards)*.04 + num(row.passing_tds)*4 - num(row.interceptions)*2 +
    num(row.rushing_yards)*.1 + num(row.rushing_tds)*6 + num(row.receptions)*recPts +
    num(row.receiving_yards)*.1 + num(row.receiving_tds)*6 +
    num(row.receiving_2pt_conversions)*2 + num(row.rushing_2pt_conversions)*2 +
    num(row.passing_2pt_conversions)*2 - num(row.fumbles_lost)*2;
}

function statusPenalty(status) {
  if(!status||status==='ACT')return 0;
  if(status==='INA')return 7;
  if(status==='PUP')return 12;
  if(status==='RES'||status==='RSN')return 18;
  if(status==='SUS')return 20;
  return 5;
}

function rookieBase(position) {
  if(position==='RB')return 59;
  if(position==='WR')return 57;
  if(position==='QB')return 53;
  if(position==='TE')return 50;
  return 50;
}

async function loadRoster() {
  const current=`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${CURRENT_SEASON}.csv`;
  try { return { season:CURRENT_SEASON, text:await getText(current) }; }
  catch (firstError) {
    const prior=CURRENT_SEASON-1;
    const fallback=`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${prior}.csv`;
    return { season:prior, text:await getText(fallback) };
  }
}

async function loadStats() {
  const preferred=PRESEASON?CURRENT_SEASON-1:CURRENT_SEASON;
  const preferredUrl=`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${preferred}.csv`;
  try{
    const text=await getText(preferredUrl);
    if(!PRESEASON && !(text.includes(',REG,')||text.includes(',REG\r')||text.includes(',REG\n')))throw new Error('No regular season rows yet');
    return { season:preferred, text };
  } catch (firstError) {
    const prior=CURRENT_SEASON-1;
    if(preferred===prior)throw firstError;
    const url=`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${prior}.csv`;
    return { season:prior, text:await getText(url) };
  }
}

async function buildPayload(scoring) {
  const hit=cache.get(scoring);
  if(hit&&hit.expires>Date.now())return hit.payload;

  // Only two source downloads are required. This avoids the old cold-start timeout caused by
  // downloading the large players metadata file and probing an unavailable preseason stat file.
  const [rosterSource,statsSource]=await Promise.all([loadRoster(),loadStats()]);

  const rosterRows=csvRows(rosterSource.text,['team','position','status','full_name','gsis_id','years_exp','headshot_url']);
  const statRows=csvRows(statsSource.text,[
    'player_id','position','week','season_type','attempts','passing_yards','passing_tds','interceptions',
    'carries','rushing_yards','rushing_tds','targets','receptions','receiving_yards','receiving_tds',
    'receiving_2pt_conversions','rushing_2pt_conversions','passing_2pt_conversions','fumbles_lost'
  ]);

  const active=new Map();
  for(const row of rosterRows){
    if(!row.gsis_id||!POSITIONS.has(row.position)||!row.team||EXCLUDED_STATUSES.has(row.status))continue;
    active.set(row.gsis_id,row);
  }

  const weeksById=new Map();
  for(const row of statRows){
    if(row.season_type&&row.season_type!=='REG')continue;
    if(!row.player_id||!POSITIONS.has(row.position))continue;
    const points=fantasyPoints(row,scoring);
    const opportunity=row.position==='QB'?num(row.attempts)*.18+num(row.carries)*.85:num(row.carries)+num(row.targets)*1.55;
    const highValue=row.position==='QB'?num(row.passing_tds)*4+num(row.rushing_tds)*7:num(row.targets)*1.7+num(row.receptions)*.7+(num(row.rushing_tds)+num(row.receiving_tds))*6;
    if(!weeksById.has(row.player_id))weeksById.set(row.player_id,[]);
    weeksById.get(row.player_id).push({week:num(row.week),points,opportunity,highValue});
  }

  const players=[];
  for(const [id,roster] of active){
    const weeks=(weeksById.get(id)||[]).sort((a,b)=>a.week-b.week);
    const pointWeeks=weeks.map(w=>w.points).filter(v=>v>=0);
    const oppWeeks=weeks.map(w=>w.opportunity);
    const last4=weeks.slice(-4);
    const avgPoints=mean(pointWeeks),avgOpportunity=mean(oppWeeks);
    const recentPoints=mean(last4.map(w=>w.points));
    const cv=avgPoints>0?stdev(pointWeeks)/avgPoints:1.25;
    const yearsExp=num(roster.years_exp);
    const rookie=yearsExp===0;
    players.push({
      id,name:roster.full_name||'Unknown Player',position:roster.position,team:roster.team,status:roster.status||'ACT',yearsExp,rookie,
      games:pointWeeks.length,avgPoints,avgOpportunity,recentPoints,trendRatio:avgPoints>0?recentPoints/avgPoints:1,cv,
      floor:quantile(pointWeeks,.25),ceiling:quantile(pointWeeks,.9),highValuePerGame:mean(weeks.map(w=>w.highValue)),draftBase:rookieBase(roster.position)
    });
  }

  const byPos={};
  for(const pos of POSITIONS)byPos[pos]=players.filter(p=>p.position===pos&&p.games>=3);
  for(const p of players){
    const group=byPos[p.position]||[];
    const base=p.games>=3?null:p.draftBase;
    const production=base??percentile(group.map(x=>x.avgPoints),p.avgPoints);
    const opportunity=base??percentile(group.map(x=>x.avgOpportunity),p.avgOpportunity);
    const consistency=base!==null?clamp(base-9):percentile(group.map(x=>x.cv),p.cv,true);
    const ceiling=base!==null?clamp(base+5):percentile(group.map(x=>x.ceiling),p.ceiling);
    const trend=base!==null?50:percentile(group.map(x=>x.trendRatio),p.trendRatio);
    const tov=base!==null?base:clamp(percentile(group.map(x=>x.avgOpportunity),p.avgOpportunity)*.68+percentile(group.map(x=>x.highValuePerGame),p.highValuePerGame)*.32);
    const mvi=base!==null?64:clamp(percentile(group.map(x=>x.cv),p.cv));
    const availability=base!==null?clamp(78-statusPenalty(p.status)):clamp((p.games/17)*100-statusPenalty(p.status));
    p.metrics={production:Math.round(production),opportunity:Math.round(opportunity),consistency:Math.round(consistency),ceiling:Math.round(ceiling),trend:Math.round(trend),tov:Math.round(tov),mvi:Math.round(mvi),availability:Math.round(availability)};
  }

  const sorted=players.filter(p=>p.name!=='Unknown Player').sort((a,b)=>{
    const score=p=>p.metrics.production*.42+p.metrics.opportunity*.24+p.metrics.ceiling*.14+p.metrics.consistency*.1+p.metrics.availability*.1;
    return score(b)-score(a);
  }).slice(0,300);

  const payload={
    generatedAt:new Date().toISOString(),currentSeason:CURRENT_SEASON,statsSeason:statsSource.season,scoring,
    source:{name:'nflverse',license:'CC BY 4.0',note:`${rosterSource.season} roster + ${statsSource.season} regular-season performance baseline`},
    players:sorted
  };
  cache.set(scoring,{payload,expires:Date.now()+30*60*1000});
  return payload;
}

module.exports=async function handler(req,res){
  try{
    const raw=String(req.query?.scoring||'ppr').toLowerCase();
    const scoring=raw==='standard'?'standard':raw==='half'?'half':'ppr';
    const data=await buildPayload(scoring);
    res.setHeader('Cache-Control','s-maxage=21600, stale-while-revalidate=86400');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.status(200).json(data);
  } catch(error){
    console.error('nfl-data error',error);
    res.setHeader('Cache-Control','no-store');
    res.status(503).json({error:'Live football data is temporarily unavailable.',detail:String(error?.message||error)});
  }
};

module.exports.config={maxDuration:60};
