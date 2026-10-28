const CACHE='oak-phone-cloud-v1';
const ROOT=new URL('./',self.location.href);
const SHELL=['','index.html','config.js','app.js','style.css','manifest.webmanifest','icon-192.png','icon-512.png'].map(p=>new URL(p,ROOT).href);
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('oak-phone-cloud-')&&k!==CACHE)await caches.delete(k);await self.clients.claim();})()));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||!SHELL.includes(e.request.url))return;e.respondWith((async()=>{try{const r=await fetch(e.request);if(r.ok){const c=await caches.open(CACHE);await c.put(e.request,r.clone());}return r;}catch{return (await caches.match(e.request))||(await caches.match(ROOT.href));}})());});
