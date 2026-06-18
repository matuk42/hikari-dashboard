'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getProfileId } from '@/lib/profile'

// ─── LocalStorage keys (shared with /habits) ──────────────────────────────────

const LS_PROFILE_ID = 'hikari_profile_id'

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'done' | 'fail' | 'partial' | 'unknown' | 'rest'

interface HabitLite {
  id: string
  name: string
}

interface LogRow {
  habit_id: string
  date: string      // "YYYY-MM-DD"
  status: Status
}

type Mode = 'all' | string   // 'all' or a habit id

// ─── Date helpers ─────────────────────────────────────────────────────────────

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function todayISO(): string {
  const d = new Date()
  return iso(d.getFullYear(), d.getMonth(), d.getDate())
}

const MONTHS_CZ = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']
const WEEKDAYS_CZ = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne']

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Monday-first weekday index (0 = Mon … 6 = Sun) of the month's 1st day. */
function firstWeekdayMonFirst(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7
}

function formatCzDay(isoStr: string): string {
  const [y, m, d] = isoStr.split('-').map(Number)
  const dow = WEEKDAYS_CZ[(new Date(y, m - 1, d).getDay() + 6) % 7]
  return `${dow} ${d}. ${MONTHS_CZ[m - 1]}`
}

// ─── Heat color ───────────────────────────────────────────────────────────────

const EMPTY_CELL = 'rgba(255,255,255,0.045)'
const FUTURE_CELL = 'transparent'

// Rest day = intentional skip (e.g. a 3×/week habit on its off days). Rendered as
// a dimmer gold than "done" + a dashed border, so it reads as "ok, but not a win".
const REST_FILL = 'rgba(245,158,11,0.13)'
const REST_BORDER = 'rgba(245,158,11,0.5)'

interface CellStyle { color: string; dashed: boolean }

/** Overall mode: gold intensity by fraction of habits done that day. */
function overallColor(doneCount: number, denom: number): string {
  if (doneCount <= 0) return EMPTY_CELL
  const r = denom > 0 ? doneCount / denom : 0
  if (r <= 0.25) return 'rgba(245,158,11,0.20)'
  if (r <= 0.50) return 'rgba(245,158,11,0.40)'
  if (r <= 0.75) return 'rgba(245,158,11,0.64)'
  return 'rgba(245,158,11,0.92)'
}

/** Overall mode cell: gold intensity by done count; pure-rest days read as dashed. */
function overallCell(done: number, rest: number, denom: number): CellStyle {
  if (done > 0) return { color: overallColor(done, denom), dashed: false }
  if (rest > 0) return { color: REST_FILL, dashed: true }
  return { color: EMPTY_CELL, dashed: false }   // fail / nothing → empty (no red)
}

/** Per-habit mode cell: semantic style by that day's status. No 'fail' color any more. */
function habitCell(status: Status | undefined): CellStyle {
  switch (status) {
    case 'done': return { color: 'rgba(245,158,11,0.90)', dashed: false }
    case 'partial': return { color: 'rgba(245,158,11,0.42)', dashed: false }
    case 'rest': return { color: REST_FILL, dashed: true }
    default: return { color: EMPTY_CELL, dashed: false }   // fail / unknown / none → empty
  }
}

// ─── Data loaders ─────────────────────────────────────────────────────────────

async function loadHabitsLite(profileId: string): Promise<HabitLite[]> {
  const { data } = await supabase
    .from('habits')
    .select('id, name, category')
    .eq('profile_id', profileId)
  return (data ?? [])
    .filter(h => h.category !== 'retired')
    .map(h => ({ id: h.id as string, name: h.name as string }))
}

async function loadMonthLogs(habitIds: string[], first: string, last: string): Promise<LogRow[]> {
  if (!habitIds.length) return []
  const { data } = await supabase
    .from('habit_logs')
    .select('habit_id, date, status')
    .in('habit_id', habitIds)
    .gte('date', first)
    .lte('date', last)
  return (data ?? []) as LogRow[]
}

// ─── Luffy figure (opacity 0.05 per PRD for /history) ─────────────────────────

