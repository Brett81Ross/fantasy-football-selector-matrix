(() => {
  'use strict';

  const VERSION = '1.3.5';
  const SHIELD = '/icons/ffm-mark.svg';

  function applyBranding() {
    const style = document.createElement('style');
    style.textContent = `
      .brand{gap:10px!important;min-width:0;align-items:center!important}
      .brand-lockup{display:flex;align-items:center;gap:10px;min-width:0}
      .brand-shield{width:58px;height:58px;flex:0 0 58px;display:block;object-fit:contain;filter:drop-shadow(0 0 10px rgba(57,255,20,.15))}
      .brand-copy{min-width:0;line-height:.92;font-family:Arial Black,Impact,system-ui,sans-serif;font-style:italic;font-weight:950;letter-spacing:-.025em}
      .brand-copy .bw1{display:block;color:#fff;font-size:15px;white-space:nowrap}
      .brand-copy .bw2{display:block;color:#fff;font-size:15px;white-space:nowrap}
      .brand-copy .bw3{display:block;color:#8dff21;font-size:19px;white-space:nowrap;margin-top:2px}
      .brand-copy sup{font-size:7px;margin-left:2px;vertical-align:top;color:#8dff21}
      .brand-version{display:block!important;color:var(--muted)!important;font-family:Inter,ui-sans-serif,system-ui,sans-serif!important;font-style:normal!important;font-weight:500!important;letter-spacing:0!important;font-size:9px!important;line-height:1.2!important;margin-top:5px!important}
      .qrbadge{padding:0!important;overflow:hidden;background:#07100c!important;border-color:#fff!important}
      .qrbadge img{display:block;width:100%;height:100%;object-fit:contain;border-radius:8px}
      @media(max-width:560px){
        .brand-shield{width:50px;height:50px;flex-basis:50px}
        .brand-copy .bw1,.brand-copy .bw2{font-size:12px}.brand-copy .bw3{font-size:16px}
        .top{gap:7px}.actions{gap:5px}.iconbtn{min-width:40px;padding:0 9px}
      }
      @media(max-width:410px){
        .brand-shield{width:45px;height:45px;flex-basis:45px}.brand-lockup{gap:7px}
        .brand-copy .bw1,.brand-copy .bw2{font-size:10px}.brand-copy .bw3{font-size:14px}
      }
    `;
    document.head.appendChild(style);

    const brand = document.querySelector('.brand');
    if (brand) {
      brand.innerHTML = `
        <div class="brand-lockup" aria-label="Fantasy Football Matrix">
          <img class="brand-shield" src="${SHIELD}" alt="FFM shield logo">
          <div class="brand-copy">
            <span class="bw1">FANTASY</span>
            <span class="bw2">FOOTBALL</span>
            <span class="bw3">MATRIX<sup>™</sup></span>
            <small class="brand-version">Decision Engine · v${VERSION}</small>
          </div>
        </div>`;
    }

    const qrBadge = document.querySelector('.qrbadge');
    if (qrBadge) qrBadge.innerHTML = `<img src="${SHIELD}" alt="FFM">`;

    const footer = document.querySelector('footer');
    if (footer) footer.innerHTML = footer.innerHTML.replace(/v\d+\.\d+\.\d+/, `v${VERSION}`);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyBranding, { once: true });
  else applyBranding();
})();
