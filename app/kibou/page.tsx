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

// One intraday check-in, positioned on the day's time axis.
interface CheckinPoint {
  h: number          // hour-of-day decimal (e.g. 14.5) — X position on the curve
  timeLabel: string  // "14:30"
  mood: number
  energy: number
  hope: number
  note: string | null
}

interface Correlation {
  tag: string
  energyDelta: number
  moodDelta: number
  hopeDelta: number
  sample: number
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

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function fmtDelta(n: number): string {
  return (n > 0 ? '+' : '') + n.toFixed(1)
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
  energy: '/kibou/energy.png',
  hope:   '/kibou/hope.png',
}
const ICON_FALLBACK: Record<KibouIconKey, string> = {
  mood:   '😌',
  energy: '⚡',
  hope:   '🌟',
}

function KibouIcon({ kind, size = 18 }: { kind: KibouIconKey; size?: number }) {
  const src = ICON_SRC[kind]
  // Fixed square box so the three icons share width — without it, contain-fit on
  // different aspect ratios (mood ≈ square, bolt = thin, All Might = tall)
  // shifts the labels by several pixels per row and breaks visual rhythm.
  const box: React.CSSProperties = {
    width: size, height: size, flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    verticalAlign: 'middle',
  }
  if (!src) {
    return <span style={{ ...box, fontSize: size, lineHeight: 1 }}>{ICON_FALLBACK[kind]}</span>
  }
  return (
    <span style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
      />
    </span>
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
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <KibouIcon kind={iconKind} size={18} />
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

// Tooltip for the intraday curve — shows the time + note of the check-in.
interface CurveTooltipProps {
  active?: boolean
  payload?: Array<{ payload: CheckinPoint }>
}
function CurveTooltip({ active, payload }: CurveTooltipProps) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div style={{ background: '#111', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#ededed', maxWidth: 200 }}>
      <div style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{p.timeLabel}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><KibouIcon kind="hope" size={12} />{p.hope}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><KibouIcon kind="energy" size={12} />{p.energy}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><KibouIcon kind="mood" size={12} />{p.mood}</span>
      </div>
      {p.note && <div style={{ color: 'rgba(255,255,255,0.45)', marginTop: 4, fontStyle: 'italic' }}>„{p.note}"</div>}
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

  // Intraday curve state
  const [curveDate, setCurveDate] = useState<string>(ymd(new Date()))
  const [curve, setCurve] = useState<CheckinPoint[]>([])
  const [correlations, setCorrelations] = useState<Correlation[]>([])

  const today = ymd(new Date())

  // Load the intraday curve (check-ins) for a given day.
  const loadCurve = useCallback(async (pid: string, date: string) => {
    const { data, error } = await supabase
      .from('hope_checkins')
      .select('ts, mood, energy, hope, note')
      .eq('profile_id', pid)
      .eq('date', date)
      .order('ts', { ascending: true })

    // Table missing (pre-migration) or empty → clear curve, no crash
    if (error || !data) { setCurve([]); return }

    setCurve(data.map(r => {
      const d = new Date(r.ts as string)
      return {
        h: d.getHours() + d.getMinutes() / 60,
        timeLabel: d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }),
        mood: r.mood as number,
        energy: r.energy as number,
        hope: r.hope as number,
        note: (r.note as string) ?? null,
      }
    }))
  }, [])

  const loadData = useCallback(async (pid: string) => {
    // Daily trend (rollup) from hope_logs
    const { data } = await supabase
      .from('hope_logs')
      .select('date, mood, energy, hope, logged_at')
      .eq('profile_id', pid)
      .order('date', { ascending: true })

    if (data && data.length > 0) {
      const deduped = [...data].sort((a, b) => (a.date as string).localeCompare(b.date as string))
      setChartData(deduped.map(r => ({
        date: new Date(r.date as string).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }),
        mood: r.mood as number,
        energy: r.energy as number,
        hope: r.hope as number,
      })))
      setIsPlaceholder(false)
    }

    // Today's intraday curve + pre-fill sliders from the latest check-in
    await loadCurve(pid, today)
    const { data: todayCi } = await supabase
      .from('hope_checkins')
      .select('mood, energy, hope, ts')
      .eq('profile_id', pid)
      .eq('date', today)
      .order('ts', { ascending: true })
    const latest = todayCi?.[todayCi.length - 1]
    if (latest) {
      setMood(latest.mood as number)
      setEnergy(latest.energy as number)
      setHope(latest.hope as number)
    }

    // Activity → HOPE correlations (filled by the morning cron)
    const { data: corr } = await supabase
      .from('hope_correlations')
      .select('activity_tag, avg_energy_delta, avg_mood_delta, avg_hope_delta, sample_size')
      .eq('profile_id', pid)
    if (corr) {
      setCorrelations(corr.map(c => ({
        tag: c.activity_tag as string,
        energyDelta: Number(c.avg_energy_delta ?? 0),
        moodDelta: Number(c.avg_mood_delta ?? 0),
        hopeDelta: Number(c.avg_hope_delta ?? 0),
        sample: c.sample_size as number,
      })).sort((a, b) => b.energyDelta - a.energyDelta))
    }
  }, [today, loadCurve])

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

  // Re-fetch the curve when the user steps to another day
  useEffect(() => {
    if (profileId) loadCurve(profileId, curveDate)
  }, [profileId, curveDate, loadCurve])

  // Recompute today's hope_logs rollup = average of today's check-ins. Keeps the
  // 30d trend / averages / energy axis / pattern detection working unchanged.
  async function rollupToday(pid: string) {
    const { data } = await supabase
      .from('hope_checkins')
      .select('mood, energy, hope, note, ts')
      .eq('profile_id', pid)
      .eq('date', today)
      .order('ts', { ascending: true })
    if (!data?.length) return
    const round = (k: 'mood' | 'energy' | 'hope') =>
      Math.round(data.reduce((s, r) => s + (r[k] as number), 0) / data.length)
    const lastNote = [...data].reverse().find(r => r.note)?.note ?? null
    await supabase.from('hope_logs').upsert({
      profile_id: pid,
      date: today,
      mood: round('mood'),
      energy: round('energy'),
      hope: round('hope'),
      note: lastNote,
      logged_at: new Date().toISOString(),
    }, { onConflict: 'profile_id,date' })
  }

  async function handleSave() {
    setSaving(true)
    setSavedMsg('')

    if (!profileId) {
      setSavedMsg('Přihlaš se Google účtem pro ukládání dat.')
      setSaving(false)
      return
    }

    // Each save APPENDS a timestamped check-in (no overwrite). The daily number is
    // derived as the average via rollupToday().
    const { error } = await supabase.from('hope_checkins').insert({
      profile_id: profileId,
      date: today,
      ts: new Date().toISOString(),
      mood,
      energy,
      hope,
      note: note.trim() || null,
    })

    if (error) {
      console.error('hope_checkins insert error:', error)
      setSavedMsg('Chyba uložení: ' + error.message)
      setSaving(false)
      return
    }

    await rollupToday(profileId)
    setSavedMsg('Zaznamenáno ✓')
    setNote('')
    // Make sure the curve we refresh is today's
    setCurveDate(today)
    await loadData(profileId)
    setSaving(false)
  }

  const displayData = range === '30' ? monthEntries(chartData) : chartData
  const weekData = weekEntries(chartData)
  const monthData = monthEntries(chartData)

  const isToday = curveDate === today
  const curveDateLabel = isToday
    ? 'Dnes'
    : new Date(curveDate).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' })

  function stepDay(delta: number) {
    const d = new Date(curveDate)
    d.setDate(d.getDate() + delta)
    const next = ymd(d)
    if (next > today) return   // no future
    setCurveDate(next)
  }

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
                placeholder="Co se právě dělo? — les, škola, kytara… (volitelné, ale krmí korelace)"
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
                {saving ? 'Ukládám…' : 'Zaznamenat teď'}
              </button>

              <p style={{ textAlign: 'center', fontSize: 10, marginTop: 8, color: 'rgba(255,255,255,0.25)' }}>
                Můžeš zaznamenat vícekrát denně — ráno, po škole, večer.
              </p>

              {savedMsg && (
                <p style={{
                  textAlign: 'center',
                  fontSize: 12,
                  marginTop: 6,
                  color: savedMsg.startsWith('Zaznamenáno') ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)',
                }}>
                  {savedMsg}
                </p>
              )}
            </section>

