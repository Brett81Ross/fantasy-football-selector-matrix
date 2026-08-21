const CACHE='ff-matrix-v1.3.2-hotfix1';
const CORE=['/','/index.html','/manifest.json','/fast-draft.js','/roster-needs.js','/vorp.js','/icons/icon-192.png','/icons/favicon-96.png','/icons/ffm-mark.svg'];
const FAST_SCRIPT='<script src="/fast-draft.js?v=1.3.2"></script>';
const ROSTER_SCRIPT='<script src="/roster-needs.js?v=1.3.2"></script>';
const VORP_SCRIPT='<script src="/vorp.js?v=1.3.2"></script>';

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
      .then(()=>self.clients.matchAll({type:'window',includeUncontrolled:true}))
      .then(clients=>Promise.all(clients.map(client=>{
        try{return client.navigate(client.url)}catch(_){return null}
      })))
  );
});

function ensureFastDraft(response){
  if(!response || !response.ok) return Promise.resolve(response);
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html')) return Promise.resolve(response);
  return response.text().then(html=>{
    if(!html.includes('/fast-draft.js')) html=html.replace('</body>',FAST_SCRIPT+'\n</body>');
    if(!html.includes('/roster-needs.js')) html=html.replace('</body>',ROSTER_SCRIPT+'\n</body>');
    if(!html.includes('/vorp.js')) html=html.replace('</body>',VORP_SCRIPT+'\n</body>');
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('x-ffm-runtime','1.3.2');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  });
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.pathname.startsWith('/api/')){event.respondWith(fetch(event.request));return;}

  if(event.request.mode==='navigate' || url.pathname==='/' || url.pathname==='/index.html'){
    event.respondWith(
      fetch(event.request)
        .then(ensureFastDraft)
        .then(response=>{
          if(response){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('/index.html',copy));}
          return response;
        })
        .catch(()=>caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response;})
      .catch(()=>caches.match(event.request))
  );
});
