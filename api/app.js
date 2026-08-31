const VERSION='1.5.5';

module.exports=async function handler(req,res){
  try{
    const proto=req.headers['x-forwarded-proto']||'https';
    const host=req.headers.host;
    const source=await fetch(`${proto}://${host}/index.html`,{headers:{'Cache-Control':'no-cache'}});
    if(!source.ok)throw new Error(`index.html request failed (${source.status})`);
    let html=await source.text();
    html=html.replaceAll('Fantasy Football Selector Matrix™','Fantasy Football Matrix™').replaceAll('Fantasy Football Selector Matrix','Fantasy Football Matrix');
    html=html.replace(/v1\.1\.0/g,`v${VERSION}`);
    html=html.replace(/if\('serviceWorker' in navigator\)navigator\.serviceWorker\.register\('\/sw\.js'\)\.catch\(\(\)=>\{\}\);?/g,'');

    const swRetirement=`<script>(function(){try{const retire=async()=>{if('serviceWorker' in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.allSettled(regs.map(r=>r.unregister()));}if('caches' in window){const keys=await caches.keys();await Promise.allSettled(keys.filter(k=>k.startsWith('ff-matrix-')||k.startsWith('fantasy-football-')).map(k=>caches.delete(k)));}};retire().catch(()=>{});}catch(_){}})();</script>`;
    html=html.replace('<head>',`<head>\n${swRetirement}`);

    const canonicalUrl='https://fantasy-football-selector-matrix.vercel.app/';
    const shareImage=canonicalUrl+'icons/ffm-logo-512.png';
    const launchHead=`<meta name="application-name" content="Fantasy Football Matrix" /><meta name="apple-mobile-web-app-capable" content="yes" /><meta name="apple-mobile-web-app-title" content="Fantasy Football Matrix" /><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" /><meta name="format-detection" content="telephone=no" /><link rel="apple-touch-icon" href="/icons/icon-192.png?v=${VERSION}" /><link rel="icon" href="/icons/favicon-96.png?v=${VERSION}" /><link rel="canonical" href="${canonicalUrl}" /><meta property="og:type" content="website" /><meta property="og:url" content="${canonicalUrl}" /><meta property="og:image" content="${shareImage}" /><meta property="og:image:width" content="512" /><meta property="og:image:height" content="512" /><meta name="twitter:card" content="summary" /><meta name="twitter:image" content="${shareImage}" /><style>:root{--accent:#39ff14;--accent2:#9cff35}.mark{padding:0!important;overflow:hidden!important;border-color:#39ff14!important;background:#07100c!important}.mark img{display:block;width:100%;height:100%;object-fit:cover}.hero{border-color:rgba(57,255,20,.28)!important}</style>`;
    html=html.replace('</head>',`${launchHead}\n</head>`);
    if(!html.includes('/splash.js'))html=html.replace('<body>',`<body>\n<script src="/splash.js?v=${VERSION}"></script>`);
    const demoConfig=`<script>window.CACTUSBYTE_DEMO={appId:'fantasy-football-matrix',appName:'Fantasy Football Matrix™',demoVersion:'1',videoUrl:'https://cactusbyte-studios.vercel.app/demos/fantasy-football-matrix-60-second-demo.mp4',intro:'A quick walkthrough for draft-day decisions, roster needs, player value and live updates.',steps:[{title:'Set your draft context',text:'Start with your league and roster situation so the Matrix can frame recommendations around what your team actually needs.'},{title:'Use Fast Draft',text:'Open Fast Draft when you need a quick ranked recommendation from the players available to you.'},{title:'Compare close decisions',text:'Use the Decision Matrix when two or more players are close and you want a clearer side-by-side choice.'},{title:'Check value and roster pressure',text:'Use VORP, Tier Cliffs and Roster Needs to see positional scarcity, replacement value and where waiting may cost you.'},{title:'Watch live changes',text:'Live Refresh keeps supported NFL data current. Treat projections and rankings as decision support, not guaranteed outcomes.'},{title:'Reopen Help anytime',text:'Tap the ? Help button whenever you want this walkthrough again.'}]};</script>`;
    html=html.replace('</body>',`${demoConfig}\n</body>`);
    const runtime=['fast-draft.js','special-teams.js','roster-needs.js','vorp.js','tier-cliffs.js','brand-integration.js','live-refresh.js','te-fix.js','decision-matrix.js','version-lock.js','cactusbyte-demo.js'];
    for(const file of runtime){if(!html.includes('/'+file))html=html.replace('</body>',`<script src="/${file}?v=${VERSION}"></script>\n</body>`)}
    const brandScript=`<script>window.addEventListener('DOMContentLoaded',()=>{document.title='Fantasy Football Matrix™';document.querySelectorAll('.brand small,.brand-version').forEach(el=>el.textContent=el.textContent.replace(/v\\d+\\.\\d+\\.\\d+/,'v${VERSION}'));const f=document.querySelector('footer');if(f)f.innerHTML=f.innerHTML.replace(/v\\d+\\.\\d+\\.\\d+/,'v${VERSION}');const m=document.querySelector('.mark');if(m){m.innerHTML='<img src="/icons/icon-192.png?v=${VERSION}" alt="FFM shield" />';m.setAttribute('aria-label','Fantasy Football Matrix logo')}});</script>`;
    html=html.replace('</body>',`${brandScript}\n</body>`);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store, max-age=0, must-revalidate');
    res.setHeader('CDN-Cache-Control','no-store');
    res.setHeader('Pragma','no-cache');
    res.status(200).send(html);
  }catch(error){console.error('app shell error',error);res.status(500).send('Fantasy Football Matrix is temporarily unavailable.')}
};
