'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#080808',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-geist-sans, sans-serif)',
    }}>
      <div style={{ fontSize: 96, fontWeight: 900, color: '#F59E0B', lineHeight: 1, marginBottom: 8 }}>
        光
      </div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 48 }}>
        Hikari
      </div>

      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: loading ? 'rgba(255,255,255,0.3)' : '#ededed',
          background: 'transparent',
          border: `1px solid ${loading ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.6)'}`,
          borderRadius: 12,
          padding: '12px 28px',
          cursor: loading ? 'not-allowed' : 'pointer',
          letterSpacing: '0.02em',
          transition: 'border-color 0.15s, color 0.15s',
        }}
      >
        {loading ? 'Přesměrovávám…' : 'Přihlásit se přes Google'}
      </button>
    </div>
  )
}
