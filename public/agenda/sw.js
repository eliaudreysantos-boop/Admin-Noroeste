const CACHE = 'noroeste-agenda-v4'
const SHELL = ['/agenda/', '/agenda/manifest.json', '/icon-192.png', '/icon-512.png']

const cacheableAsset = path => path.startsWith('/assets/') || SHELL.includes(path)

async function refreshShell() {
  const cache = await caches.open(CACHE)
  const response = await fetch('/agenda/', { cache:'no-store' })
  if (!response.ok) return
  const html = await response.clone().text()
  const assets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match => match[1]).filter(path => path.startsWith('/'))
  const currentShell = [...new Set([...SHELL, ...assets.filter(cacheableAsset)])]
  const downloaded = await Promise.all(currentShell.filter(path => path !== '/agenda/').map(async path => {
    const asset = await fetch(path, { cache:'no-store' })
    if (!asset.ok) throw new Error(`Shell asset unavailable: ${path}`)
    return [path, asset]
  }))
  await Promise.all(downloaded.map(([path, asset]) => cache.put(path, asset)))
  await cache.put('/agenda/', response)
  const keep = new Set(currentShell.map(path => new URL(path, self.location.origin).href))
  const keys = await cache.keys()
  await Promise.all(keys.filter(request => cacheableAsset(new URL(request.url).pathname) && !keep.has(request.url)).map(request => cache.delete(request)))
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
    event.respondWith(caches.match('/agenda/').then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) void caches.open(CACHE).then(cache => cache.put('/agenda/', response.clone()))
      return response
    })))
    return
  }
  event.respondWith(caches.match(event.request).then(async response => {
    if (response) return response
    const network = await fetch(event.request)
    const url = new URL(event.request.url)
    if (event.request.method === 'GET' && url.origin === self.location.origin && cacheableAsset(url.pathname) && network.ok) {
      const copy = network.clone()
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)))
    }
    return network
  }))
})
