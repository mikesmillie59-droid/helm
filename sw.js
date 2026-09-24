'use strict';
// Offline fix 1.2.1: bypass HTTP cache and reject outdated app HTML.
// Cache only the self-contained app, never third-party map/chart tiles.
const VERSION='1.15.0';
const SCOPE=new URL(self.registration.scope);
const PREFIX='helm-shell-'+SCOPE.pathname+'-';
const CACHE=PREFIX+VERSION;
const APP=new URL('index.html',SCOPE).href;
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const response=await fetch(APP,{cache:'reload'});
    if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw Error('App HTML unavailable');
    const text=await response.clone().text();
    if(!text.includes('data-helm-version="'+VERSION+'"'))throw Error('Upload matching index.html and sw.js');
    const cache=await caches.open(CACHE);
    await cache.put(APP,response);
  })());
  // Updates wait for open windows to close; do not interrupt active GPS.
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith(PREFIX)&&name!==CACHE).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||event.request.mode!=='navigate'||
     url.origin!==SCOPE.origin||![SCOPE.pathname,new URL(APP).pathname].includes(url.pathname))return;
  event.respondWith((async()=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch(event.request,{signal:controller.signal,cache:'no-store'});
      if(response.ok&&response.headers.get('content-type')?.includes('text/html')){
        const html=await response.clone().text();
        if(html.includes('data-helm-version="'+VERSION+'"'))return response;
      }
    }catch(e){}finally{clearTimeout(timer);}
    const cache=await caches.open(CACHE),saved=await cache.match(APP);
    return saved||new Response('Helm is not saved offline. Reconnect and reopen the app.',{status:503,headers:{'Content-Type':'text/plain'}});
  })());
});
self.addEventListener('message',event=>{
  if(event.data?.type!=='HELM_OFFLINE_STATUS'||!event.ports[0])return;
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE),saved=await cache.match(APP);
    event.ports[0].postMessage({version:VERSION,ready:!!saved});
  })());
});
