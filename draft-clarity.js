(() => {
'use strict';
function ready(){return typeof state!=='undefined'&&Array.isArray(state.players)&&typeof bestDraftPlayer==='function'}
function update(){
  if(!ready())return;
  document.querySelectorAll('.vorp-row-tag.wait').forEach(tag=>{
    const m=tag.textContent.match(/-?([0-9]+(?:\.[0-9]+)?)/);
    if(m)tag.textContent=`WAIT COST: -${m[1]} MATRIX VALUE`;
    tag.title='Estimated drop in Matrix draft value if you wait until your next pick — not fantasy points or rounds.';
  });
  const strip=document.querySelector('#draftPick .vorp-strip');
  if(strip){
    const metrics=strip.querySelectorAll('.vorp-metric');
    if(metrics[1]){
      const b=metrics[1].querySelector('b');
      const label=metrics[1].querySelector('span');
      const cost=Number(b?.textContent||0);
      if(label)label.textContent='WAIT COST · MATRIX VALUE';
      if(b)b.title='Estimated Matrix draft-value drop by your next pick — not fantasy points or rounds.';
      const pick=bestDraftPlayer();
      const verdict=document.querySelector('#draftPick .why');
      if(pick&&verdict&&!verdict.querySelector('.draft-urgency')){
        const urgency=document.createElement('div');
        urgency.className='draft-urgency';
        urgency.style.cssText='margin:0 0 9px;padding:8px 10px;border:1px solid #315742;border-radius:11px;color:var(--accent);font-weight:900';
        urgency.textContent=cost>=2?`DRAFT NOW — waiting projects a -${cost.toFixed(1)} Matrix-value drop.`:'SAFE TO WAIT — little projected Matrix-value loss before your next pick.';
        verdict.prepend(urgency);
      }
    }
  }
}
function init(){if(!ready())return setTimeout(init,100);update();const observer=new MutationObserver(()=>requestAnimationFrame(update));const host=document.getElementById('draft');if(host)observer.observe(host,{childList:true,subtree:true,characterData:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
