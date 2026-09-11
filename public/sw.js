const CACHE = 'noroeste-admin-v4'
const ASSETS = ['/', '/index.html'] // vite adiciona o resto no build

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith('noroeste-admin-') && key !== CACHE)
          .map(key => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', e => {
  if (e.data?.type !== 'REFRESH_SHELL') return
  e.waitUntil(fetch('/index.html', { cache:'no-store' }).then(response => response.ok ? caches.open(CACHE).then(cache => cache.put('/index.html', response)) : undefined))
})

self.addEventListener('fetch', e => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          const copy = response.clone()
          void caches.open(CACHE).then(cache => cache.put('/index.html', copy))
          return response
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }

  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  )
})
