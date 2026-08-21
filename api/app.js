module.exports = async function handler(req, res) {
  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const source = await fetch(`${proto}://${host}/index.html`, {
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!source.ok) throw new Error(`index.html request failed (${source.status})`);

    let html = await source.text();
    html = html
      .replaceAll('Fantasy Football Selector Matrix™', 'Fantasy Football Matrix™')
      .replaceAll('Fantasy Football Selector Matrix', 'Fantasy Football Matrix');

    const iosHead = `
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="Fantasy Football Matrix" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="format-detection" content="telephone=no" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
<link rel="icon" type="image/png" sizes="96x96" href="/icons/favicon-96.png" />
<style>
:root{--accent:#39ff14;--accent2:#9cff35}
.mark{padding:0!important;overflow:hidden!important;border-color:#39ff14!important;background:#07100c!important;box-shadow:0 0 18px rgba(57,255,20,.18)}
.mark img{display:block;width:100%;height:100%;object-fit:cover}
.hero{border-color:rgba(57,255,20,.28)!important}
.tab.active{box-shadow:0 0 18px rgba(57,255,20,.16)}
</style>`;
    html = html.replace('</head>', `${iosHead}\n</head>`);

    if (!html.includes('/fast-draft.js')) {
      html = html.replace('</body>', '<script src="/fast-draft.js?v=1.3.0"></script>\n</body>');
    }

    const brandScript = `
<script>
window.addEventListener('DOMContentLoaded',()=>{
  document.title='Fantasy Football Matrix™';
  document.querySelectorAll('.brand small').forEach(el=>{el.textContent=el.textContent.replace(/v\\d+\\.\\d+\\.\\d+/, 'v1.3.0')});
  const footer=document.querySelector('footer');
  if(footer) footer.innerHTML=footer.innerHTML.replace(/v\\d+\\.\\d+\\.\\d+/, 'v1.3.0');
  const mark=document.querySelector('.mark');
  if(mark){mark.innerHTML='<img src="/icons/icon-192.png" alt="FFM shield" />';mark.setAttribute('aria-label','Fantasy Football Matrix logo')}
});
</script>`;
    html = html.replace('</body>', `${brandScript}\n</body>`);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    res.status(200).send(html);
  } catch (error) {
    console.error('app shell error', error);
    res.status(500).send('Fantasy Football Matrix is temporarily unavailable.');
  }
};
