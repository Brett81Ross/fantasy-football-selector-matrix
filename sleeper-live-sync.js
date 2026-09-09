(() => {
  'use strict';

  const USERNAME_KEY='ffm-sleeper-username';
  const LEAGUE_KEY='ffm-sleeper-league';
  const DRAFT_KEY='ffm-sleeper-draft';
  const BASE_POLL_MS=5000;
  const IDLE_POLL_MS=15000;
  const SEASON_POLL_MS=300000;

  let provider=null;
  let session=null;
  let seasonSession=null;
  let pollTimer=null;
  let currentDraftId='';
  let currentLeagueId='';
  let currentLeagues=[];
  let busy=false;

  function safeGet(key){try{return localStorage.getItem(key)||''}catch(_){return''}}
  function safeSet(key,value){try{if(value)localStorage.setItem(key,value);else localStorage.removeItem(key)}catch(_){}}
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

  function dependenciesReady(){
    return typeof state!=='undefined'&&Array.isArray(state.players)&&state.players.length>0&&
      window.FFMSleeperDraftProvider?.createSleeperDraftProvider&&
      window.FFMDraftReliability?.recordSuccess&&
      window.FFMProviderSession?.createProviderSession&&
      window.FFMSeasonProviderSession?.createSeasonProviderSession;
  }

  function statusEl(){return document.getElementById('sleeperSyncStatus')}
  function setStatus(text,tone=''){const el=statusEl();if(!el)return;el.textContent=text;el.dataset.tone=tone}

  function publish(next){
    window.ffmCanonicalDraftState=next;
    window.dispatchEvent(new CustomEvent('ffm:draft-state',{detail:next}));
    const status=String(next?.sync?.status||'').toUpperCase();
    setStatus(status?`Sleeper · ${status}`:'Sleeper connected',status.toLowerCase());
  }

  function publishSeason(next){
    window.ffmLeagueSnapshot=next;
    window.dispatchEvent(new CustomEvent('ffm:league-snapshot',{detail:next}));
  }

  function pollDelay(result){
    if(!result?.ok)return Math.max(BASE_POLL_MS,Number(result?.retryAfterMs||BASE_POLL_MS));
    const draftStatus=result.state?.status;
    if(draftStatus==='completed')return SEASON_POLL_MS;
    if(draftStatus==='live')return BASE_POLL_MS;
    return IDLE_POLL_MS;
  }

  function clearTimer(){if(pollTimer){clearTimeout(pollTimer);pollTimer=null}}

  function schedule(delay){
    clearTimer();
    if(!delay||!currentDraftId)return;
    pollTimer=setTimeout(refresh,delay);
  }

  async function refreshSeason(){
    if(!seasonSession||!currentLeagueId)return null;
    const result=await seasonSession.refresh(currentLeagueId);
    if(!result.ok)setStatus('Sleeper · SEASON DATA STALE · retrying','warn');
    return result;
  }

  async function refresh(){
    if(!session||!currentDraftId||busy)return;
    if(document.hidden){schedule(IDLE_POLL_MS);return}
    busy=true;
    try{
      const result=await session.refresh(currentDraftId);
      if(result?.state?.status==='completed'&&currentLeagueId){
        try{await refreshSeason()}catch(error){setStatus(`Sleeper season sync error · ${String(error?.message||error)}`,'warn')}
      }
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
    seasonSession=window.FFMSeasonProviderSession.createSeasonProviderSession({provider,onState:publishSeason});
  }

  function leagueById(leagueId){
    return currentLeagues.find(item=>item.leagueId===String(leagueId||''))||null;
  }

  async function startDraft(draftId,leagueId=''){
    currentDraftId=String(draftId||'').trim();
    currentLeagueId=String(leagueId||'').trim();
    if(!currentDraftId)throw new Error('This Sleeper league has no draft to sync.');
    safeSet(DRAFT_KEY,currentDraftId);
    safeSet(LEAGUE_KEY,currentLeagueId);
    createSession();
    const chosen=leagueById(currentLeagueId);
    setStatus(`Sleeper · syncing ${chosen?.name||'league'}…`);
    await refresh();
    if(window.ffmLeagueSnapshot){
      setStatus(`Sleeper · ${chosen?.name||'league'} synced`,'fresh');
    }
  }

  function renderLeagueOptions(leagues){
    const select=document.getElementById('sleeperLeague');
    const use=document.getElementById('sleeperUseLeague');
    if(!select||!use)return;
    const saved=safeGet(LEAGUE_KEY);
    const savedExists=saved&&leagues.some(item=>item.leagueId===saved);
    const placeholder=leagues.length>1&&!savedExists?'<option value="">Choose Sleeper league…</option>':'';
    select.innerHTML=placeholder+leagues.map(item=>`<option value="${esc(item.leagueId)}" data-draft="${esc(item.draftId)}">${esc(item.name||item.leagueId)} · ${esc(item.teams)} teams</option>`).join('');
    select.hidden=leagues.length===0;
    use.hidden=leagues.length===0;
    if(savedExists)select.value=saved;
    else if(leagues.length===1)select.value=leagues[0].leagueId;
    else select.value='';
  }

  async function useSelectedLeague(){
    const select=document.getElementById('sleeperLeague');
    const chosen=leagueById(select?.value);
    if(!chosen){setStatus('Sleeper account connected · choose a league to start syncing','warn');return false}
    await startDraft(chosen.draftId,chosen.leagueId);
    return true;
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

    if(autoStart){
      const savedDraft=safeGet(DRAFT_KEY);
      const savedLeague=safeGet(LEAGUE_KEY);
      const selected=currentLeagues.find(item=>item.draftId===savedDraft)||currentLeagues.find(item=>item.leagueId===savedLeague)||(currentLeagues.length===1?currentLeagues[0]:null);
      if(selected){
        const select=document.getElementById('sleeperLeague');
        if(select)select.value=selected.leagueId;
        await startDraft(selected.draftId,selected.leagueId);
        return;
      }
    }

    setStatus(`Sleeper account connected · ${currentLeagues.length} leagues found · choose one to sync`,'warn');
  }

  function useManual(){
    clearTimer();
    currentDraftId='';
    currentLeagueId='';
    if(session)session.enterManual();
    window.ffmCanonicalDraftState=null;
    window.ffmLeagueSnapshot=null;
    window.dispatchEvent(new CustomEvent('ffm:draft-state',{detail:null}));
    window.dispatchEvent(new CustomEvent('ffm:league-snapshot',{detail:null}));
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
    </style><h4>Sleeper League Sync</h4><p>Connect your Sleeper username and choose a league. The Matrix tracks the draft live, then keeps roster ownership, free agents, matchups, and player status refreshed during the season.</p><div class="sleeper-sync-row"><input id="sleeperUsername" autocomplete="username" placeholder="Sleeper username" /><button id="sleeperConnect" type="button">Connect Sleeper</button></div><div class="sleeper-sync-row" style="margin-top:7px"><select id="sleeperLeague" hidden></select><button id="sleeperUseLeague" type="button" hidden>Use League</button></div><span id="sleeperSyncStatus">Not connected</span><button class="sleeper-manual" id="sleeperManual" type="button">Use Manual Draft</button>`;
    if(actions)sheet.insertBefore(block,actions);else sheet.appendChild(block);
    document.getElementById('sleeperUsername').value=safeGet(USERNAME_KEY);

    document.getElementById('sleeperConnect').addEventListener('click',async()=>{
      try{await connectSleeper({autoStart:true})}catch(error){setStatus(String(error?.message||error),'error')}
    });
    document.getElementById('sleeperUseLeague').addEventListener('click',async()=>{
      try{await useSelectedLeague()}catch(error){setStatus(String(error?.message||error),'error')}
    });
    document.getElementById('sleeperLeague').addEventListener('change',async()=>{
      if(!document.getElementById('sleeperLeague')?.value)return;
      try{await useSelectedLeague()}catch(error){setStatus(String(error?.message||error),'error')}
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
    window.FFMSleeperLiveSync=Object.freeze({connect:connectSleeper,refresh,useManual,getState:()=>session?.getState?.()||null,getSeasonState:()=>seasonSession?.getState?.()||null});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();