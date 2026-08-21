(() => {
  'use strict';

  const VERSION = '1.3.4';
  const LOGO = '/icons/ffm-logo-512.png';

  function applyBranding() {
    const style = document.createElement('style');
    style.textContent = `
      .mark{overflow:hidden;padding:0;background:#07100c!important;border-color:#39ff14!important;box-shadow:0 0 18px rgba(57,255,20,.14)}
      .mark img{display:block;width:100%;height:100%;object-fit:cover;border-radius:12px}
      .qrbadge{padding:0!important;overflow:hidden;background:#07100c!important;border-color:#fff!important}
      .qrbadge img{display:block;width:100%;height:100%;object-fit:cover;border-radius:8px}
    `;
    document.head.appendChild(style);

    const mark = document.querySelector('.mark');
    if (mark) {
      mark.innerHTML = `<img src="${LOGO}" alt="Fantasy Football Matrix FFM shield logo">`;
      mark.setAttribute('aria-label', 'Fantasy Football Matrix FFM shield logo');
    }

    const qrBadge = document.querySelector('.qrbadge');
    if (qrBadge) qrBadge.innerHTML = `<img src="${LOGO}" alt="FFM">`;

    document.querySelectorAll('.brand small').forEach(el => {
      el.textContent = el.textContent.replace(/v\d+\.\d+\.\d+/, `v${VERSION}`);
    });
    const footer = document.querySelector('footer');
    if (footer) footer.innerHTML = footer.innerHTML.replace(/v\d+\.\d+\.\d+/, `v${VERSION}`);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyBranding, { once: true });
  else applyBranding();
})();
