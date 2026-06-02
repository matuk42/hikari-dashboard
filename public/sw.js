const CACHE = 'hikari-v1'
const PRECACHE = ['/', '/habits', '/cascade', '/kibou', '/login', '/icon-192.png', '/icon.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
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
  if (url.hostname.includes('supabase') || url.pathname.startsWith('/auth')) return
  // RSC payloads change every request — skip; client renders from loaded JS
  if (url.searchParams.has('_rsc')) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Only cache cacheable responses (no-store responses will throw, catch silently)
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {})
        }
        return res
      })
      .catch(async () => {
        const cached = await caches.match(e.request, { ignoreSearch: true, ignoreVary: true })
        if (cached) return cached
        if (e.request.mode === 'navigate') {
          const shell = await caches.match('/', { ignoreVary: true })
          if (shell) return shell
        }
        // Always return a valid Response — never undefined
        return new Response('', { status: 503, statusText: 'Offline' })
      })
  )
})
