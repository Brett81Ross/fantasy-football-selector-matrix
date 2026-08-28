const VERSION='1.5.3';
const CACHE=`ff-matrix-v${VERSION}`;
const CORE=['/manifest.json','/splash.js','/fast-draft.js','/special-teams.js','/decision-matrix.js','/roster-needs.js','/vorp.js','/tier-cliffs.js','/brand-integration.js','/live-refresh.js','/te-fix.js','/version-lock.js','/cactusbyte-demo.js','/icons/cactus-byte-studios.svg','/icons/ffm-user-logo.svg','/icons/ffm-logo-512.png','/icons/icon-192.png','/icons/favicon-96.png'];
async function primeCache(){const c=await caches.open(CACHE);await Promise.allSettled(CORE.map(async u=>{const r=await fetch(new Request(u,{cache:'reload'}));if(r.ok)await c.put(u,r.clone())}));try{const shell=await fetch('/',{cache:'no-store'});if(shell.ok)await c.put('/app-shell',shell.clone())}catch(_){}}
self.addEventListener('install',e=>e.waitUntil(primeCache().then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==CACHE)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.pathname.startsWith('/api/')){event.respondWith(fetch(event.request,{cache:'no-store'}));return}
  if(event.request.mode==='navigate'||url.pathname==='/'||url.pathname==='/index.html'){
    event.respondWith((async()=>{const c=await caches.open(CACHE);try{const r=await fetch('/',{cache:'no-store'});if(!r.ok)throw new Error('shell '+r.status);await c.put('/app-shell',r.clone());return r}catch(_){return(await c.match('/app-shell'))||new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#07100c;color:#f3f7f4;font:16px system-ui;padding:24px"><h2>Fantasy Football Matrix™</h2><p>Connection unavailable. Reopen the app when you are online.</p></body>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})}})());return
  }
  event.respondWith((async()=>{const c=await caches.open(CACHE);try{const r=await fetch(event.request,{cache:'no-cache'});if(r.ok)await c.put(event.request,r.clone());return r}catch(_){return(await c.match(event.request))||Response.error()}})())
});
