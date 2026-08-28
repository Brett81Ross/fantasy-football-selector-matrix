/* Cactus🌵Byte Studios™ — Demo & Help Standard v1.0
   Reusable first-launch demo/help framework for CactusByte apps.
   Video is optional; written guidance always remains available. */
(function(){
  if(window.__cactusByteDemoInstalled)return;window.__cactusByteDemoInstalled=true;
  const cfg=window.CACTUSBYTE_DEMO||{};
  if(!cfg.appId||!cfg.appName)return;
  const demoVersion=String(cfg.demoVersion||'1');
  const seenKey=`cbs_demo_seen:${cfg.appId}:${demoVersion}`;
  const dismissedKey=`cbs_demo_dismissed:${cfg.appId}:${demoVersion}`;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));

  const style=document.createElement('style');style.textContent=`
  .cbs-demo-trigger{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;border:1px solid var(--line,#29483d);background:rgba(13,31,24,.86);color:var(--text,#fff);font-weight:900;cursor:pointer}
  .cbs-demo-backdrop{position:fixed;z-index:1000;inset:0;background:rgba(0,0,0,.76);display:none;align-items:flex-end;justify-content:center;padding-top:env(safe-area-inset-top)}
  .cbs-demo-backdrop.open{display:flex}.cbs-demo-panel{width:min(100%,760px);max-height:92vh;overflow:auto;background:#07140f;color:#edf7f1;border:1px solid #234b3c;border-bottom:0;border-radius:28px 28px 0 0;padding:18px 16px calc(24px + env(safe-area-inset-bottom));box-shadow:0 -24px 70px rgba(0,0,0,.55)}
  .cbs-demo-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.cbs-demo-head h2{margin:0;font-size:21px}.cbs-demo-close{width:40px;height:40px;border-radius:50%;border:1px solid #29483d;background:#10251c;color:#fff;font-size:22px;cursor:pointer}
  .cbs-demo-sub{color:#94b4a5;font-size:12px;line-height:1.5;margin:7px 0 14px}.cbs-demo-video{width:100%;border-radius:18px;background:#02070d;border:1px solid #29483d;max-height:360px}.cbs-demo-placeholder{border:1px dashed #315d4c;border-radius:18px;padding:18px;background:#0b1b15;color:#94b4a5;font-size:12px;line-height:1.5}
  .cbs-demo-steps{display:grid;gap:9px;margin-top:14px}.cbs-demo-step{border:1px solid #29483d;border-radius:16px;padding:13px;background:#0d2119}.cbs-demo-step strong{display:block;font-size:13px;color:#52e08f}.cbs-demo-step span{display:block;color:#a6c2b5;font-size:11px;line-height:1.45;margin-top:4px}
  .cbs-demo-actions{display:flex;gap:9px;margin-top:14px}.cbs-demo-actions button{flex:1;border:0;border-radius:15px;padding:13px;font-weight:900;cursor:pointer}.cbs-demo-primary{background:linear-gradient(135deg,#52e08f,#48d8d2);color:#052018}.cbs-demo-secondary{border:1px solid #29483d!important;background:#0d2119!important;color:#edf7f1}.cbs-demo-check{display:flex;align-items:flex-start;gap:9px;color:#94b4a5;font-size:11px;line-height:1.4;margin-top:13px}.cbs-demo-check input{margin-top:2px}
  @media(min-width:700px){.cbs-demo-backdrop{align-items:center;padding:24px}.cbs-demo-panel{border-bottom:1px solid #234b3c;border-radius:28px;max-height:88vh}}
  `;document.head.appendChild(style);

  const backdrop=document.createElement('div');backdrop.className='cbs-demo-backdrop';backdrop.innerHTML=`<section class="cbs-demo-panel" role="dialog" aria-modal="true" aria-labelledby="cbsDemoTitle"><div class="cbs-demo-head"><h2 id="cbsDemoTitle">How to use ${esc(cfg.appName)}</h2><button class="cbs-demo-close" aria-label="Close demo">×</button></div><p class="cbs-demo-sub">${esc(cfg.intro||'A short guided walkthrough of the fastest way to use this app.')}</p><div class="cbs-demo-media"></div><div class="cbs-demo-steps"></div><label class="cbs-demo-check"><input type="checkbox" class="cbs-demo-dontshow"> <span>Don’t show this automatically again for this demo version. You can always reopen it from Help.</span></label><div class="cbs-demo-actions"><button class="cbs-demo-secondary cbs-demo-skip">Close</button><button class="cbs-demo-primary cbs-demo-start">Start Guided Walkthrough</button></div></section>`;document.body.appendChild(backdrop);
  const media=backdrop.querySelector('.cbs-demo-media');
  if(cfg.videoUrl){media.innerHTML=`<video class="cbs-demo-video" controls playsinline preload="metadata" poster="${esc(cfg.posterUrl||'')}"><source src="${esc(cfg.videoUrl)}"></video>`;}
  else media.innerHTML=`<div class="cbs-demo-placeholder"><strong>Demo video slot ready.</strong><br>The written guided walkthrough is active now. The final recorded walkthrough can be dropped in later without rebuilding the help system.</div>`;
  const steps=Array.isArray(cfg.steps)?cfg.steps:[];backdrop.querySelector('.cbs-demo-steps').innerHTML=steps.map((s,i)=>`<div class="cbs-demo-step" data-step="${i}"><strong>${i+1}. ${esc(s.title||'Step')}</strong><span>${esc(s.text||'')}</span></div>`).join('');

  function close(){if(backdrop.querySelector('.cbs-demo-dontshow').checked)localStorage.setItem(dismissedKey,'1');backdrop.classList.remove('open');document.body.style.overflow='';}
  function open(auto=false){backdrop.classList.add('open');document.body.style.overflow='hidden';if(auto)localStorage.setItem(seenKey,'1');}
  backdrop.querySelector('.cbs-demo-close').onclick=close;backdrop.querySelector('.cbs-demo-skip').onclick=close;backdrop.addEventListener('click',e=>{if(e.target===backdrop)close();});
  backdrop.querySelector('.cbs-demo-start').onclick=()=>{localStorage.setItem(seenKey,'1');backdrop.querySelector('.cbs-demo-steps')?.scrollIntoView({behavior:'smooth',block:'start'});cfg.onStart?.();};

  const target=document.querySelector(cfg.triggerContainer||'.top-actions')||document.querySelector('header')||document.body;
  const trigger=document.createElement('button');trigger.type='button';trigger.className='cbs-demo-trigger';trigger.setAttribute('aria-label',`How to use ${cfg.appName}`);trigger.title=`How to use ${cfg.appName}`;trigger.textContent='?';trigger.onclick=()=>open(false);target.appendChild(trigger);
  window.openCactusByteDemo=()=>open(false);

  const seen=localStorage.getItem(seenKey)==='1',dismissed=localStorage.getItem(dismissedKey)==='1';
  if(cfg.firstLaunch!==false&&!seen&&!dismissed)setTimeout(()=>open(true),Number(cfg.autoDelayMs)||900);
})();
