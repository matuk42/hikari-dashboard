'use client'

import { useEffect } from 'react'

export default function SwRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // When a newly deployed SW takes control, reload once so the fresh page +
    // chunks are used — no more manual app restart after a deploy. Guarded so it
    // only fires on an *update* (a SW already controlled the page), never on the
    // first-ever install, and never more than once.
    let refreshing = false
    const reload = () => {
      if (refreshing) return
      refreshing = true
      window.location.reload()
    }
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('controllerchange', reload)
    }

    // Register + actively check for a newer SW on every load.
    navigator.serviceWorker.register('/sw.js')
      .then(reg => { reg.update().catch(() => {}) })
      .catch(() => {})

    return () => navigator.serviceWorker.removeEventListener('controllerchange', reload)
  }, [])

  return null
}
