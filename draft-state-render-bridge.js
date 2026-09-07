(() => {
  'use strict';

  let queued=false;

  function refresh(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      if(typeof window.renderAll==='function')window.renderAll();
    });
  }

  window.addEventListener('ffm:draft-state',refresh);
})();