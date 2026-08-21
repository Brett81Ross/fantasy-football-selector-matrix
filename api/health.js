const VERSION='1.4.3';

async function probe(name,url,timeoutMs=6000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  const started=Date.now();
  try{
    const response=await fetch(url,{signal:controller.signal,cache:'no-store',headers:{Accept:'application/json','User-Agent':`Fantasy-Football-Matrix/${VERSION}`}});
    const ms=Date.now()-started;
    if(!response.ok)return {name,ok:false,status:response.status,ms};
    const data=await response.json();
    return {name,ok:true,status:response.status,ms,data};
  }catch(error){
    return {name,ok:false,status:0,ms:Date.now()-started,error:String(error?.message||error)};
  }finally{clearTimeout(timer);}
}

module.exports=async function handler(req,res){
  const [scoreboard,roster]=await Promise.all([
    probe('espn-scoreboard','https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=5'),
    probe('espn-roster','https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/12/roster')
  ]);
  const games=Array.isArray(scoreboard.data?.events)?scoreboard.data.events.length:null;
  const rosterGroups=Array.isArray(roster.data?.athletes)?roster.data.athletes.length:null;
  const ok=scoreboard.ok&&roster.ok;
  res.setHeader('Cache-Control','no-store');
  res.status(ok?200:503).json({
    app:'Fantasy Football Matrix',version:VERSION,status:ok?'ok':'degraded',checkedAt:new Date().toISOString(),
    espn:{
      scoreboard:{ok:scoreboard.ok,http:scoreboard.status,ms:scoreboard.ms,games,error:scoreboard.error||null},
      roster:{ok:roster.ok,http:roster.status,ms:roster.ms,groups:rosterGroups,error:roster.error||null}
    }
  });
};
module.exports.config={maxDuration:20};
