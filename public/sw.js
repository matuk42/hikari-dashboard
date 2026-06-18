const CACHE = 'hikari-v4'
const PRECACHE = ['/', '/habits', '/cascade', '/kibou', '/history', '/login', '/icon-192.png', '/icon.png']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(PRECACHE.map(url => c.add(url))))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)

  // Skip: supabase, auth, HMR websocket upgrades
  if (url.hostname.includes('supabase') || url.pathname.startsWith('/auth')) return
  // Skip: RSC payloads — client renders from already-loaded JS
  if (url.searchParams.has('_rsc')) return
  // Skip: Next.js static chunks — immutable hashed assets, browser HTTP cache handles them
  if (url.pathname.startsWith('/_next/static/')) return

  const isNav = e.request.mode === 'navigate'

  // Page navigations bypass the HTTP cache (no-store) so a fresh deploy is picked
  // up the moment the app is reopened — no manual restart. Everything else stays
  // plain network-first. Both fall back to the runtime cache when offline.
  const netFetch = isNav
    ? fetch(url.pathname + url.search, { cache: 'no-store', credentials: 'same-origin' })
    : fetch(e.request)

  e.respondWith(
    netFetch
      .then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {})
        }
        return res
      })
      .catch(async () => {
        const cached = await caches.match(e.request, { ignoreSearch: true, ignoreVary: true })
        if (cached) return cached
        if (isNav) {
          const shell = await caches.match('/', { ignoreVary: true })
          if (shell) return shell
        }
        return new Response('', { status: 503, statusText: 'Offline' })
      })
  )
})
