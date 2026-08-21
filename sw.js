const CACHE='ff-selector-matrix-v1.2.0';
const CORE=['/','/index.html','/manifest.json','/fast-draft.js'];
const FAST_SCRIPT='<script src="/fast-draft.js?v=1.2.0"></script>';

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

function injectFastDraft(response){
  if(!response || !response.ok) return Promise.resolve(response);
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html')) return Promise.resolve(response);
  return response.text().then(html=>{
    if(!html.includes('/fast-draft.js')){
      const marker='<script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js"></script>';
      html=html.includes(marker)
        ? html.replace(marker,FAST_SCRIPT+'\n  '+marker)
        : html.replace('</body>',FAST_SCRIPT+'\n</body>');
    }
    const headers=new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('x-ffm-runtime','1.2.0-fast-draft');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  });
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);

  // Data stays fresh. The page runtime handles its own stale-while-revalidate
  // local cache for instant draft reloads.
  if(url.pathname.startsWith('/api/')){
    event.respondWith(fetch(event.request));
    return;
  }

  if(event.request.mode==='navigate' || url.pathname==='/' || url.pathname==='/index.html'){
    event.respondWith(
      fetch(event.request)
        .then(injectFastDraft)
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
      .then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        return response;
      })
      .catch(()=>caches.match(event.request))
  );
});
