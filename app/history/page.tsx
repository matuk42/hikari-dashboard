'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getProfileId } from '@/lib/profile'
import { rebuildStreaksFromLogs } from '@/lib/streak'

// ─── LocalStorage keys (shared with /habits) ──────────────────────────────────

const LS_PROFILE_ID = 'hikari_profile_id'

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'done' | 'fail' | 'partial' | 'unknown' | 'rest'

interface HabitLite {
  id: string
  name: string
  mandatory: boolean
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
// a dimmer gold than "done" + a dashed border + a fine gold grid, so it reads as
// "ok, but not a win" and is unmistakable from a plain done/empty cell.
const REST_FILL = 'rgba(245,158,11,0.13)'
const REST_BORDER = 'rgba(245,158,11,0.5)'
// Diagonal hatch (šikmé čáry) — the classic "rest / skipped" texture.
const REST_GRID =
  'repeating-linear-gradient(45deg, rgba(245,158,11,0.40) 0, rgba(245,158,11,0.40) 1.5px, transparent 1.5px, transparent 6px)'

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
    .select('id, name, category, mandatory')
    .eq('profile_id', profileId)
  return (data ?? [])
    .filter(h => h.category !== 'retired')
    .map(h => ({ id: h.id as string, name: h.name as string, mandatory: !!h.mandatory }))
    .sort((a, b) => a.name.localeCompare(b.name, 'cs'))
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
        backgroundColor: isFuture ? FUTURE_CELL : color,
        backgroundImage: dashed && !isFuture ? REST_GRID : undefined,
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
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [editingDay, setEditingDay] = useState(false)