            {/* ── Intraday curve (energetický oblouk dne) ── */}
            <section style={{
              position: 'relative',
              background: '#0e0e0e',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14,
              padding: '16px 4px 12px',
              marginBottom: 16,
              overflow: 'hidden',
            }}>
              {/* Day stepper */}
              <div style={{
                position: 'relative', zIndex: 1,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0 14px', marginBottom: 12,
              }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Oblouk dne
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => stepDay(-1)} style={stepBtn}>‹</button>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', minWidth: 64, textAlign: 'center' }}>
                    {curveDateLabel}
                  </span>
                  <button onClick={() => stepDay(1)} disabled={isToday} style={{ ...stepBtn, opacity: isToday ? 0.25 : 1 }}>›</button>
                </div>
              </div>

              {curve.length === 0 ? (
                <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px', textAlign: 'center' }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
                    {isToday
                      ? 'Zatím žádný check-in dnes. Zaznamenej, jak se teď cítíš — a klidně znovu po škole, večer.'
                      : 'Pro tento den nejsou žádné check-iny.'}
                  </span>
                </div>
              ) : (
                <>
                  <div style={{ position: 'relative', zIndex: 1, width: '100%', height: 170 }}>
                    {!mounted ? <div style={{ height: 170 }} /> : <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={curve} margin={{ top: 6, right: 16, left: -20, bottom: 0 }}>
                        <XAxis
                          dataKey="h"
                          type="number"
                          domain={[6, 22]}
                          ticks={[6, 9, 12, 15, 18, 21]}
                          tickFormatter={(h: number) => `${String(h).padStart(2, '0')}:00`}
                          tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.2)' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          domain={[1, 10]}
                          tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.2)' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip content={<CurveTooltip />} />
                        <Line type="monotone" dataKey="hope" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3, fill: '#F59E0B' }} name="Hope" />
                        <Line type="monotone" dataKey="energy" stroke="rgba(245,158,11,0.55)" strokeWidth={1.5} dot={{ r: 2.5, fill: 'rgba(245,158,11,0.55)' }} name="Energy" />
                        <Line type="monotone" dataKey="mood" stroke="rgba(245,158,11,0.3)" strokeWidth={1.5} dot={{ r: 2.5, fill: 'rgba(245,158,11,0.3)' }} name="Mood" strokeDasharray="4 4" />
                      </LineChart>
                    </ResponsiveContainer>}
                  </div>

                  {/* Check-in list (time · note) */}
                  <div style={{ position: 'relative', zIndex: 1, padding: '8px 14px 0', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {curve.map((c, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11 }}>
                        <span style={{ color: '#F59E0B', fontWeight: 600, minWidth: 38 }}>{c.timeLabel}</span>
                        <span style={{ color: 'rgba(255,255,255,0.35)', minWidth: 70 }}>🌟{c.hope} ⚡{c.energy} 😌{c.mood}</span>
                        {c.note && <span style={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>„{c.note}"</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* ── Activity → HOPE correlations ── */}
            <section style={{
              background: '#0e0e0e',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 14,
              padding: '16px 16px 14px',
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
                Co ti hýbe energií
              </div>
              {correlations.length === 0 ? (
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
                  Hikari sbírá data. Zaznamenávej během dne s krátkou poznámkou („les", „po škole", „kytara") — za pár dní tu uvidíš, co tě zvedá a co sráží.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {correlations.map(c => {
                    const up = c.energyDelta >= 0
                    return (
                      <div key={c.tag} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', textTransform: 'capitalize', minWidth: 90 }}>
                          {c.tag}
                        </span>
                        <div style={{ flex: 1, height: 4, background: '#1a1a1a', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
                          <div style={{
                            position: 'absolute', top: 0, bottom: 0,
                            left: up ? '50%' : undefined, right: up ? undefined : '50%',
                            width: `${Math.min(Math.abs(c.energyDelta) / 4, 1) * 50}%`,
                            background: up ? '#F59E0B' : 'rgba(239,68,68,0.7)',
                          }} />
                          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,0.12)' }} />
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 700, minWidth: 56, textAlign: 'right',
                          color: up ? '#F59E0B' : 'rgba(239,68,68,0.85)',
                        }}>
                          {fmtDelta(c.energyDelta)} ⚡
                        </span>
                      </div>
                    )
                  })}
                  <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>
                    Změna energie mezi po sobě jdoucími check-iny. Z poznámek (tag dělá Hikari ráno).
                  </p>
                </div>
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
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#F59E0B', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <KibouIcon kind="hope" size={10} />
                    {stat.hope}
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <KibouIcon kind="mood" size={8} />
                      {stat.mood}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <KibouIcon kind="energy" size={8} />
                      {stat.energy}
                    </span>
                  </div>
                </div>
              ))}
            </section>

            {/* ── Trend chart (denní rollup) ── */}
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

const stepBtn: React.CSSProperties = {
  background: '#141414',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6,
  color: 'rgba(255,255,255,0.6)',
  width: 24,
  height: 24,
  fontSize: 14,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
}
