'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { getProfileId } from '@/lib/profile'
import { OfflineBadge } from '@/app/components/OfflineBadge'

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

// Not called at module level — generated in useEffect so Math.random() only runs on client

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

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRect({ width = '100%', height = 16, radius = 8, style: extra }: {
  width?: string | number; height?: number; radius?: number; style?: React.CSSProperties
}) {
  return (
    <div className="skeleton-pulse" style={{ width, height, borderRadius: radius, background: 'rgba(255,255,255,0.08)', flexShrink: 0, ...extra }} />
  )
}

function KibouSkeleton() {
  return (
    <div>
      {/* Sliders card */}
      <div style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '20px 18px 16px', marginBottom: 16 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <SkeletonRect width={80} height={13} radius={6} />
              <SkeletonRect width={32} height={26} radius={6} />
            </div>
            <SkeletonRect height={4} radius={2} />
          </div>
        ))}
        <SkeletonRect height={40} radius={8} style={{ marginBottom: 14 }} />
        <SkeletonRect height={44} radius={10} />
      </div>

      {/* Averages */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 10px' }}>
            <SkeletonRect width="65%" height={9} radius={4} style={{ margin: '0 auto 10px' }} />
            <SkeletonRect width={38} height={14} radius={6} style={{ margin: '0 auto 6px' }} />
            <SkeletonRect width={58} height={9} radius={4} style={{ margin: '0 auto' }} />
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '16px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <SkeletonRect width={80} height={11} radius={4} />
          <SkeletonRect width={80} height={26} radius={8} />
        </div>
        <SkeletonRect height={180} radius={8} />
      </div>
    </div>
  )
}

// ─── Components ───────────────────────────────────────────────────────────────

// Icons live in /public/kibou/. `null` falls back to the text emoji so we can
// ship the page before the asset arrives (currently the case for energy).
type KibouIconKey = 'mood' | 'energy' | 'hope'
const ICON_SRC: Record<KibouIconKey, string | null> = {
  mood:   '/kibou/mood.png',
  energy: null,                // TODO: drop in /kibou/energy.{png,avif} when ready
  hope:   '/kibou/hope.png',
}
const ICON_FALLBACK: Record<KibouIconKey, string> = {
  mood:   '😌',
  energy: '⚡',
  hope:   '🌟',
}

function KibouIcon({ kind, size = 18 }: { kind: KibouIconKey; size?: number }) {
  const src = ICON_SRC[kind]
  if (!src) {
    return <span style={{ fontSize: size, lineHeight: 1 }}>{ICON_FALLBACK[kind]}</span>
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden="true"
      style={{ width: size, height: size, objectFit: 'contain', verticalAlign: 'middle', display: 'inline-block' }}
    />
  )
}

function SliderInput({
  label,
  value,
  onChange,
  iconKind,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  iconKind: KibouIconKey
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <KibouIcon kind={iconKind} size={20} />
          {label}
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
  const [chartData, setChartData] = useState<HopeEntry[]>([])
  const [isPlaceholder, setIsPlaceholder] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  const loadData = useCallback(async (pid: string) => {
    const { data } = await supabase
      .from('hope_logs')
      .select('date, mood, energy, hope, logged_at')
      .eq('profile_id', pid)
      .order('logged_at', { ascending: true })

    if (data && data.length > 0) {
      // Multiple logs per day are allowed — keep the latest per date for the chart
      const byDate = new Map<string, { date: string; mood: number; energy: number; hope: number }>()
      for (const row of data) {
        byDate.set(row.date, { date: row.date, mood: row.mood, energy: row.energy, hope: row.hope })
      }
      const deduped = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
      setChartData(deduped.map(r => ({
        date: new Date(r.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }),
        mood: r.mood,
        energy: r.energy,
        hope: r.hope,
      })))
      setIsPlaceholder(false)
    }

    // Pre-fill from the most recent log today (last in ascending logged_at order)
    const todayLogs = (data ?? []).filter(r => r.date === today)
    const latestToday = todayLogs[todayLogs.length - 1]
    if (latestToday) {
      setMood(latestToday.mood)
      setEnergy(latestToday.energy)
      setHope(latestToday.hope)
    }
  }, [today])

  useEffect(() => {
    setMounted(true)
    // Generate placeholder data client-side only (Math.random() must not run during SSR)
    setChartData(generatePlaceholderData())
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setDataLoaded(true); return }
      getProfileId(user).then(async pid => {
        if (!pid) { setDataLoaded(true); return }
        setProfileId(pid)
        await loadData(pid)
        setDataLoaded(true)
      })
    }).catch(() => setDataLoaded(true))
  }, [loadData])

  async function handleSave() {
    setSaving(true)
    setSavedMsg('')

    if (!profileId) {
      setSavedMsg('Přihlaš se Google účtem pro ukládání dat.')
      setSaving(false)
      return
    }

    const { error } = await supabase.from('hope_logs').insert({
      profile_id: profileId,
      date: today,
      mood,
      energy,
      hope,
      note: note || null,
    })

    if (error) {
      console.error('hope_logs upsert error:', error)
      setSavedMsg('Chyba uložení: ' + error.message)
    } else {
      setSavedMsg('Uloženo ✓')
      await loadData(profileId)
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <OfflineBadge />
            <span style={{ fontSize: 22, fontWeight: 300, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.05em' }}>
              きぼう
            </span>
          </div>
        </header>

        {/* Skeleton + real content */}
        <div style={{ position: 'relative' }}>

          {!dataLoaded && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1, pointerEvents: 'none' }}>
              <KibouSkeleton />
            </div>
          )}

          <div style={{ opacity: dataLoaded ? 1 : 0, transition: 'opacity 0.35s ease' }}>

            {/* ── Sliders ── */}
            <section style={{
              background: '#0e0e0e',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14,
              padding: '20px 18px 16px',
              marginBottom: 16,
            }}>
              <SliderInput label="Mood" value={mood} onChange={setMood} iconKind="mood" />
              <SliderInput label="Energy" value={energy} onChange={setEnergy} iconKind="energy" />
              <SliderInput label="Hope" value={hope} onChange={setHope} iconKind="hope" />

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
                {!mounted ? <div style={{ height: 180 }} /> : <ResponsiveContainer width="100%" height="100%">
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
                </ResponsiveContainer>}
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

          </div>{/* end real content */}
        </div>{/* end relative wrapper */}

      </div>
    </div>
  )
}
