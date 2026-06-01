'use client'

import { useState, useEffect } from 'react'

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

export function OfflineBadge() {
  const isOnline = useOnlineStatus()
  if (isOnline) return null
  return (
    <span style={{
      fontSize: 9,
      color: 'rgba(255,100,50,0.7)',
      background: 'rgba(255,100,50,0.08)',
      border: '1px solid rgba(255,100,50,0.15)',
      borderRadius: 5,
      padding: '2px 6px',
      letterSpacing: '0.04em',
      fontWeight: 600,
    }}>
      OFFLINE
    </span>
  )
}
