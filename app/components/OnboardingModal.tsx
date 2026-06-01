'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getProfileId } from '@/lib/profile'

const DAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']
const DAY_NUMS = [1, 2, 3, 4, 5, 6, 0]

const STEP_TITLES = ['Jak ti říkají?', 'Škola', 'Spánek']

const label: React.CSSProperties = {
  fontSize: 11,
  color: 'rgba(255,255,255,0.35)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const input: React.CSSProperties = {
  display: 'block',
  width: '100%',
  marginTop: 6,
  background: '#111',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: '#ededed',
  fontSize: 14,
  padding: '11px 12px',
  outline: 'none',
  boxSizing: 'border-box',
}

const timeInput: React.CSSProperties = {
  ...input,
  fontSize: 13,
  padding: '10px 10px',
}

export function OnboardingModal() {
  const [visible, setVisible] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [step, setStep] = useState(1)
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

  const toggleDay = (n: number) =>
    setSchoolDays(prev => prev.includes(n) ? prev.filter(d => d !== n) : [...prev, n])

  const handleFinish = async () => {
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

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 20px',
      fontFamily: 'var(--font-geist-sans, sans-serif)',
    }}>
      <div style={{
        background: '#0e0e0e',
        border: '1px solid rgba(245,158,11,0.2)',
        borderRadius: 20,
        padding: '28px 22px',
        maxWidth: 420,
        width: '100%',
      }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#F59E0B' }}>光 Hikari</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)', letterSpacing: '0.06em' }}>
            {step}&thinsp;/&thinsp;3
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, marginBottom: 26 }}>
          <div style={{
            height: '100%',
            width: `${(step / 3) * 100}%`,
            background: '#F59E0B',
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }} />
        </div>

        {/* Step title */}
        <p style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>
          {STEP_TITLES[step - 1]}
        </p>

        {/* ── Step 1: Jméno ── */}
        {step === 1 && (
          <>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', margin: '0 0 22px', lineHeight: 1.5 }}>
              Hikari tě bude oslovovat tímhle jménem.
            </p>
            <label style={label}>Jméno / přezdívka</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Matyáš"
              autoFocus
              style={input}
            />
          </>
        )}

        {/* ── Step 2: Škola ── */}
        {step === 2 && (
          <>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', margin: '0 0 22px', lineHeight: 1.5 }}>
              Kdy máš školu? Hikari bude vědět kdy jsi volný.
            </p>
            <label style={label}>Dny výuky</label>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, marginBottom: 20, flexWrap: 'wrap' }}>
              {DAYS.map((day, i) => {
                const n = DAY_NUMS[i]
                const sel = schoolDays.includes(n)
                return (
                  <button
                    key={n}
                    onClick={() => toggleDay(n)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 13,
                      background: sel ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${sel ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.08)'}`,
                      color: sel ? '#F59E0B' : 'rgba(255,255,255,0.35)',
                      cursor: 'pointer',
                      fontWeight: sel ? 600 : 400,
                    }}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={label}>Začátek školy</label>
                <input type="time" value={schoolStart} onChange={e => setSchoolStart(e.target.value)} style={timeInput} />
              </div>
              <div>
                <label style={label}>Konec školy</label>
                <input type="time" value={schoolEnd} onChange={e => setSchoolEnd(e.target.value)} style={timeInput} />
              </div>
            </div>
          </>
        )}

        {/* ── Step 3: Spánek ── */}
        {step === 3 && (
          <>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', margin: '0 0 22px', lineHeight: 1.5 }}>
              Základ pro tvůj denní rozvrh.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={label}>Jdu spát</label>
                <input type="time" value={sleepStart} onChange={e => setSleepStart(e.target.value)} style={timeInput} />
              </div>
              <div>
                <label style={label}>Vstávám</label>
                <input type="time" value={sleepEnd} onChange={e => setSleepEnd(e.target.value)} style={timeInput} />
              </div>
            </div>
          </>
        )}

        {/* Buttons */}
        <div style={{ marginTop: 28 }}>
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              style={{
                width: '100%',
                background: '#F59E0B',
                color: '#080808',
                border: 'none', borderRadius: 12, padding: '14px 0',
                fontSize: 15, fontWeight: 700, cursor: 'pointer',
              }}
            >
              Další →
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={saving}
              style={{
                width: '100%',
                background: saving ? 'rgba(245,158,11,0.3)' : '#F59E0B',
                color: saving ? 'rgba(255,255,255,0.5)' : '#080808',
                border: 'none', borderRadius: 12, padding: '14px 0',
                fontSize: 15, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Ukládám…' : 'Začít s Hikari →'}
            </button>
          )}
          {step > 1 && (
            <button
              onClick={() => setStep(s => s - 1)}
              disabled={saving}
              style={{
                width: '100%', marginTop: 10,
                background: 'transparent',
                color: 'rgba(255,255,255,0.28)',
                border: 'none', padding: '10px 0',
                fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              ← Zpět
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
