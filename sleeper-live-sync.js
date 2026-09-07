(() => {
  'use strict';

  const USERNAME_KEY='ffm-sleeper-username';
  const LEAGUE_KEY='ffm-sleeper-league';
  const DRAFT_KEY='ffm-sleeper-draft';
  const BASE_POLL_MS=5000;
  const IDLE_POLL_MS=15000;

  let provider=null;
  let session=null;
  let pollTimer=null;
  let currentDraftId='';
  let currentLeagues=[];
  let busy=false;

  function safeGet(key){try{return localStorage.getItem(key)||''}catch(_){return''}}
  function safeSet(key,value){try{if(value)localStorage.setItem(key,value);else localStorage.removeItem(key)}catch(_){}}
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  function dependenciesReady(){
    return typeof state!=='undefined'&&Array.isArray(state.players)&&state.players.length>0&&
      window.FFMSleeperDraftProvider?.createSleeperDraftProvider&&
      window.FFMDraftReliability?.recordSuccess&&
      window.FFMProviderSession?.createProviderSession;
  }

  function statusEl(){return document.getElementById('sleeperSyncStatus')}
  function setStatus(text,tone=''){const el=statusEl();if(!el)return;el.textContent=text;el.dataset.tone=tone}

  function publish(next){
    window.ffmCanonicalDraftState=next;
    window.dispatchEvent(new CustomEvent('ffm:draft-state',{detail:next}));
    const status=String(next?.sync?.status||'').toUpperCase();
    setStatus(status?`Sleeper · ${status}`:'Sleeper connected',status.toLowerCase());
  }

  function pollDelay(result){
    if(!result?.ok)return Math.max(BASE_POLL_MS,Number(result?.retryAfterMs||BASE_POLL_MS));
    const draftStatus=result.state?.status;
    if(draftStatus==='completed')return 0;
    if(draftStatus==='live')return BASE_POLL_MS;
    return IDLE_POLL_MS;
  }

  function clearTimer(){if(pollTimer){clearTimeout(pollTimer);pollTimer=null}}

  function schedule(delay){
    clearTimer();
    if(!delay||!currentDraftId)return;
    pollTimer=setTimeout(refresh,delay);
  }

  async function refresh(){
    if(!session||!currentDraftId||busy)return;
    if(document.hidden){schedule(IDLE_POLL_MS);return}
    busy=true;
    try{
      const result=await session.refresh(currentDraftId);
      const delay=pollDelay(result);
      if(!result.ok)setStatus(`Sleeper · ${String(result.state?.sync?.status||'stale').toUpperCase()} · retrying`,'warn');
      schedule(delay);
    }catch(error){
      setStatus(`Sleeper error · ${String(error?.message||error)}`,'error');
      schedule(IDLE_POLL_MS);
    }finally{busy=false}
  }

  function createSession(){
    session=window.FFMProviderSession.createProviderSession({
      provider,
      reliability:window.FFMDraftReliability,
      onState:publish
    });
  }

  async function startDraft(draftId,leagueId=''){
    currentDraftId=String(draftId||'').trim();
    if(!currentDraftId)throw new Error('This Sleeper league has no draft to sync.');
    safeSet(DRAFT_KEY,currentDraftId);
    safeSet(LEAGUE_KEY,leagueId);
    createSession();
    setStatus('Sleeper · syncing…');
    await refresh();
  }

  function renderLeagueOptions(leagues){
    const select=document.getElementById('sleeperLeague');
    const use=document.getElementById('sleeperUseLeague');
    if(!select||!use)return;
    select.innerHTML=leagues.map(item=>`<option value="${esc(item.leagueId)}" data-draft="${esc(item.draftId)}">${esc(item.name||item.leagueId)} · ${esc(item.teams)} teams</option>`).join('');
    select.hidden=leagues.length===0;
    use.hidden=leagues.length===0;
    const saved=safeGet(LEAGUE_KEY);
    if(saved&&leagues.some(item=>item.leagueId===saved))select.value=saved;
  }

  async function connectSleeper({username,autoStart=true}={}){
    const input=String(username||document.getElementById('sleeperUsername')?.value||'').trim();
    if(!input)throw new Error('Enter your Sleeper username.');
    setStatus('Connecting to Sleeper…');
    provider=window.FFMSleeperDraftProvider.createSleeperDraftProvider();
    await provider.connect({username:input,season:new Date().getUTCFullYear(),playerPool:state.players});
    currentLeagues=await provider.listLeagues();
    safeSet(USERNAME_KEY,input);
    renderLeagueOptions(currentLeagues);
    if(!currentLeagues.length){setStatus('No Sleeper NFL leagues found for this season.','warn');return}
    setStatus(`${currentLeagues.length} Sleeper league${currentLeagues.length===1?'':'s'} found`);

    if(autoStart){
      const savedDraft=safeGet(DRAFT_KEY);
      const savedLeague=safeGet(LEAGUE_KEY);
      const selected=currentLeagues.find(item=>item.draftId===savedDraft)||currentLeagues.find(item=>item.leagueId===savedLeague)||(currentLeagues.length===1?currentLeagues[0]:null);
      if(selected)await startDraft(selected.draftId,selected.leagueId);
    }
  }

  function useManual(){
    clearTimer();
    currentDraftId='';
    if(session)session.enterManual();
    window.ffmCanonicalDraftState=null;
    window.dispatchEvent(new CustomEvent('ffm:draft-state',{detail:null}));
    safeSet(DRAFT_KEY,'');
    safeSet(LEAGUE_KEY,'');
    setStatus('Manual Draft mode','manual');
  }

  function mountControls(){
    if(document.getElementById('sleeperSyncSettings'))return;
    const sheet=document.querySelector('#settingsModal .sheet');
    if(!sheet)return;
    const actions=sheet.querySelector('.sheet-actions');
    const block=document.createElement('div');
    block.id='sleeperSyncSettings';
    block.className='sleeper-sync-settings';
    block.innerHTML=`<style>
      .sleeper-sync-settings{border-top:1px solid var(--line);margin-top:16px;padding-top:14px}.sleeper-sync-settings h4{margin:0 0 4px;font-size:13px}.sleeper-sync-settings p{margin:0 0 9px!important;color:var(--muted);font-size:10px;line-height:1.4}.sleeper-sync-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}.sleeper-sync-row input,.sleeper-sync-row select{min-width:0}.sleeper-sync-row button,.sleeper-manual{min-height:42px;border-radius:11px;border:1px solid var(--line);background:#102017;color:var(--text);font-weight:900}.sleeper-sync-row button{background:var(--accent);color:#05130a;border-color:var(--accent)}#sleeperSyncStatus{display:block;margin-top:7px;font-size:9px;font-weight:900;color:var(--accent)}#sleeperSyncStatus[data-tone="warn"],#sleeperSyncStatus[data-tone="error"]{color:var(--warn)}.sleeper-manual{width:100%;margin-top:7px}
    </style><h4>Sleeper Live Draft</h4><p>Connect your Sleeper username and choose a league. The Matrix will track drafted players and your roster automatically while the draft is active.</p><div class="sleeper-sync-row"><input id="sleeperUsername" autocomplete="username" placeholder="Sleeper username" /><button id="sleeperConnect" type="button">Connect Sleeper</button></div><div class="sleeper-sync-row" style="margin-top:7px"><select id="sleeperLeague" hidden></select><button id="sleeperUseLeague" type="button" hidden>Use League</button></div><span id="sleeperSyncStatus">Not connected</span><button class="sleeper-manual" id="sleeperManual" type="button">Use Manual Draft</button>`;
    if(actions)sheet.insertBefore(block,actions);else sheet.appendChild(block);
    document.getElementById('sleeperUsername').value=safeGet(USERNAME_KEY);

    document.getElementById('sleeperConnect').addEventListener('click',async()=>{
      try{await connectSleeper({autoStart:true})}catch(error){setStatus(String(error?.message||error),'error')}
    });
    document.getElementById('sleeperUseLeague').addEventListener('click',async()=>{
      const select=document.getElementById('sleeperLeague');
      const chosen=currentLeagues.find(item=>item.leagueId===select?.value);
      if(!chosen)return;
      try{await startDraft(chosen.draftId,chosen.leagueId)}catch(error){setStatus(String(error?.message||error),'error')}
    });
    document.getElementById('sleeperManual').addEventListener('click',useManual);
  }

  async function restore(){
    const username=safeGet(USERNAME_KEY);
    if(!username)return;
    try{await connectSleeper({username,autoStart:true})}catch(error){setStatus(`Saved Sleeper connection needs attention · ${String(error?.message||error)}`,'warn')}
  }

  function init(){
    if(!dependenciesReady())return setTimeout(init,100);
    mountControls();
    restore();
    window.addEventListener('focus',()=>{if(session&&currentDraftId)refresh()});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session&&currentDraftId)refresh()});
    window.FFMSleeperLiveSync=Object.freeze({connect:connectSleeper,refresh,useManual,getState:()=>session?.getState?.()||null});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();