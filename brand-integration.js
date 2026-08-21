(() => {
  'use strict';

  const VERSION = '1.3.6';
  const SHIELD = '/icons/ffm-user-logo.svg';

  function applyBranding() {
    const style = document.createElement('style');
    style.textContent = `
      .top{display:grid!important;grid-template-columns:minmax(0,1fr) auto!important;align-items:center!important;gap:12px!important;padding-top:4px!important}
      .brand{display:block!important;min-width:0!important;width:100%!important}
      .brand-lockup{display:grid!important;grid-template-columns:76px minmax(0,1fr)!important;align-items:center!important;gap:14px!important;min-width:0!important;width:100%!important}
      .brand-shield{width:76px!important;height:76px!important;display:block!important;object-fit:contain!important;filter:drop-shadow(0 0 12px rgba(123,255,0,.18))}
      .brand-copy{position:relative!important;min-width:0!important;padding:10px 0 9px!important;font-family:Impact,'Arial Black',Arial,sans-serif!important;font-style:italic!important;font-weight:900!important;line-height:.83!important;letter-spacing:.01em!important;text-transform:uppercase!important}
      .brand-copy:before,.brand-copy:after{content:'';position:absolute;left:0;right:3%;height:1px;background:linear-gradient(90deg,rgba(123,255,0,0),rgba(123,255,0,.8) 18%,rgba(123,255,0,.18) 88%,rgba(123,255,0,0));box-shadow:0 0 7px rgba(123,255,0,.45)}
      .brand-copy:before{top:0}.brand-copy:after{bottom:0}
      .brand-copy .bw1,.brand-copy .bw2,.brand-copy .bw3{display:block!important;white-space:nowrap!important;text-shadow:0 2px 0 rgba(0,0,0,.55)!important}
      .brand-copy .bw1,.brand-copy .bw2{color:#fff!important;font-size:25px!important}
      .brand-copy .bw3{color:#8cff19!important;font-size:30px!important;margin-top:5px!important}
      .brand-copy sup{font-size:8px!important;margin-left:2px!important;vertical-align:top!important;color:#8cff19!important}
      .brand-version{display:block!important;color:#829187!important;font-family:Inter,ui-sans-serif,system-ui,sans-serif!important;font-style:normal!important;font-weight:500!important;letter-spacing:0!important;text-transform:none!important;font-size:9px!important;line-height:1.2!important;margin-top:9px!important}
      .qrbadge{padding:0!important;overflow:hidden!important;background:#07100c!important;border-color:#fff!important}
      .qrbadge img{display:block!important;width:100%!important;height:100%!important;object-fit:contain!important;border-radius:8px!important}
      @media(max-width:640px){
        .top{gap:8px!important}.brand-lockup{grid-template-columns:58px minmax(0,1fr)!important;gap:9px!important}.brand-shield{width:58px!important;height:58px!important}
        .brand-copy{padding:8px 0 7px!important}.brand-copy .bw1,.brand-copy .bw2{font-size:17px!important}.brand-copy .bw3{font-size:21px!important;margin-top:3px!important}.brand-version{font-size:8px!important;margin-top:6px!important}
        .actions{gap:5px!important}.iconbtn{min-width:40px!important;padding:0 9px!important}
      }
      @media(max-width:430px){
        .brand-lockup{grid-template-columns:50px minmax(0,1fr)!important;gap:7px!important}.brand-shield{width:50px!important;height:50px!important}
        .brand-copy .bw1,.brand-copy .bw2{font-size:14px!important}.brand-copy .bw3{font-size:18px!important}.brand-version{font-size:7px!important}.brand-copy:before,.brand-copy:after{right:0}
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
