(() => {
  'use strict';
  const VERSION='1.4.0';
  const POLL_MS=30000;
  let busy=false;

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
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const data=await r.json();
      if(!Array.isArray(data.players)||data.players.length<50)throw new Error('Player payload incomplete');
      if(typeof state!=='undefined'){
        const drafted=state.drafted;const compare=state.compare;
        state.players=data.players;
        if(drafted)state.drafted=drafted;if(compare)state.compare=compare;
        if(typeof renderAll==='function')renderAll();
      }
      const live=Number(data.liveGames||0);
      status(live?`LIVE NFL DATA · ${live} game${live===1?'':'s'} active`:'NFL DATA ONLINE · awaiting live games',false,`${data.currentSeason} · ${data.source?.name||'ESPN'}`);
      const note=document.getElementById('draftSourceNote');if(note)note.textContent=data.source?.note||'ESPN player engine online.';
      window.__FFM_LAST_LIVE_UPDATE__=data.generatedAt;
    }catch(e){
      const hasPlayers=typeof state!=='undefined'&&Array.isArray(state.players)&&state.players.length>0;
      status(hasPlayers?'NFL DATA DEGRADED · using last good update':'Football data unavailable',!hasPlayers);
    }finally{busy=false;}
  }
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  setTimeout(refresh,1200);
  setInterval(refresh,POLL_MS);

  document.querySelectorAll('.brand small').forEach(el=>{el.textContent=el.textContent.replace(/v\d+\.\d+\.\d+/,`v${VERSION}`);});
  const footer=document.querySelector('footer');if(footer)footer.innerHTML=footer.innerHTML.replace(/v\d+\.\d+\.\d+/,`v${VERSION}`);
})();