function StrawHatFigure() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/luffy.jpg"
      alt=""
      aria-hidden="true"
      style={{
        position: 'absolute', top: '46%', left: '50%',
        transform: 'translate(-50%, -50%)', height: 240, width: 'auto',
        pointerEvents: 'none', userSelect: 'none', zIndex: 0,
        filter: 'invert(1) grayscale(1)', mixBlendMode: 'screen', opacity: 0.05,
      }}
    />
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CalendarSkeleton() {
  return (
    <div>
      <div className="skeleton-pulse" style={{ height: 34, width: 160, borderRadius: 8, background: 'rgba(255,255,255,0.08)', margin: '0 auto 24px' }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="skeleton-pulse" style={{ aspectRatio: '1', borderRadius: 8, background: 'rgba(255,255,255,0.06)' }} />
        ))}
      </div>
    </div>
  )
}

// ─── Day cell ─────────────────────────────────────────────────────────────────

function DayCell({ day, color, dashed, isToday, isFuture, selected, onClick }: {
  day: number; color: string; dashed: boolean; isToday: boolean; isFuture: boolean
  selected: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={isFuture ? undefined : onClick}
      disabled={isFuture}
      style={{
        position: 'relative', aspectRatio: '1', borderRadius: 8,
        background: isFuture ? FUTURE_CELL : color,
        border: selected
          ? '1.5px solid #F59E0B'
          : dashed
            ? `1.5px dashed ${REST_BORDER}`
            : isToday
              ? '1.5px solid rgba(245,158,11,0.45)'
              : '1px solid rgba(255,255,255,0.04)',
        cursor: isFuture ? 'default' : 'pointer',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
        padding: 4, transition: 'background 0.2s ease, border-color 0.15s ease',
      }}
      aria-label={`Den ${day}`}
    >
      <span style={{
        fontSize: 9, lineHeight: 1, fontWeight: 600,
        color: isFuture ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.32)',
      }}>
        {day}
      </span>
    </button>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const now = useMemo(() => new Date(), [])
  const today = todayISO()

  const [profileId, setProfileId] = useState<string | null>(null)
  const [habits, setHabits] = useState<HabitLite[]>([])
  const [mode, setMode] = useState<Mode>('all')
  const [view, setView] = useState<{ year: number; month: number }>({ year: now.getFullYear(), month: now.getMonth() })
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Per-month log cache so navigating back and forth doesn't refetch.
  const cache = useRef<Map<string, LogRow[]>>(new Map())

  const monthKey = `${view.year}-${view.month}`
  const isCurrentMonth = view.year === now.getFullYear() && view.month === now.getMonth()

  // Resolve profile + habit list once.
  useEffect(() => {
    const lsPid = localStorage.getItem(LS_PROFILE_ID)
    if (lsPid) setProfileId(lsPid)

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user
      if (!user) { setLoaded(true); return }
      const pid = await getProfileId(user).catch(() => null)
      if (!pid) { setLoaded(true); return }
      setProfileId(pid)
      localStorage.setItem(LS_PROFILE_ID, pid)
      const list = await loadHabitsLite(pid).catch(() => [])
      setHabits(list)
    }).catch(() => setLoaded(true))
  }, [])

  // Fetch logs for the visible month (cached).
  useEffect(() => {
    if (!profileId || !habits.length) { setLoaded(true); return }
    const first = iso(view.year, view.month, 1)
    const last = iso(view.year, view.month, daysInMonth(view.year, view.month))
    const cached = cache.current.get(monthKey)
    if (cached) { setLogs(cached); setLoaded(true); return }

    let cancelled = false
    setLoaded(false)
    loadMonthLogs(habits.map(h => h.id), first, last)
      .then(rows => {
        if (cancelled) return
        cache.current.set(monthKey, rows)
        setLogs(rows)
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [profileId, habits, view.year, view.month, monthKey])

  // Per-day aggregates for the visible month.
  const dayData = useMemo(() => {
    // date → { doneCount, restCount, statusByHabit }
    const map = new Map<string, { done: number; rest: number; byHabit: Map<string, Status> }>()
    for (const l of logs) {
      let entry = map.get(l.date)
      if (!entry) { entry = { done: 0, rest: 0, byHabit: new Map() }; map.set(l.date, entry) }
      entry.byHabit.set(l.habit_id, l.status)
      if (l.status === 'done') entry.done++
      else if (l.status === 'rest') entry.rest++
    }
    return map
  }, [logs])

  // Denominator for overall intensity: the bigger of current habit count and the
  // busiest day this month — so a high-activity month still reaches full gold even
  // if the habit set has grown since.
  const denom = useMemo(() => {
    let maxDone = 0
    for (const v of dayData.values()) maxDone = Math.max(maxDone, v.done)
    return Math.max(habits.length, maxDone, 1)
  }, [dayData, habits.length])

  // Month summary.
  const summary = useMemo(() => {
    let totalDone = 0
    let activeDays = 0
    let bestDay = 0
    for (const v of dayData.values()) {
      totalDone += v.done
      if (v.done > 0) activeDays++
      bestDay = Math.max(bestDay, v.done)
    }
    return { totalDone, activeDays, bestDay }
  }, [dayData])

  const goPrev = () => {
    setSelectedDay(null)
    setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 })
  }
  const goNext = () => {
    if (isCurrentMonth) return
    setSelectedDay(null)
    setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 })
  }

  const habitName = useCallback((id: string) => habits.find(h => h.id === id)?.name ?? '?', [habits])

  // Build the calendar grid (leading blanks + day cells).
  const grid = useMemo(() => {
    const lead = firstWeekdayMonFirst(view.year, view.month)
    const total = daysInMonth(view.year, view.month)
    const cells: Array<{ day: number | null }> = []
    for (let i = 0; i < lead; i++) cells.push({ day: null })
    for (let d = 1; d <= total; d++) cells.push({ day: d })
    return cells
  }, [view.year, view.month])

  // Detail for the selected day.
  const selectedDetail = useMemo(() => {
    if (!selectedDay) return null
    const entry = dayData.get(selectedDay)
    const done: string[] = []
    const fail: string[] = []
    if (entry) {
      for (const [hid, st] of entry.byHabit) {
        if (st === 'done') done.push(habitName(hid))
        else if (st === 'fail') fail.push(habitName(hid))
      }
    }
    done.sort(); fail.sort()
    return { done, fail }
  }, [selectedDay, dayData, habitName])

  return (
    <div style={{ minHeight: '100vh', color: '#ededed', overflowX: 'hidden' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px 80px' }}>

        {/* Header */}
        <header style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', paddingTop: 14, paddingBottom: 24 }}>
          <Link href="/" style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.02em', color: '#F59E0B', textDecoration: 'none' }}>
            光 Hikari
          </Link>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 500, whiteSpace: 'nowrap' }}>Historie</span>
          <Link href="/habits" style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textDecoration: 'none', textAlign: 'right' }}>
            Habity →
          </Link>
        </header>

        {/* Mode selector: Vše + per-habit chips */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 18, scrollbarWidth: 'none' }}>
          <ModeChip label="Vše" active={mode === 'all'} onClick={() => { setMode('all'); setSelectedDay(null) }} />
          {habits.map(h => (
            <ModeChip key={h.id} label={h.name} active={mode === h.id} onClick={() => { setMode(h.id); setSelectedDay(null) }} />
          ))}
        </div>

        <div style={{ position: 'relative' }}>
          <StrawHatFigure />

          {/* Month nav */}
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <NavArrow dir="prev" onClick={goPrev} disabled={false} />
            <span style={{ fontSize: 15, fontWeight: 600, color: 'rgba(255,255,255,0.82)', textTransform: 'capitalize' }}>
              {MONTHS_CZ[view.month]} {view.year}
            </span>
            <NavArrow dir="next" onClick={goNext} disabled={isCurrentMonth} />
          </div>

          {!loaded ? (
            <CalendarSkeleton />
          ) : (
            <>
              {/* Weekday header */}
              <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
                {WEEKDAYS_CZ.map(w => (
                  <div key={w} style={{ textAlign: 'center', fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', color: 'rgba(255,255,255,0.25)' }}>{w}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                {grid.map((cell, i) => {
                  if (cell.day === null) return <div key={`b${i}`} />
                  const dISO = iso(view.year, view.month, cell.day)
                  const entry = dayData.get(dISO)
                  const isFuture = dISO > today
                  const color = mode === 'all'
                    ? overallColor(entry?.done ?? 0, denom)
                    : habitColor(entry?.byHabit.get(mode))
                  return (
                    <DayCell
                      key={dISO}
                      day={cell.day}
                      color={color}
                      isToday={dISO === today}
                      isFuture={isFuture}
                      selected={selectedDay === dISO}
                      onClick={() => setSelectedDay(d => d === dISO ? null : dISO)}
                    />
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Legend */}
        {loaded && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 18, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
            {mode === 'all' ? (
              <>
                <span>míň</span>
                {[EMPTY_CELL, 'rgba(245,158,11,0.20)', 'rgba(245,158,11,0.40)', 'rgba(245,158,11,0.64)', 'rgba(245,158,11,0.92)'].map((c, i) => (
                  <span key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c, border: '1px solid rgba(255,255,255,0.04)' }} />
                ))}
                <span>víc</span>
              </>
            ) : (
              <>
                <LegendDot color="rgba(245,158,11,0.90)" label="splněno" />
                <LegendDot color="rgba(239,68,68,0.50)" label="nesplněno" />
                <LegendDot color={EMPTY_CELL} label="nic" />
              </>
            )}
          </div>
        )}

        {/* Selected day detail */}
        {selectedDay && (
          <div style={{ marginTop: 20, background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 16px' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B', margin: '0 0 10px', textTransform: 'capitalize' }}>
              {formatCzDay(selectedDay)}
            </p>
            {mode === 'all' ? (
              selectedDetail && (selectedDetail.done.length || selectedDetail.fail.length) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedDetail.done.length > 0 && (
                    <div>
                      <p style={{ fontSize: 10, color: 'rgba(245,158,11,0.7)', margin: '0 0 4px', fontWeight: 600 }}>SPLNĚNO ({selectedDetail.done.length})</p>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.5 }}>{selectedDetail.done.join(' · ')}</p>
                    </div>
                  )}
                  {selectedDetail.fail.length > 0 && (
                    <div>
                      <p style={{ fontSize: 10, color: 'rgba(239,68,68,0.7)', margin: '0 0 4px', fontWeight: 600 }}>NESPLNĚNO ({selectedDetail.fail.length})</p>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.5 }}>{selectedDetail.fail.join(' · ')}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Žádný záznam pro tento den.</p>
              )
            ) : (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                {habitName(mode)} — {
                  (() => {
                    const st = dayData.get(selectedDay)?.byHabit.get(mode)
                    return st === 'done' ? '✓ splněno' : st === 'fail' ? '✗ nesplněno' : st === 'partial' ? '~ částečně' : 'žádný záznam'
                  })()
                }
              </p>
            )}
          </div>
        )}

        {/* Month summary */}
        {loaded && mode === 'all' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            <SummaryStat value={summary.totalDone} label="odškrtnutí" />
            <SummaryStat value={summary.activeDays} label="aktivních dní" />
            <SummaryStat value={summary.bestDay} label="nejlepší den" />
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Small components ─────────────────────────────────────────────────────────

function ModeChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0, whiteSpace: 'nowrap', cursor: 'pointer',
        fontSize: 12, fontWeight: active ? 600 : 500,
        padding: '6px 12px', borderRadius: 99,
        background: active ? 'rgba(245,158,11,0.14)' : 'rgba(255,255,255,0.04)',
        border: active ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.07)',
        color: active ? '#F59E0B' : 'rgba(255,255,255,0.45)',
      }}
    >
      {label}
    </button>
  )
}

function NavArrow({ dir, onClick, disabled }: { dir: 'prev' | 'next'; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={dir === 'prev' ? 'Předchozí měsíc' : 'Další měsíc'}
      style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.25 : 1,
        color: 'rgba(255,255,255,0.6)',
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16, transform: dir === 'next' ? 'rotate(180deg)' : 'none' }}>
        <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, border: '1px solid rgba(255,255,255,0.04)' }} />
      {label}
    </span>
  )
}

function SummaryStat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ flex: 1, background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#F59E0B', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 5 }}>{label}</div>
    </div>
  )
}
