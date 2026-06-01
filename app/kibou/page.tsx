'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface HopeEntry {
  date: string
  mood: number
  energy: number
  hope: number
}

// ─── Placeholder data (shown before real data exists) ────────────────────────

function generatePlaceholderData(): HopeEntry[] {
  const entries: HopeEntry[] = []
  const base = new Date()
  for (let i = 29; i >= 1; i--) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    entries.push({
      date: d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }),
      mood: Math.round(6 + Math.sin(i * 0.6) * 2 + Math.random()),
      energy: Math.round(5 + Math.cos(i * 0.4) * 2 + Math.random()),
      hope: Math.round(7 + Math.sin(i * 0.3 + 1) * 1.5 + Math.random()),
    })
  }
  return entries
}

const PLACEHOLDER_DATA = generatePlaceholderData()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avg(arr: number[]): string {
  if (!arr.length) return '—'
  return (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)
}

function weekEntries(data: HopeEntry[]): HopeEntry[] {
  return data.slice(-7)
}

function monthEntries(data: HopeEntry[]): HopeEntry[] {
  return data.slice(-30)
}

// ─── Components ───────────────────────────────────────────────────────────────

function SliderInput({
  label,
  value,
  onChange,
  emoji,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  emoji: string
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
          {emoji} {label}
        </span>
        <span style={{
          fontSize: 26,
          fontWeight: 800,
          color: '#F59E0B',
          lineHeight: 1,
          minWidth: 32,
          textAlign: 'right',
        }}>
          {value}
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: '100%',
          appearance: 'none',
          height: 4,
          borderRadius: 2,
          background: `linear-gradient(to right, #F59E0B ${(value - 1) * 100 / 9}%, #1a1a1a ${(value - 1) * 100 / 9}%)`,
          outline: 'none',
          cursor: 'pointer',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)' }}>1</span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)' }}>10</span>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KibouPage() {
  const [mood, setMood] = useState(7)
  const [energy, setEnergy] = useState(6)
  const [hope, setHope] = useState(8)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [range, setRange] = useState<'30' | 'all'>('30')
  const [chartData, setChartData] = useState<HopeEntry[]>(PLACEHOLDER_DATA)
  const [isPlaceholder, setIsPlaceholder] = useState(true)
  const [mounted, setMounted] = useState(false)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('hope_logs')
      .select('date, mood, energy, hope')
      .eq('user_id', user.id)
      .order('date', { ascending: true })

    if (data && data.length > 0) {
      setChartData(data.map(r => ({
        date: new Date(r.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }),
        mood: r.mood,
        energy: r.energy,
        hope: r.hope,
      })))
      setIsPlaceholder(false)
    }
  }, [])

  useEffect(() => { setMounted(true); loadData() }, [loadData])

  async function handleSave() {
    setSaving(true)
    setSavedMsg('')
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      setSavedMsg('Přihlaš se Google účtem pro ukládání dat.')
      setSaving(false)
      return
    }

    const today = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('hope_logs').upsert({
      user_id: user.id,
      date: today,
      mood,
      energy,
      hope,
      note: note || null,
    }, { onConflict: 'user_id,date' })

    if (error) {
      setSavedMsg('Chyba uložení: ' + error.message)
    } else {
      setSavedMsg('Uloženo ✓')
      await loadData()
    }
    setSaving(false)
  }

  const displayData = range === '30' ? monthEntries(chartData) : chartData
  const weekData = weekEntries(chartData)
  const monthData = monthEntries(chartData)

  return (
    <div style={{
      minHeight: '100vh',
      background: '#080808',
      color: '#ededed',
      fontFamily: 'var(--font-geist-sans, sans-serif)',
    }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px 80px' }}>

        {/* ── Header ── */}
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 14,
          paddingBottom: 24,
        }}>
          <Link href="/" style={{
            fontSize: 17,
            fontWeight: 700,
            color: '#F59E0B',
            textDecoration: 'none',
            letterSpacing: '0.02em',
          }}>
            光 Hikari
          </Link>
          <span style={{ fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.05em' }}>
            きぼう
          </span>
        </header>

        {/* ── Sliders ── */}
        <section style={{
          background: '#0e0e0e',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          padding: '20px 18px 16px',
          marginBottom: 16,
        }}>
          <SliderInput label="Mood" value={mood} onChange={setMood} emoji="😌" />
          <SliderInput label="Energy" value={energy} onChange={setEnergy} emoji="⚡" />
          <SliderInput label="Hope" value={hope} onChange={setHope} emoji="🌟" />

          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Poznámka pro Hikari — co se dnes dělo? (volitelné)"
            rows={2}
            style={{
              width: '100%',
              background: '#141414',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              color: 'rgba(255,255,255,0.65)',
              fontSize: 12,
              padding: '10px 12px',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              marginBottom: 14,
            }}
          />

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%',
              background: saving ? 'rgba(245,158,11,0.3)' : '#F59E0B',
              color: saving ? 'rgba(255,255,255,0.5)' : '#080808',
              border: 'none',
              borderRadius: 10,
              padding: '12px 0',
              fontSize: 14,
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              letterSpacing: '0.02em',
              transition: 'background 0.15s',
            }}
          >
            {saving ? 'Ukládám…' : 'Uložit dnes'}
          </button>

          {savedMsg && (
            <p style={{
              textAlign: 'center',
              fontSize: 12,
              marginTop: 10,
              color: savedMsg.startsWith('Uloženo') ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)',
            }}>
              {savedMsg}
            </p>
          )}
        </section>

        {/* ── Averages ── */}
        <section style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
          marginBottom: 16,
        }}>
          {[
            {
              label: 'Tento týden',
              mood: avg(weekData.map(d => d.mood)),
              energy: avg(weekData.map(d => d.energy)),
              hope: avg(weekData.map(d => d.hope)),
            },
            {
              label: 'Tento měsíc',
              mood: avg(monthData.map(d => d.mood)),
              energy: avg(monthData.map(d => d.energy)),
              hope: avg(monthData.map(d => d.hope)),
            },
            {
              label: 'Celkový',
              mood: avg(chartData.map(d => d.mood)),
              energy: avg(chartData.map(d => d.energy)),
              hope: avg(chartData.map(d => d.hope)),
            },
          ].map(stat => (
            <div key={stat.label} style={{
              background: '#0e0e0e',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12,
              padding: '12px 10px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#F59E0B' }}>{stat.hope}</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>
                😌{stat.mood} ⚡{stat.energy}
              </div>
            </div>
          ))}
        </section>

        {/* ── Trend chart ── */}
        <section style={{
          position: 'relative',
          background: '#0e0e0e',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 14,
          padding: '16px 4px 12px',
          marginBottom: 16,
          overflow: 'hidden',
        }}>
          {/* Luffy silhouette */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/luffy.jpg"
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: '50%',
              right: -10,
              transform: 'translateY(-50%)',
              height: 180,
              width: 'auto',
              pointerEvents: 'none',
              filter: 'invert(1) grayscale(1)',
              mixBlendMode: 'screen',
              opacity: 0.06,
              zIndex: 0,
            }}
          />

          {/* Toggle */}
          <div style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 14px',
            marginBottom: 12,
          }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Trend {isPlaceholder ? '· ukázková data' : ''}
            </span>
            <div style={{ display: 'flex', gap: 2, background: '#141414', borderRadius: 8, padding: 2 }}>
              {(['30', 'all'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  style={{
                    fontSize: 11,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: 'none',
                    cursor: 'pointer',
                    background: range === r ? '#F59E0B' : 'transparent',
                    color: range === r ? '#080808' : 'rgba(255,255,255,0.3)',
                    fontWeight: range === r ? 700 : 400,
                    transition: 'all 0.15s',
                  }}
                >
                  {r === '30' ? '30 dní' : 'Vše'}
                </button>
              ))}
            </div>
          </div>

          {/* Chart */}
          <div style={{ position: 'relative', zIndex: 1, width: '100%', height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={displayData} margin={{ top: 4, right: 14, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.2)' }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.floor(displayData.length / 5)}
                />
                <YAxis
                  domain={[1, 10]}
                  tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.2)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#111',
                    border: '1px solid rgba(245,158,11,0.2)',
                    borderRadius: 8,
                    fontSize: 11,
                    color: '#ededed',
                  }}
                  labelStyle={{ color: 'rgba(255,255,255,0.4)' }}
                />
                <Line type="monotone" dataKey="hope" stroke="#F59E0B" strokeWidth={2} dot={false} name="Hope" />
                <Line type="monotone" dataKey="energy" stroke="rgba(245,158,11,0.4)" strokeWidth={1.5} dot={false} name="Energy" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="mood" stroke="rgba(245,158,11,0.25)" strokeWidth={1.5} dot={false} name="Mood" strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            gap: 14,
            justifyContent: 'center',
            padding: '0 14px',
            marginTop: 6,
          }}>
            {[
              { label: 'Hope', color: '#F59E0B', dash: false },
              { label: 'Energy', color: 'rgba(245,158,11,0.4)', dash: true },
              { label: 'Mood', color: 'rgba(245,158,11,0.25)', dash: true },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 18,
                  height: 2,
                  background: l.color,
                  borderRadius: 1,
                }} />
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{l.label}</span>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  )
}
