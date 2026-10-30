const CACHE = '21-code-shell-v1'
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    const response = await fetch('/index.html')
    const html = await response.clone().text()
    await cache.put('/index.html', response)
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(match => match[1])
    await cache.addAll(['/', '/icon.svg', '/manifest.webmanifest', ...assets])
    await self.skipWaiting()
  })())
})
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('21-code-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())) })
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => { const copy = response.clone(); void caches.open(CACHE).then(cache => cache.put('/index.html', copy)); return response }).catch(() => caches.match('/index.html')))
  } else {
    event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => { if (response.ok) { const copy = response.clone(); void caches.open(CACHE).then(cache => cache.put(event.request, copy)) } return response })))
  }
})