  // Per-month log cache so navigating back and forth doesn't refetch.
  const cache = useRef<Map<string, LogRow[]>>(new Map())
  // Debounced streak rebuild after retrospective edits.
  const rebuildTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Recompute streaks from logs after retrospective edits (debounced — a burst of
  // toggles triggers one rebuild). Authoritative streak logic lives in lib/streak.
  const scheduleStreakRebuild = useCallback(() => {
    if (rebuildTimer.current) clearTimeout(rebuildTimer.current)
    rebuildTimer.current = setTimeout(() => {
      rebuildStreaksFromLogs(habits.map(h => ({ id: h.id, mandatory: h.mandatory })), today).catch(() => {})
    }, 1500)
  }, [habits, today])

  // Retrospectively cycle a habit's status for a given date: none → done → rest → none.
  // Optimistic local update (+ month cache) then persist; 'none' deletes the row.
  const cycleLog = useCallback(async (habitId: string, date: string) => {
    const cur = logs.find(l => l.habit_id === habitId && l.date === date)?.status
    const next: 'done' | 'rest' | null = cur === 'done' ? 'rest' : cur === 'rest' ? null : 'done'

    const updated = logs.filter(l => !(l.habit_id === habitId && l.date === date))
    if (next) updated.push({ habit_id: habitId, date, status: next })
    setLogs(updated)
    cache.current.set(monthKey, updated)

    try {
      if (next === null) {
        await supabase.from('habit_logs').delete().eq('habit_id', habitId).eq('date', date)
      } else {
        await supabase.from('habit_logs').upsert(
          { habit_id: habitId, date, status: next, source: 'dashboard' },
          { onConflict: 'habit_id,date' }
        )
      }
      scheduleStreakRebuild()
    } catch { /* optimistic state stays; next month refetch reconciles */ }
  }, [logs, monthKey, scheduleStreakRebuild])

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
    const rest: string[] = []
    if (entry) {
      for (const [hid, st] of entry.byHabit) {
        if (st === 'done') done.push(habitName(hid))
        else if (st === 'rest') rest.push(habitName(hid))
      }
    }
    done.sort(); rest.sort()
    return { done, rest }
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

        {/* Mode selector: "Vše" + a dropdown that opens a habit list over the calendar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, position: 'relative', zIndex: 30 }}>
          <ModeChip label="Vše" active={mode === 'all'} onClick={() => { setMode('all'); setSelectedDay(null); setDropdownOpen(false) }} />

          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <button
              onClick={() => setDropdownOpen(o => !o)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                cursor: 'pointer', fontSize: 12, fontWeight: mode !== 'all' ? 600 : 500,
                padding: '6px 12px', borderRadius: 99,
                background: mode !== 'all' ? 'rgba(245,158,11,0.14)' : 'rgba(255,255,255,0.04)',
                border: mode !== 'all' ? '1px solid rgba(245,158,11,0.4)' : '1px solid rgba(255,255,255,0.07)',
                color: mode !== 'all' ? '#F59E0B' : 'rgba(255,255,255,0.45)',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {mode === 'all' ? 'Vyber habit' : habitName(mode)}
              </span>
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14, flexShrink: 0, transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {dropdownOpen && (
              <>
                {/* tap-outside catcher */}
                <div onClick={() => setDropdownOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, zIndex: 50,
                  background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
                  padding: 6, maxHeight: 320, overflowY: 'auto',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
                }}>
                  {habits.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0, padding: '8px 10px' }}>Žádné habity</p>
                  ) : habits.map(h => (
                    <button
                      key={h.id}
                      onClick={() => { setMode(h.id); setSelectedDay(null); setDropdownOpen(false) }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                        fontSize: 13, fontWeight: mode === h.id ? 600 : 500,
                        padding: '9px 10px', borderRadius: 8, border: 'none',
                        background: mode === h.id ? 'rgba(245,158,11,0.14)' : 'transparent',
                        color: mode === h.id ? '#F59E0B' : 'rgba(255,255,255,0.78)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {h.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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
                  const cellStyle = mode === 'all'
                    ? overallCell(entry?.done ?? 0, entry?.rest ?? 0, denom)
                    : habitCell(entry?.byHabit.get(mode))
                  return (
                    <DayCell
                      key={dISO}
                      day={cell.day}
                      color={cellStyle.color}
                      dashed={cellStyle.dashed}
                      isToday={dISO === today}
                      isFuture={isFuture}
                      selected={selectedDay === dISO}
                      onClick={() => { setEditingDay(false); setSelectedDay(d => d === dISO ? null : dISO) }}
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
                <LegendDot color={REST_FILL} label="rest" dashed />
                <LegendDot color={EMPTY_CELL} label="nic" />
              </>
            )}
          </div>
        )}

        {/* Selected day detail */}
        {selectedDay && (
          <div style={{ marginTop: 20, background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#F59E0B', margin: 0, textTransform: 'capitalize' }}>
                {formatCzDay(selectedDay)}
              </p>
              <button
                onClick={() => setEditingDay(e => !e)}
                style={{
                  flexShrink: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  padding: '4px 10px', borderRadius: 99,
                  background: editingDay ? 'rgba(245,158,11,0.16)' : 'rgba(255,255,255,0.05)',
                  border: editingDay ? '1px solid rgba(245,158,11,0.45)' : '1px solid rgba(255,255,255,0.1)',
                  color: editingDay ? '#F59E0B' : 'rgba(255,255,255,0.55)',
                }}
              >
                {editingDay ? 'Hotovo' : 'Upravit'}
              </button>
            </div>

            {editingDay ? (
              habits.length === 0 ? (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: 0 }}>Žádné habity k doplnění.</p>
              ) : (
                <div>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', margin: '0 0 6px' }}>
                    Klikni na habit: nic → splněno → rest → nic
                  </p>
                  <div>
                    {habits.map(h => (
                      <EditRow
                        key={h.id}
                        name={h.name}
                        status={dayData.get(selectedDay)?.byHabit.get(h.id)}
                        onClick={() => cycleLog(h.id, selectedDay)}
                      />
                    ))}
                  </div>
                </div>
              )
            ) : mode === 'all' ? (
              selectedDetail && (selectedDetail.done.length || selectedDetail.rest.length) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {selectedDetail.done.length > 0 && (
                    <div>
                      <p style={{ fontSize: 10, color: 'rgba(245,158,11,0.7)', margin: '0 0 4px', fontWeight: 600 }}>SPLNĚNO ({selectedDetail.done.length})</p>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', margin: 0, lineHeight: 1.5 }}>{selectedDetail.done.join(' · ')}</p>
                    </div>
                  )}
                  {selectedDetail.rest.length > 0 && (
                    <div>
                      <p style={{ fontSize: 10, color: 'rgba(245,158,11,0.45)', margin: '0 0 4px', fontWeight: 600 }}>REST ({selectedDetail.rest.length})</p>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.5 }}>{selectedDetail.rest.join(' · ')}</p>
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
                    return st === 'done' ? '✓ splněno' : st === 'rest' ? '✕ rest day (nezapočítá se)' : st === 'partial' ? '~ částečně' : 'žádný záznam'
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

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{
        width: 12, height: 12, borderRadius: 3, backgroundColor: color,
        backgroundImage: dashed ? REST_GRID : undefined,
        border: dashed ? `1px dashed ${REST_BORDER}` : '1px solid rgba(255,255,255,0.04)',
      }} />
      {label}
    </span>
  )
}

function EditRow({ name, status, onClick }: { name: string; status: Status | undefined; onClick: () => void }) {
  const isDone = status === 'done'
  const isRest = status === 'rest'
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        background: 'transparent', border: 'none', cursor: 'pointer', padding: '7px 0',
      }}
      aria-label={isDone ? `${name}: označit jako rest` : isRest ? `${name}: odznačit` : `${name}: splnit`}
    >
      <span style={{
        flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
        border: isDone ? '2px solid #F59E0B' : isRest ? '2px solid rgba(245,158,11,0.5)' : '2px solid rgba(255,255,255,0.15)',
        background: isDone ? '#F59E0B' : isRest ? 'rgba(245,158,11,0.32)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease',
      }}>
        {isDone && (
          <svg viewBox="0 0 24 24" fill="none" style={{ width: 12, height: 12 }}>
            <path d="M5 13l4 4L19 7" stroke="#080808" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {isRest && (
          <svg viewBox="0 0 24 24" fill="none" style={{ width: 10, height: 10 }}>
            <path d="M6 6l12 12M18 6L6 18" stroke="rgba(245,158,11,0.95)" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        )}
      </span>
      <span style={{
        fontSize: 13, fontWeight: 500,
        color: isDone ? 'rgba(255,255,255,0.5)' : isRest ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.85)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {name}
      </span>
    </button>
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
