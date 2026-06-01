'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getProfileId } from '@/lib/profile'

const DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']
const DAY_NUMS = [1, 2, 3, 4, 5, 6, 0]

export function OnboardingModal() {
  const [visible, setVisible] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [schoolDays, setSchoolDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [schoolStart, setSchoolStart] = useState('07:30')
  const [schoolEnd, setSchoolEnd] = useState('14:00')
  const [sleepStart, setSleepStart] = useState('22:00')
  const [sleepEnd, setSleepEnd] = useState('06:15')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      getProfileId(user).then(pid => {
        if (!pid) return
        setProfileId(pid)
        supabase
          .from('profiles')
          .select('onboarded_at, display_name')
          .eq('id', pid)
          .single()
          .then(({ data }) => {
            if (data && !data.onboarded_at) {
              setName(data.display_name ?? '')
              setVisible(true)
            }
          })
      })
    })
  }, [])

  const toggleDay = (n: number) => {
    setSchoolDays(prev =>
      prev.includes(n) ? prev.filter(d => d !== n) : [...prev, n]
    )
  }

  const handleSubmit = async () => {
    if (!profileId) return
    setSaving(true)
    await supabase.from('profiles').update({
      display_name: name.trim() || 'Matyáš',
      school_days: schoolDays,
      school_start: schoolStart,
      school_end: schoolEnd,
      sleep_start: sleepStart,
      sleep_end: sleepEnd,
      onboarded_at: new Date().toISOString(),
    }).eq('id', profileId)
    setSaving(false)
    setVisible(false)
  }

  const handleSkip = async () => {
    if (!profileId) { setVisible(false); return }
    await supabase.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', profileId)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 20px',
      fontFamily: 'var(--font-geist-sans, sans-serif)',
    }}>
      <div style={{
        background: '#111',
        border: '1px solid rgba(245,158,11,0.25)',
        borderRadius: 18,
        padding: '24px 20px',
        maxWidth: 420,
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#F59E0B', marginBottom: 4 }}>光 Vítej</div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 20, lineHeight: 1.5, margin: '0 0 20px' }}>
          Než začneme — řekni Hikari pár věcí o sobě.
        </p>

        <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
          Tvoje jméno
        </label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Matyáš"
          style={{
            display: 'block', width: '100%', marginTop: 6, marginBottom: 16,
            background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, color: '#ededed', fontSize: 14,
            padding: '10px 12px', outline: 'none', boxSizing: 'border-box' as const,
          }}
        />

        <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
          Školní dny
        </label>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, marginBottom: 16, flexWrap: 'wrap' as const }}>
          {DAYS.map((day, i) => {
            const n = DAY_NUMS[i]
            const sel = schoolDays.includes(n)
            return (
              <button
                key={n}
                onClick={() => toggleDay(n)}
                style={{
                  padding: '5px 10px', borderRadius: 8, fontSize: 12,
                  background: sel ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${sel ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  color: sel ? '#F59E0B' : 'rgba(255,255,255,0.35)',
                  cursor: 'pointer', fontWeight: sel ? 600 : 400,
                }}
              >
                {day}
              </button>
            )
          })}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
              Začátek školy
            </label>
            <input
              type="time"
              value={schoolStart}
              onChange={e => setSchoolStart(e.target.value)}
              style={{
                display: 'block', width: '100%', marginTop: 6,
                background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, color: '#ededed', fontSize: 13,
                padding: '9px 10px', outline: 'none', boxSizing: 'border-box' as const,
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
              Konec školy
            </label>
            <input
              type="time"
              value={schoolEnd}
              onChange={e => setSchoolEnd(e.target.value)}
              style={{
                display: 'block', width: '100%', marginTop: 6,
                background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, color: '#ededed', fontSize: 13,
                padding: '9px 10px', outline: 'none', boxSizing: 'border-box' as const,
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
              Spánek začíná
            </label>
            <input
              type="time"
              value={sleepStart}
              onChange={e => setSleepStart(e.target.value)}
              style={{
                display: 'block', width: '100%', marginTop: 6,
                background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, color: '#ededed', fontSize: 13,
                padding: '9px 10px', outline: 'none', boxSizing: 'border-box' as const,
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
              Vstávání
            </label>
            <input
              type="time"
              value={sleepEnd}
              onChange={e => setSleepEnd(e.target.value)}
              style={{
                display: 'block', width: '100%', marginTop: 6,
                background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10, color: '#ededed', fontSize: 13,
                padding: '9px 10px', outline: 'none', boxSizing: 'border-box' as const,
              }}
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{
            width: '100%',
            background: saving ? 'rgba(245,158,11,0.3)' : '#F59E0B',
            color: saving ? 'rgba(255,255,255,0.5)' : '#080808',
            border: 'none', borderRadius: 10, padding: '13px 0',
            fontSize: 14, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Ukládám…' : 'Začít s Hikari →'}
        </button>
      </div>
    </div>
  )
}
