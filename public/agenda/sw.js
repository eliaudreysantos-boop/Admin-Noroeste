const CACHE = 'noroeste-agenda-v2'
const SHELL = ['/agenda/', '/agenda/manifest.json', '/icon-192.png', '/icon-512.png']

async function refreshShell() {
  const cache = await caches.open(CACHE)
  const response = await fetch('/agenda/', { cache:'no-store' })
  if (!response.ok) return
  const html = await response.clone().text()
  await cache.put('/agenda/', response)
  const assets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match => match[1]).filter(path => path.startsWith('/'))
  await Promise.allSettled([...new Set([...SHELL.slice(1), ...assets])].map(path => cache.add(path)))
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(refreshShell))
  self.skipWaiting()
})

self.addEventListener('message', event => {
  if (event.data?.type === 'REFRESH_SHELL') event.waitUntil(refreshShell())
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('noroeste-agenda-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone()
      void caches.open(CACHE).then(cache => cache.put('/agenda/', copy))
      return response
    }).catch(() => caches.match('/agenda/')))
    return
  }
  event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)))
})
