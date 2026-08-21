const VERSION='1.4.4';
const TEAM_IDS=['1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','33','34'];
const TEAMS={1:'ATL',2:'BUF',3:'CHI',4:'CIN',5:'CLE',6:'DAL',7:'DEN',8:'DET',9:'GB',10:'TEN',11:'IND',12:'KC',13:'LV',14:'LAR',15:'MIA',16:'MIN',17:'NE',18:'NO',19:'NYG',20:'NYJ',21:'PHI',22:'ARI',23:'PIT',24:'LAC',25:'SF',26:'SEA',27:'TB',28:'WSH',29:'CAR',30:'JAX',33:'BAL',34:'HOU'};

const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
const num=v=>Number.isFinite(Number(v))?Number(v):0;

async function fetchJson(url,timeoutMs=9000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{signal:controller.signal,cache:'no-store',headers:{Accept:'application/json','User-Agent':`Fantasy-Football-Matrix/${VERSION}`}});
    if(!response.ok)throw new Error(`${response.status}`);
    return await response.json();
  }finally{clearTimeout(timer);}
}

function availability(status){
  const s=String(status?.name||status||'ACTIVE').toUpperCase();
  if(s.includes('ACTIVE')||s.includes('NORMAL'))return 96;
  if(s.includes('QUESTION'))return 82;
  if(s.includes('DOUBT'))return 58;
  if(s.includes('OUT')||s.includes('RESERVE')||s.includes('IR')||s.includes('PUP')||s.includes('SUSP'))return 28;
  return 76;
}

function metrics(depth,years,status){
  const base=[74,64,55,48,43,39][Math.min(depth,5)];
  const veteran=Math.min(5,Math.max(0,years))*0.8;
  const rookie=years===0;
  const avail=availability(status);
  const production=clamp(base+veteran-(depth>1?2:0));
  const opportunity=clamp(base+(depth===0?8:depth===1?4:-1));
  const consistency=clamp(base*.64+avail*.30+veteran);
  const ceiling=clamp(base+(rookie?10:6)+(depth===0?4:0));
  const trend=rookie?60:53;
  const tov=clamp(opportunity*.7+ceiling*.3);
  const mvi=clamp(100-(consistency*.62+avail*.38));
  return {production:Math.round(production),opportunity:Math.round(opportunity),consistency:Math.round(consistency),ceiling:Math.round(ceiling),trend:Math.round(trend),tov:Math.round(tov),mvi:Math.round(mvi),availability:Math.round(avail)};
}

function normalizeTeam(teamId,data){
  const team=TEAMS[teamId]||teamId;
  const out=[];
  let depth=0;
  for(const group of data?.athletes||[]){
    for(const athlete of group?.items||[]){
      const abbreviation=String(athlete?.position?.abbreviation||'').toUpperCase();
      const name=String(athlete?.position?.name||athlete?.position?.displayName||'').toLowerCase();
      if(abbreviation!=='TE'&&!name.includes('tight end'))continue;
      if(!athlete.id||!(athlete.fullName||athlete.displayName))continue;
      const years=num(athlete.experience?.years);
      const status=athlete.status?.name||athlete.status?.type||'Active';
      out.push({
        id:String(athlete.id),
        name:athlete.fullName||athlete.displayName,
        position:'TE',
        team,
        status,
        yearsExp:years,
        rookie:years===0,
        headshot:athlete.headshot?.href||`https://a.espncdn.com/i/headshots/nfl/players/full/${athlete.id}.png`,
        metrics:metrics(depth++,years,status)
      });
    }
  }
  return out;
}

module.exports=async function handler(req,res){
  try{
    const settled=await Promise.allSettled(TEAM_IDS.map(id=>fetchJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/roster`,10000).then(data=>normalizeTeam(id,data))));
    const players=[];
    let teamsLoaded=0;
    for(const result of settled){
      if(result.status==='fulfilled'){
        teamsLoaded++;
        players.push(...result.value);
      }
    }
    const unique=[...new Map(players.map(player=>[player.id,player])).values()];
    if(unique.length<20)throw new Error(`Only ${unique.length} tight ends loaded`);
    unique.sort((a,b)=>(b.metrics.production+b.metrics.opportunity+b.metrics.ceiling)-(a.metrics.production+a.metrics.opportunity+a.metrics.ceiling));
    res.setHeader('Cache-Control','s-maxage=30, stale-while-revalidate=60');
    res.status(200).json({version:VERSION,position:'TE',teamsLoaded,count:unique.length,players:unique});
  }catch(error){
    res.setHeader('Cache-Control','no-store');
    res.status(503).json({error:'Tight end data unavailable.',detail:String(error?.message||error),version:VERSION});
  }
};
module.exports.config={maxDuration:60};
