(() => {
  'use strict';

  const DRAFTED_KEY='ffm-fast-drafted';
  const ROSTER_KEY='ffm-fast-my-roster';
  let queued=false;

  function persist(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch(_){}}

  function synchronizeCanonical(next){
    if(!next||typeof next!=='object'||typeof state==='undefined')return;
    if(state.drafted instanceof Set&&Array.isArray(next.draftedPlayerIds)){
      state.drafted.clear();
      next.draftedPlayerIds.forEach(id=>state.drafted.add(id));
      persist(DRAFTED_KEY,next.draftedPlayerIds);
    }
    if(Array.isArray(next.myRoster)){
      persist(ROSTER_KEY,next.myRoster.map(item=>item.playerId).filter(Boolean));
    }
    if(next.picksUntilMyNext!==null&&next.picksUntilMyNext!==undefined){
      state.picksUntilNext=Math.max(0,Number(next.picksUntilMyNext)||0);
    }
  }

  function refresh(event){
    synchronizeCanonical(event?.detail);
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      if(typeof window.renderAll==='function')window.renderAll();
    });
  }

  window.addEventListener('ffm:draft-state',refresh);
})();