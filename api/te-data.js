const VERSION='1.5.4';
const CURRENT_SEASON=new Date().getUTCMonth()>=2?new Date().getUTCFullYear():new Date().getUTCFullYear()-1;
const cache={value:null,expires:0};
const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const normalizeTeam=t=>String(t||'').toUpperCase()==='WAS'?'WSH':String(t||'').toUpperCase();

function parseCsvLine(line){const out=[];let field='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){field+='"';i++}else quoted=!quoted}else if(ch===','&&!quoted){out.push(field);field=''}else field+=ch}out.push(field);return out}
function csvRows(text,wanted){const lines=text.split(/\r?\n/).filter(Boolean);if(!lines.length)return[];const header=parseCsvLine(lines[0]).map(x=>x.replace(/^\uFEFF/,''));const idx={};for(const key of wanted){const i=header.indexOf(key);if(i>=0)idx[key]=i}const rows=[];for(let i=1;i<lines.length;i++){const cols=parseCsvLine(lines[i]),row={};for(const [key,j] of Object.entries(idx))row[key]=cols[j]??'';rows.push(row)}return rows}
async function fetchText(url,timeoutMs=16000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const response=await fetch(url,{redirect:'follow',signal:controller.signal,cache:'no-store',headers:{Accept:'text/csv,text/plain,*/*','User-Agent':`Fantasy-Football-Matrix/${VERSION}`}});if(!response.ok)throw new Error(`HTTP ${response.status}`);const text=await response.text();if(!text||!text.includes(','))throw new Error('Invalid roster CSV');return text}finally{clearTimeout(timer)}}
async function loadRoster(){let last;for(const season of [CURRENT_SEASON,CURRENT_SEASON-1]){try{return{season,text:await fetchText(`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`)}}catch(e){last=e}}throw last||new Error('Roster unavailable')}
function availability(status){const s=String(status||'ACT').toUpperCase();if(s==='ACT'||s==='ACTIVE')return 96;if(s.includes('QUESTION'))return 82;if(s.includes('DOUBT'))return 58;if(s.includes('OUT')||s.includes('RES')||s.includes('IR')||s.includes('PUP')||s.includes('SUS'))return 28;return 76}
function metrics(depth,years,status){const base=[74,64,55,48,43,39][Math.min(depth,5)],veteran=Math.min(5,Math.max(0,years))*.8,rookie=years===0,avail=availability(status),production=clamp(base+veteran-(depth>1?2:0)),opportunity=clamp(base+(depth===0?8:depth===1?4:-1)),consistency=clamp(base*.64+avail*.30+veteran),ceiling=clamp(base+(rookie?10:6)+(depth===0?4:0)),trend=rookie?60:53,tov=clamp(opportunity*.7+ceiling*.3),mvi=clamp(100-(consistency*.62+avail*.38));return{production:Math.round(production),opportunity:Math.round(opportunity),consistency:Math.round(consistency),ceiling:Math.round(ceiling),trend:Math.round(trend),tov:Math.round(tov),mvi:Math.round(mvi),availability:Math.round(avail)}}
async function build(){
  if(cache.value&&cache.expires>Date.now())return cache.value;
  const src=await loadRoster(),rows=csvRows(src.text,['team','position','status','full_name','gsis_id','years_exp','headshot_url']);
  const depthByTeam={};const players=[];
  for(const r of rows){if(String(r.position||'').toUpperCase()!=='TE'||!r.gsis_id||!r.full_name)continue;const team=normalizeTeam(r.team);if(!team)continue;const depth=depthByTeam[team]||0;depthByTeam[team]=depth+1;const years=num(r.years_exp),status=r.status||'ACT';players.push({id:r.gsis_id,name:r.full_name,position:'TE',team,status,yearsExp:years,rookie:years===0,headshot:r.headshot_url||'',metrics:metrics(depth,years,status)})}
  const unique=[...new Map(players.map(p=>[p.id,p])).values()];
  if(unique.length<20)throw new Error(`Only ${unique.length} tight ends loaded from nflverse`);
  unique.sort((a,b)=>(b.metrics.production+b.metrics.opportunity+b.metrics.ceiling)-(a.metrics.production+a.metrics.opportunity+a.metrics.ceiling));
  const value={version:VERSION,position:'TE',rosterSeason:src.season,teamsLoaded:new Set(unique.map(p=>p.team)).size,count:unique.length,source:'nflverse current roster',players:unique};cache.value=value;cache.expires=Date.now()+5*60*1000;return value;
}
module.exports=async function handler(req,res){try{const data=await build();res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=120');res.status(200).json(data)}catch(error){console.error('te-data fatal',error);res.setHeader('Cache-Control','no-store');res.status(503).json({error:'Tight end data unavailable.',detail:String(error?.message||error),version:VERSION})}}
module.exports.config={maxDuration:30};
