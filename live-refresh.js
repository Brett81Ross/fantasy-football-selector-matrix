(() => {
  'use strict';
  const VERSION='1.4.2';
  const POLL_MS=20000;
  const VERSION_KEY='ffm-app-version';
  let busy=false;

  try{
    const previous=localStorage.getItem(VERSION_KEY);
    if(previous!==VERSION){
      for(let i=localStorage.length-1;i>=0;i--){
        const key=localStorage.key(i);
        if(key&&key.startsWith('ffm-fast-data:'))localStorage.removeItem(key);
      }
      localStorage.setItem(VERSION_KEY,VERSION);
    }
  }catch(_){}

  function scoring(){
    try{return (typeof state!=='undefined'&&state.scoring)||document.getElementById('scoring')?.value||'ppr';}catch(_){return 'ppr';}
  }
  function status(text,error=false,season=''){
    const box=document.getElementById('dataStatus');if(!box)return;
    const dot=box.querySelector('.live-dot');const strong=box.querySelector('strong');
    if(dot){dot.classList.remove('loading','error');if(error)dot.classList.add('error');}
    if(strong)strong.textContent=text;
    const s=document.getElementById('dataSeason');if(s&&season)s.textContent=season;
  }
  async function refresh(){
    if(busy||document.hidden)return;busy=true;
    try{
      const r=await fetch(`/api/nfl-live?scoring=${encodeURIComponent(scoring())}&t=${Date.now()}`,{cache:'no-store'});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(data.detail||`HTTP ${r.status}`);
      if(!Array.isArray(data.players)||data.players.length<100)throw new Error('Player payload incomplete');
      if(typeof state!=='undefined'){
        const drafted=state.drafted;const compare=state.compare;
        state.players=data.players;
        state.dataMeta=data;
        if(drafted)state.drafted=drafted;if(compare)state.compare=compare;
        if(typeof renderAll==='function')renderAll();
      }
      const live=Number(data.liveGames||0);const teams=Number(data.health?.teamsLoaded||0);const fallback=!!data.source?.fallback;
      status(live?`LIVE NFL DATA · ${live} game${live===1?'':'s'} active`:fallback?'NFL DATA ONLINE · backup source active':'NFL DATA ONLINE · ESPN connected',false,`${data.currentSeason} · ${teams||32}/32 teams`);
      const note=document.getElementById('draftSourceNote');if(note)note.textContent=data.source?.note||'ESPN public NFL player engine online.';
      window.__FFM_LAST_LIVE_UPDATE__=data.generatedAt;
      window.__FFM_DATA_HEALTH__=data.health||{};
      window.__FFM_DATA_ERROR__='';
    }catch(e){
      const hasPlayers=typeof state!=='undefined'&&Array.isArray(state.players)&&state.players.length>0;
      status(hasPlayers?'NFL DATA DEGRADED · using last good update':'Football data unavailable',!hasPlayers);
      window.__FFM_DATA_ERROR__=String(e?.message||e);
    }finally{busy=false;}
  }
  async function checkForAppUpdate(){
    if(!('serviceWorker' in navigator))return;
    try{const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update();}catch(_){}
  }
  window.addEventListener('focus',()=>{checkForAppUpdate();refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkForAppUpdate();refresh();}});
  setTimeout(()=>{checkForAppUpdate();refresh();},500);
  setInterval(refresh,POLL_MS);

  document.querySelectorAll('.brand small').forEach(el=>{el.textContent=el.textContent.replace(/v\d+\.\d+\.\d+/,`v${VERSION}`);});
  const footer=document.querySelector('footer');if(footer)footer.innerHTML=footer.innerHTML.replace(/v\d+\.\d+\.\d+/,`v${VERSION}`);
})();
