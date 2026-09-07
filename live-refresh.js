(() => {
  'use strict';
  const VERSION='1.5.5';
  const POLL_MS=20000;
  const VERSION_KEY='ffm-app-version';
  const LAST_GOOD_PREFIX='ffm-last-good:';
  const MAX_LAST_GOOD_AGE_MS=24*60*60*1000;
  let busy=false;

  function scoring(){try{return (typeof state!=='undefined'&&state.scoring)||'ppr'}catch(_){return'ppr'}}
  function lastGoodKey(){return `${LAST_GOOD_PREFIX}${VERSION}:${scoring()}`}
  function payloadUsable(data){return Array.isArray(data?.players)&&data.players.length>=40&&data.players.every(p=>p&&p.id&&p.name&&p.position)}
  function ageLabel(ms){const mins=Math.max(0,Math.round(ms/60000));if(mins<2)return'just now';if(mins<60)return`${mins}m ago`;const hrs=Math.round(mins/60);return`${hrs}h ago`}
  function status(text,error=false,season=''){
    const box=document.getElementById('dataStatus');if(!box)return;
    const dot=box.querySelector('.live-dot');const strong=box.querySelector('strong');
    if(dot){dot.classList.remove('loading','error');if(error)dot.classList.add('error')}
    if(strong)strong.textContent=text;
    const s=document.getElementById('dataSeason');if(s&&season)s.textContent=season;
  }
  function applyPayload(data){
    if(typeof state==='undefined'||!payloadUsable(data))return false;
    const drafted=state.drafted,compare=state.compare;
    state.players=data.players;state.dataMeta=data;
    if(drafted)state.drafted=drafted;if(compare)state.compare=compare;
    if(typeof renderAll==='function')renderAll();
    return true;
  }
  function saveLastGood(data){
    if(!payloadUsable(data))return;
    try{localStorage.setItem(lastGoodKey(),JSON.stringify({savedAt:Date.now(),data}))}catch(_){}
  }
  function restoreLastGood(showStatus=true){
    try{
      const raw=localStorage.getItem(lastGoodKey());if(!raw)return false;
      const saved=JSON.parse(raw),age=Date.now()-Number(saved?.savedAt||0);
      if(!saved?.savedAt||age<0||age>MAX_LAST_GOOD_AGE_MS||!payloadUsable(saved.data)){localStorage.removeItem(lastGoodKey());return false}
      if(!applyPayload(saved.data))return false;
      if(showStatus)status(`NFL DATA STALE · last good update ${ageLabel(age)}`,false,`${saved.data.currentSeason||''} · cached backup`);
      const note=document.getElementById('draftSourceNote');if(note)note.textContent='Live NFL refresh is temporarily unavailable. Showing the most recent validated player data saved on this device.';
      window.__FFM_LAST_LIVE_UPDATE__=saved.data.generatedAt||'';window.__FFM_DATA_HEALTH__={...(saved.data.health||{}),stale:true,lastGoodAgeMs:age};
      return true;
    }catch(_){return false}
  }

  try{
    const previous=localStorage.getItem(VERSION_KEY);
    if(previous!==VERSION){
      for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(key&&key.startsWith('ffm-fast-data:'))localStorage.removeItem(key)}
      localStorage.removeItem('ffm-te-data-v1.4.4');
      localStorage.setItem(VERSION_KEY,VERSION);
    }
  }catch(_){}

  async function refresh(){
    if(busy||document.hidden)return;busy=true;
    try{
      const r=await fetch(`/api/nfl-live?scoring=${encodeURIComponent(scoring())}&t=${Date.now()}`,{cache:'no-store'});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(data.detail||`HTTP ${r.status}`);
      if(!payloadUsable(data))throw new Error('Player payload incomplete');
      applyPayload(data);saveLastGood(data);
      const live=Number(data.liveGames||0),teams=Number(data.health?.teamsLoaded||0),partial=teams<32;
      const degraded=data.health?.performanceFeed==='degraded'||data.health?.liveFeed==='degraded'||Boolean(data.source?.fallback);
      status(live?`LIVE NFL DATA · ${live} game${live===1?'':'s'} active`:degraded?'NFL DATA DEGRADED · validated fallback active':partial?`NFL DATA DEGRADED · ${teams}/32 teams loaded`:'NFL DATA LIVE · sources connected',false,`${data.currentSeason} · ${teams}/32 teams`);
      const note=document.getElementById('draftSourceNote');if(note)note.textContent=data.source?.note||'Current NFL roster and live scoreboard data online.';
      window.__FFM_LAST_LIVE_UPDATE__=data.generatedAt;window.__FFM_DATA_HEALTH__={...(data.health||{}),stale:false};window.__FFM_DATA_ERROR__='';
    }catch(e){
      const hasPlayers=typeof state!=='undefined'&&Array.isArray(state.players)&&state.players.length>0;
      const restored=hasPlayers?false:restoreLastGood(true);
      if(!restored&&hasPlayers)status('NFL DATA DEGRADED · using current loaded board',false);
      if(!restored&&!hasPlayers)status('Football data unavailable',true);
      window.__FFM_DATA_ERROR__=String(e?.message||e);
    }finally{busy=false}
  }
  async function checkForAppUpdate(){if(!('serviceWorker'in navigator))return;try{const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update()}catch(_){}}

  restoreLastGood(true);
  window.addEventListener('focus',()=>{checkForAppUpdate();refresh()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkForAppUpdate();refresh()}});
  setTimeout(()=>{checkForAppUpdate();refresh()},250);
  setInterval(refresh,POLL_MS);
  document.querySelectorAll('.brand small').forEach(el=>el.textContent=el.textContent.replace(/v\d+\.\d+\.\d+/,`v${VERSION}`));
  const footer=document.querySelector('footer');if(footer)footer.innerHTML=footer.innerHTML.replace(/v\d+\.\d+\.\d+/,`v${VERSION}`);
})();
