// v1.5.5 retirement worker. This file intentionally provides no offline cache.
self.addEventListener('install',event=>{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    try{
      const keys=await caches.keys();
      await Promise.allSettled(keys.filter(key=>key.startsWith('ff-matrix-')||key.startsWith('fantasy-football-')).map(key=>caches.delete(key)));
    }catch(_){ }
    try{await self.registration.unregister();}catch(_){ }
  })());
});
