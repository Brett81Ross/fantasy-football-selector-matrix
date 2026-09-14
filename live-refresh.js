(() => {
  'use strict';
  const VERSION=String(window.__FFM_VERSION__||document.documentElement.dataset.ffmVersion||'runtime');
  const POLL_MS=20000;
  const VERSION_KEY='ffm-app-version';
  const LAST_GOOD_PREFIX='ffm-last-good:';
  const MAX_LAST_GOOD_AGE_MS=24*60*60*1000;
  const STARTUP_RETRY_MS=100;
  const STARTUP_TIMEOUT_MS=10000;
  let busy=false;

  function scoring(){try{return (typeof state!=='undefined'&&state.scoring)||'ppr'}catch(_){return'ppr'}}
  function appReady(){try{return typeof state!=='undefined'&&Array.isArray(state.players)&&typeof renderAll==='function'}catch(_){return false}}
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
  function publishKickoffContext(data,sourceHealth='LIVE'){
    const kickoffsByTeam={};
    const gameSchedule=Array.isArray(data?.gameSchedule)?data.gameSchedule:[];
    for(const game of gameSchedule){
      if(!game?.kickoffAt||!Number.isFinite(Date.parse(game.kickoffAt)))continue;
      for(const rawTeam of Array.isArray(game?.teams)?game.teams:[]){
        const team=String(rawTeam||'').trim().toUpperCase();
        if(team)kickoffsByTeam[team]=new Date(game.kickoffAt).toISOString();
      }
    }
    window.__FFM_KICKOFF_CONTEXT__={kickoffsByTeam,gameSchedule,sourceHealth,generatedAt:data?.generatedAt||null};
    window.dispatchEvent(new CustomEvent('ffm:kickoff-context',{detail:window.__FFM_KICKOFF_CONTEXT__}));
  }
  function requiredSourceHealth(data){return (data?.health?.scheduleFeed==='degraded'||data?.source?.scheduleError)?'DEGRADED':'LIVE'}
  function scoreValue(value){return value===null||value===undefined||value===''?'—':String(value)}
  function kickoffLabel(value){const stamp=Date.parse(value);return Number.isFinite(stamp)?new Date(stamp).toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'}):'Scheduled'}
  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
  function renderScoreboard(data){
    const app=document.querySelector('.app');if(!app)return;
    let panel=document.getElementById('ffmLiveScoreboard');
    if(!panel){
      panel=document.createElement('section');panel.id='ffmLiveScoreboard';panel.setAttribute('aria-live','polite');
      panel.style.cssText='margin:0 0 14px;padding:14px;border:1px solid rgba(57,255,20,.26);border-radius:16px;background:linear-gradient(145deg,rgba(13,24,18,.98),rgba(7,16,12,.98));box-shadow:0 12px 30px rgba(0,0,0,.2)';
      const anchor=document.getElementById('dataStatus');
      const block=anchor?.closest('.card')||anchor?.parentElement;
      if(block?.parentNode)block.insertAdjacentElement('afterend',panel);else app.prepend(panel);
    }
    const live=Array.isArray(data?.liveEvents)?data.liveEvents.filter(game=>game?.state==='in'):[];
    const scheduled=Array.isArray(data?.gameSchedule)?data.gameSchedule:[];
    const completed=scheduled.filter(game=>game?.state==='post'&&(game?.scores?.away!=null||game?.scores?.home!=null));
    const upcoming=scheduled.filter(game=>game?.state==='pre');
    const games=(live.length?live:completed.length?completed:upcoming).slice(0,8);
    const degraded=data?.health?.liveFeed==='degraded'||Boolean(data?.source?.liveError);
    const mode=live.length?`${live.length} LIVE`:completed.length?'FINAL SCORES':degraded?'LIVE SCORES UNAVAILABLE':'UPCOMING';
    const rows=games.map(game=>{
      const teams=Array.isArray(game?.teams)?game.teams:['AWAY','HOME'];
      const hasScore=game?.scores&&(game.scores.away!=null||game.scores.home!=null);
      const detail=hasScore?`<strong style="font-variant-numeric:tabular-nums">${escapeHtml(scoreValue(game.scores.away))} – ${escapeHtml(scoreValue(game.scores.home))}</strong>`:`<span style="color:#93a59a">${escapeHtml(kickoffLabel(game?.kickoffAt))}</span>`;
      return `<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 0;border-top:1px solid rgba(147,165,154,.14)"><span style="font-weight:800">${escapeHtml(teams[0]||'AWAY')} <span style="color:#93a59a;font-weight:600">at</span> ${escapeHtml(teams[1]||'HOME')}<small style="display:block;color:#93a59a;margin-top:3px">${escapeHtml(game?.status||'')}</small></span>${detail}</div>`;
    }).join('');
    panel.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><strong>NFL SCOREBOARD · WEEK ${escapeHtml(data?.currentWeek||'—')}</strong><span style="font-size:11px;font-weight:900;color:${live.length?'#39ff14':'#9cff35'}">${escapeHtml(mode)}</span></div>${rows||'<p style="margin:10px 0 0;color:#93a59a">No games are listed for the selected week.</p>'}`;
  }
  function applyPayload(data,sourceHealth){
    if(!appReady()||!payloadUsable(data))return false;
    const drafted=state.drafted,compare=state.compare;
    state.players=data.players;state.dataMeta=data;
    if(drafted)state.drafted=drafted;if(compare)state.compare=compare;
    const health=sourceHealth||requiredSourceHealth(data);
    publishKickoffContext(data,health);
    renderAll();
    renderScoreboard(data);
    return true;
  }
  function saveLastGood(data){
    if(!payloadUsable(data))return;
    try{localStorage.setItem(lastGoodKey(),JSON.stringify({savedAt:Date.now(),data}))}catch(_){}
  }
  function restoreLastGood(showStatus=true){
    if(!appReady())return false;
    try{
      const raw=localStorage.getItem(lastGoodKey());if(!raw)return false;
      const saved=JSON.parse(raw),age=Date.now()-Number(saved?.savedAt||0);
      if(!saved?.savedAt||age<0||age>MAX_LAST_GOOD_AGE_MS||!payloadUsable(saved.data)){localStorage.removeItem(lastGoodKey());return false}
      if(!applyPayload(saved.data,'STALE'))return false;
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
    if(busy||document.hidden||!appReady())return false;busy=true;
    try{
      const r=await fetch(`/api/nfl-live?scoring=${encodeURIComponent(scoring())}&t=${Date.now()}`,{cache:'no-store'});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(data.detail||`HTTP ${r.status}`);
      if(!payloadUsable(data))throw new Error('Player payload incomplete');
      const sourceHealth=requiredSourceHealth(data);
      if(!applyPayload(data,sourceHealth))throw new Error('App not ready to apply player payload');
      saveLastGood(data);
      const live=Number(data.liveGames||0),teams=Number(data.health?.teamsLoaded||0),partial=teams<32;
      const draftDegraded=data.health?.performanceFeed==='degraded'||Boolean(data.source?.fallback)||partial;
      const timingDegraded=data.health?.scheduleFeed==='degraded'||Boolean(data.source?.scheduleError);
      const scoreboardDegraded=data.health?.liveFeed==='degraded'||Boolean(data.source?.liveError);
      const baseline=data.statsSeason?`${data.statsSeason} performance baseline`:'role-based baseline';
      const headline=draftDegraded?'NFL DRAFT DATA DEGRADED · validated fallback active':timingDegraded?'NFL TIMING DATA DEGRADED · kickoff schedule unavailable':`NFL DRAFT DATA LIVE · ${baseline}`;
      status(headline,false,`${data.currentSeason} roster · ${teams}/32 teams`);
      const note=document.getElementById('draftSourceNote');
      if(note){
        if(draftDegraded)note.textContent=data.source?.note||'Validated fallback player data active.';
        else if(timingDegraded)note.textContent='Player data is current, but nflverse kickoff timing is temporarily unavailable. Lock-time recommendations are degraded rather than guessed.';
        else note.textContent=`Current ${data.rosterSeason||data.currentSeason} NFL roster with ${baseline}. nflverse kickoff timing is active.${scoreboardDegraded?' Optional ESPN live-score enrichment is unavailable; rankings and kickoff timing are unaffected.':live?` ${live} live game${live===1?'':'s'} active.`:''}`;
      }
      window.__FFM_LAST_LIVE_UPDATE__=data.generatedAt;window.__FFM_DATA_HEALTH__={...(data.health||{}),draftData:draftDegraded?'degraded':'live',timing:timingDegraded?'degraded':'live',scoreboard:scoreboardDegraded?'optional-unavailable':'live',stale:false};window.__FFM_DATA_ERROR__='';
      return true;
    }catch(e){
      const hasPlayers=appReady()&&state.players.length>0;
      const restored=hasPlayers?false:restoreLastGood(true);
      if(!restored&&hasPlayers)status('NFL DRAFT DATA DEGRADED · using current loaded board',false);
      if(!restored&&!hasPlayers)status('Football data unavailable',true);
      window.__FFM_DATA_ERROR__=String(e?.message||e);
      return false;
    }finally{busy=false}
  }
  async function checkForAppUpdate(){if(!('serviceWorker'in navigator))return;try{const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.update()}catch(_){}}
  function startWhenReady(){
    const started=Date.now();
    const attempt=async()=>{
      if(appReady()){
        restoreLastGood(true);
        await checkForAppUpdate();
        await refresh();
        return;
      }
      if(Date.now()-started<STARTUP_TIMEOUT_MS)return setTimeout(attempt,STARTUP_RETRY_MS);
      status('Football data initializing…',false);
      setTimeout(startWhenReady,STARTUP_RETRY_MS);
    };
    attempt();
  }

  window.addEventListener('focus',()=>{checkForAppUpdate();refresh()});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkForAppUpdate();refresh()}});
  startWhenReady();
  setInterval(refresh,POLL_MS);
  document.querySelectorAll('.brand small').forEach(el=>el.textContent=el.textContent.replace(/v\d+\.\d+\.\d+/,`v${VERSION}`));
  const footer=document.querySelector('footer');if(footer)footer.innerHTML=footer.innerHTML.replace(/v\d+\.\d+\.\d+/,`v${VERSION}`);
})();
