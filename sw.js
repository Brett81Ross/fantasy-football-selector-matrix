const VERSION='1.4.4';
const CACHE=`ff-matrix-v${VERSION}`;
const CORE=['/index.html','/manifest.json','/fast-draft.js','/roster-needs.js','/vorp.js','/tier-cliffs.js','/brand-integration.js','/live-refresh.js','/te-fix.js','/icons/ffm-user-logo.svg','/icons/favicon-96.png'];
const FAST_SCRIPT=`<script src="/fast-draft.js?v=${VERSION}"></script>`;
const ROSTER_SCRIPT=`<script src="/roster-needs.js?v=${VERSION}"></script>`;
const VORP_SCRIPT=`<script src="/vorp.js?v=${VERSION}"></script>`;
const TIER_SCRIPT=`<script src="/tier-cliffs.js?v=${VERSION}"></script>`;
const BRAND_SCRIPT=`<script src="/brand-integration.js?v=${VERSION}"></script>`;
const LIVE_SCRIPT=`<script src="/live-refresh.js?v=${VERSION}"></script>`;
const TE_FIX_SCRIPT=`<script src="/te-fix.js?v=${VERSION}"></script>`;

async function primeCache(){
  const cache=await caches.open(CACHE);
  await Promise.allSettled(CORE.map(async url=>{
    const response=await fetch(new Request(url,{cache:'reload'}));
    if(response.ok)await cache.put(url,response.clone());
  }));
}

self.addEventListener('install',event=>{
  event.waitUntil(primeCache().then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

async function injectRuntime(response){
  if(!response||!response.ok)return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('/fast-draft.js'))html=html.replace('</body>',FAST_SCRIPT+'\n</body>');
  if(!html.includes('/roster-needs.js'))html=html.replace('</body>',ROSTER_SCRIPT+'\n</body>');
  if(!html.includes('/vorp.js'))html=html.replace('</body>',VORP_SCRIPT+'\n</body>');
  if(!html.includes('/tier-cliffs.js'))html=html.replace('</body>',TIER_SCRIPT+'\n</body>');
  if(!html.includes('/brand-integration.js'))html=html.replace('</body>',BRAND_SCRIPT+'\n</body>');
  if(!html.includes('/live-refresh.js'))html=html.replace('</body>',LIVE_SCRIPT+'\n</body>');
  if(!html.includes('/te-fix.js'))html=html.replace('</body>',TE_FIX_SCRIPT+'\n</body>');
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('x-ffm-runtime',VERSION);
  headers.set('cache-control','no-cache');
  return new Response(html,{status:200,statusText:'OK',headers});
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);

  if(url.pathname.startsWith('/api/')){
    event.respondWith(fetch(event.request,{cache:'no-store'}));
    return;
  }

  if(event.request.mode==='navigate'||url.pathname==='/'||url.pathname==='/index.html'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const response=await fetch('/index.html',{cache:'no-store'});
        if(!response.ok)throw new Error(`index ${response.status}`);
        const injected=await injectRuntime(response);
        if(injected?.ok)await cache.put('/index.html',injected.clone());
        return injected;
      }catch(_){
        const cached=await cache.match('/index.html');
        if(cached)return cached;
        return new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#07100c;color:#f3f7f4;font:16px system-ui;padding:24px"><h2>Fantasy Football Matrix™</h2><p>Connection unavailable. Reopen the app when you are online.</p></body>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(event.request,{cache:'no-cache'});
      if(response.ok)await cache.put(event.request,response.clone());
      return response;
    }catch(_){
      return (await cache.match(event.request))||Response.error();
    }
  })());
});
