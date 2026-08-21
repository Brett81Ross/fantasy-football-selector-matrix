const VERSION='1.4.2';
const CACHE=`ff-matrix-v${VERSION}`;
const CORE=['/','/index.html','/manifest.json','/fast-draft.js','/roster-needs.js','/vorp.js','/tier-cliffs.js','/brand-integration.js','/live-refresh.js','/icons/ffm-user-logo.svg','/icons/favicon-96.png'];
const FAST_SCRIPT=`<script src="/fast-draft.js?v=${VERSION}"></script>`;
const ROSTER_SCRIPT=`<script src="/roster-needs.js?v=${VERSION}"></script>`;
const VORP_SCRIPT=`<script src="/vorp.js?v=${VERSION}"></script>`;
const TIER_SCRIPT=`<script src="/tier-cliffs.js?v=${VERSION}"></script>`;
const BRAND_SCRIPT=`<script src="/brand-integration.js?v=${VERSION}"></script>`;
const LIVE_SCRIPT=`<script src="/live-refresh.js?v=${VERSION}"></script>`;

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
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    await Promise.all(clients.map(client=>{
      try{return client.navigate(client.url)}catch(_){return null}
    }));
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
  const headers=new Headers(response.headers);
  headers.delete('content-length');headers.delete('content-encoding');
  headers.set('x-ffm-runtime',VERSION);
  headers.set('cache-control','no-cache');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
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
      try{
        const response=await fetch(event.request,{cache:'no-store'});
        const injected=await injectRuntime(response);
        if(injected){const copy=injected.clone();const cache=await caches.open(CACHE);await cache.put('/index.html',copy);}
        return injected;
      }catch(_){return caches.match('/index.html')}
    })());
    return;
  }
  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request,{cache:'no-cache'});
      if(response.ok){const cache=await caches.open(CACHE);await cache.put(event.request,response.clone());}
      return response;
    }catch(_){return caches.match(event.request)}
  })());
});
