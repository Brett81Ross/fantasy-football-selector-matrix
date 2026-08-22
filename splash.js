(() => {
  'use strict';
  const VERSION='1.4.5';
  const STUDIO='/icons/cactus-byte-studios.svg';
  const APP='/icons/ffm-user-logo.svg';
  const MIN_MS=900;
  const MAX_MS=2200;
  const started=performance.now();

  if(document.getElementById('cbsSplash'))return;

  const style=document.createElement('style');
  style.id='cbsSplashStyles';
  style.textContent=`
    #cbsSplash{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;overflow:hidden;background:
      radial-gradient(circle at 50% 33%,rgba(57,255,20,.12),transparent 30%),
      linear-gradient(rgba(57,255,20,.035) 1px,transparent 1px),
      linear-gradient(90deg,rgba(57,255,20,.035) 1px,transparent 1px),
      #040a06;background-size:auto,46px 46px,46px 46px,auto;color:#f5fff7;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;opacity:1;transition:opacity .38s ease,visibility .38s ease}
    #cbsSplash:before,#cbsSplash:after{content:'';position:absolute;left:8%;right:8%;height:1px;background:linear-gradient(90deg,transparent,rgba(57,255,20,.65),transparent);box-shadow:0 0 14px rgba(57,255,20,.28)}
    #cbsSplash:before{top:14%}#cbsSplash:after{bottom:14%}
    #cbsSplash.cbs-hide{opacity:0;visibility:hidden;pointer-events:none}
    .cbs-splash-inner{width:min(90vw,720px);display:grid;justify-items:center;text-align:center;padding:28px 20px;position:relative}
    .cbs-studio-logo{width:min(88vw,610px);height:auto;display:block;filter:drop-shadow(0 0 18px rgba(57,255,20,.12));animation:cbsStudioIn .55s cubic-bezier(.2,.8,.2,1) both}
    .cbs-divider{width:min(72vw,430px);height:1px;margin:19px 0 18px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.16),rgba(57,255,20,.72),rgba(255,255,255,.16),transparent)}
    .cbs-app-lockup{display:grid;justify-items:center;gap:9px;animation:cbsAppIn .58s .12s cubic-bezier(.2,.8,.2,1) both}
    .cbs-app-shield-wrap{width:118px;height:118px;display:grid;place-items:center;border-radius:31px;background:radial-gradient(circle,rgba(57,255,20,.11),transparent 65%);filter:drop-shadow(0 0 10px rgba(140,255,25,.75)) drop-shadow(0 0 25px rgba(57,255,20,.25))}
    .cbs-app-shield{width:116px;height:116px;object-fit:contain;display:block}
    .cbs-app-name{font-family:Impact,'Arial Black',Arial,sans-serif;font-size:clamp(24px,6vw,40px);font-style:italic;font-weight:900;letter-spacing:.025em;line-height:.95;text-transform:uppercase;color:#fff;text-shadow:0 2px 0 #000}
    .cbs-app-name span{color:#8cff19}
    .cbs-subtitle{margin-top:2px;color:#8ea197;font-size:10px;font-weight:850;letter-spacing:.19em;text-transform:uppercase}
    .cbs-loader{display:flex;align-items:center;gap:10px;margin-top:24px;color:#aab9b0;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
    .cbs-loader-ring{width:18px;height:18px;border:2px solid rgba(57,255,20,.16);border-top-color:#39ff14;border-radius:50%;animation:cbsSpin .72s linear infinite;box-shadow:0 0 10px rgba(57,255,20,.18)}
    .cbs-version{margin-top:13px;color:#526459;font-size:9px;letter-spacing:.11em}
    @keyframes cbsSpin{to{transform:rotate(360deg)}}
    @keyframes cbsStudioIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
    @keyframes cbsAppIn{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:none}}
    @media(max-width:520px){.cbs-studio-logo{width:min(92vw,520px)}.cbs-app-shield-wrap{width:104px;height:104px}.cbs-app-shield{width:102px;height:102px}.cbs-divider{margin:13px 0 15px}.cbs-loader{margin-top:20px}}
    @media(prefers-reduced-motion:reduce){.cbs-studio-logo,.cbs-app-lockup,.cbs-loader-ring{animation:none!important}#cbsSplash{transition:none!important}}
  `;
  document.head.appendChild(style);

  const splash=document.createElement('div');
  splash.id='cbsSplash';
  splash.setAttribute('role','status');
  splash.setAttribute('aria-label','Fantasy Football Matrix loading');
  splash.innerHTML=`
    <div class="cbs-splash-inner">
      <img class="cbs-studio-logo" src="${STUDIO}" alt="Cactus Byte Studios">
      <div class="cbs-divider"></div>
      <div class="cbs-app-lockup">
        <span class="cbs-app-shield-wrap"><img class="cbs-app-shield" src="${APP}" alt="Fantasy Football Matrix shield"></span>
        <div class="cbs-app-name">FANTASY FOOTBALL <span>MATRIX™</span></div>
        <div class="cbs-subtitle">Decision Engine Initializing</div>
      </div>
      <div class="cbs-loader"><span class="cbs-loader-ring"></span><span>Loading the Matrix</span></div>
      <div class="cbs-version">v${VERSION} · Cactus🌵Byte Studios™</div>
    </div>`;

  document.body.prepend(splash);
  document.documentElement.style.background='#040a06';

  let hidden=false;
  function hide(){
    if(hidden)return;hidden=true;
    const elapsed=performance.now()-started;
    const wait=Math.max(0,MIN_MS-elapsed);
    setTimeout(()=>{
      splash.classList.add('cbs-hide');
      setTimeout(()=>{splash.remove();style.remove();},450);
    },wait);
  }

  if(document.readyState==='complete')hide();
  else window.addEventListener('load',hide,{once:true});
  setTimeout(hide,MAX_MS);
})();
