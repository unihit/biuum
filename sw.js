const CACHE_PREFIX='biuum-shell:'+self.registration.scope+':';
const VERSION=CACHE_PREFIX+'v7-in-app-qr';
const ASSETS=['./','./index.html','./styles.css','./connection.css','./theme.css','./app.js','./react-bundle.js','./model.js','./cache.js','./store.js','./google-store.js','./google-errors.js','./setup-link.js','./qr-generator.js','./connection.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./icon-maskable-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(ASSETS))));
// No forced skipWaiting: avoid replacing running save code mid-session.
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url),scope=new URL(self.registration.scope);
  // Google API responses, OAuth, user photos, config files and credentials NEVER enter this cache.
  if(event.request.method!=='GET'||url.origin!==scope.origin||event.request.headers.has('Authorization'))return;
  const path=url.pathname;
  if(!ASSETS.some(asset=>new URL(asset,scope).pathname===path))return;
  const canonical=new Request(url.origin+path);
  event.respondWith(caches.open(VERSION).then(async cache=>{
    const saved=await cache.match(canonical);
    if(saved)return saved;
    const response=await fetch(event.request);if(response.ok)await cache.put(canonical,response.clone());return response;
  }));
});

