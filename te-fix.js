(() => {
  'use strict';

  const VERSION='1.4.4';
  const TE_CACHE_KEY='ffm-te-data-v1.4.4';
  const TE_CACHE_MS=5*60*1000;
  let loading=false;

  function canonicalPosition(value){
    const raw=String(value||'').trim().toUpperCase();
    if(raw==='TE'||raw==='TIGHT END')return 'TE';
    if(raw==='QB'||raw==='QUARTERBACK')return 'QB';
    if(raw==='RB'||raw==='RUNNING BACK'||raw==='FB'||raw==='FULLBACK')return 'RB';
    if(raw==='WR'||raw==='WIDE RECEIVER')return 'WR';
    return raw;
  }

  function normalizePlayers(players){
    for(const player of players||[])player.position=canonicalPosition(player.position);
    return players||[];
  }

  function teCount(){
    if(typeof state==='undefined'||!Array.isArray(state.players))return 0;
    return state.players.filter(player=>canonicalPosition(player.position)==='TE').length;
  }

  function mergeTightEnds(players){
    if(typeof state==='undefined'||!Array.isArray(state.players))return;
    const current=normalizePlayers(state.players);
    const map=new Map(current.map(player=>[String(player.id),player]));
    for(const player of normalizePlayers(players))map.set(String(player.id),player);
    state.players=[...map.values()];
    if(typeof renderAll==='function')renderAll();
  }

  async function loadTightEnds(force=false){
    if(loading)return;
    if(!force&&teCount()>=20)return;
    loading=true;
    try{
      if(!force){
        try{
          const cached=JSON.parse(localStorage.getItem(TE_CACHE_KEY)||'null');
          if(cached?.players&&Date.now()-cached.savedAt<TE_CACHE_MS){
            mergeTightEnds(cached.players);
            if(teCount()>=20)return;
          }
        }catch(_){}
      }

      const response=await fetch(`/api/te-data?t=${Date.now()}`,{cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!Array.isArray(data.players)||data.players.length<20)throw new Error(data.detail||'Incomplete TE payload');
      mergeTightEnds(data.players);
      try{localStorage.setItem(TE_CACHE_KEY,JSON.stringify({savedAt:Date.now(),players:data.players}));}catch(_){}
    }catch(error){
      console.error('TE data repair failed',error);
    }finally{
      loading=false;
    }
  }

  function clearSearch(){
    const search=document.getElementById('draftSearch');
    if(search&&search.value){
      search.value='';
      search.dispatchEvent(new Event('input',{bubbles:true}));
    }
  }

  function patchBoardFilter(){
    if(typeof getBoardPlayers!=='function'||window.__FFM_TE_FILTER_PATCHED__)return;
    const original=getBoardPlayers;
    getBoardPlayers=function(position,search){
      const result=original(position,search);
      if(result.length||String(position).toUpperCase()!=='TE')return result;
      const q=String(search||'').trim().toLowerCase();
      if(typeof state==='undefined'||!Array.isArray(state.players))return result;
      return state.players.filter(player=>{
        if(state.drafted?.has(player.id))return false;
        if(canonicalPosition(player.position)!=='TE')return false;
        if(q&&!`${player.name||''} ${player.team||''}`.toLowerCase().includes(q))return false;
        return true;
      });
    };
    window.__FFM_TE_FILTER_PATCHED__=true;
  }

  function activateTe(){
    clearSearch();
    patchBoardFilter();
    normalizePlayers(typeof state!=='undefined'?state.players:[]);
    if(typeof renderAll==='function')renderAll();
    loadTightEnds(teCount()<20);
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-fast-pos]');
    if(!button)return;
    clearSearch();
    if(String(button.dataset.fastPos).toUpperCase()==='TE')setTimeout(activateTe,0);
  },true);

  document.getElementById('position')?.addEventListener('change',event=>{
    if(String(event.target.value).toUpperCase()==='TE')setTimeout(activateTe,0);
  });

  patchBoardFilter();
  normalizePlayers(typeof state!=='undefined'?state.players:[]);
  document.querySelectorAll('.brand small').forEach(el=>{el.textContent=el.textContent.replace(/v\d+\.\d+\.\d+/,`v${VERSION}`);});
  const footer=document.querySelector('footer');
  if(footer)footer.innerHTML=footer.innerHTML.replace(/v\d+\.\d+\.\d+/,`v${VERSION}`);
})();
