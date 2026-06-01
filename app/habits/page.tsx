'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getProfileId } from '@/lib/profile'
import { rebuildStreak } from '@/lib/streak'
import type { User } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Habit {
  id: string
  name: string
  status: 'active' | 'trial' | 'graduated'
  serves: string
  frequency: string
  streak: number
  endDate?: string
  trialEnd?: string
  pack?: 'imunita' | 'fyzicka'
  packCode?: string
  mandatory?: boolean
}

// ─── Data z vaultu (habits.md) ───────────────────────────────────────────────

const ALL_HABITS: Habit[] = [
  // Active
  { id: 'anki',       name: 'Anki procvičování',    status: 'active',    serves: 'japonština · sen',          frequency: '25+ karet denně', streak: 45 },
  { id: 'autoschola', name: 'Autoškola testy A1',   status: 'active',    serves: 'motorky · svoboda pohybu',  frequency: '2× denně',        streak: 2, endDate: '30.6.', mandatory: true },
  // Trial solo
  { id: 'mining',     name: 'Anki tvorba',          status: 'trial',     serves: 'japonština · sen',          frequency: '200 karet / týden', streak: 0, trialEnd: '30.6.' },
  { id: 'kytara',     name: 'Kytara',               status: 'trial',     serves: 'DofE talent',               frequency: '3× týdně · 20 min', streak: 1, trialEnd: '30.6.' },
  // Balíček Imunita
  { id: 'spanek',     name: 'Spánek 22:00–06:15',   status: 'trial', serves: 'imunita · fyzička',       frequency: 'denně',     streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'A' },
  { id: 'vitd3',      name: 'Vit D3 1000 IU',       status: 'trial', serves: 'imunita',                 frequency: 'denně',     streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'B' },
  { id: 'zinek',      name: 'Zinek',                status: 'trial', serves: 'imunita',                 frequency: '1×/tý',     streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'C' },
  { id: 'probiotika', name: 'Probiotika',           status: 'trial', serves: 'imunita',                 frequency: '3×/tý',     streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'D' },
  { id: 'voda',       name: '2 L vody',             status: 'trial', serves: 'imunita',                 frequency: 'denně',     streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'E' },
  { id: 'les',        name: '30 min v lese',        status: 'trial', serves: 'příroda · imunita · sen', frequency: '5×/tý',     streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'G' },
  { id: 'ovoce',      name: '2× ovoce + 0 sladké', status: 'trial', serves: 'imunita',                 frequency: 'denně',     streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'H' },
  { id: 'vetrani',    name: 'Větrat ložnici',       status: 'trial', serves: 'imunita',                 frequency: 'denně',     streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'I' },
  { id: 'omega3',     name: 'Omega-3',              status: 'trial', serves: 'imunita',                 frequency: '2×/tý',     streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'J' },
  // Balíček Fyzička
  { id: 'posilovani', name: 'Posilování calisthenics', status: 'trial', serves: 'fyzička · sen',      frequency: '3×/tý',     streak: 0, pack: 'fyzicka' },
  { id: 'sprcha',     name: 'Studená sprcha 30s',      status: 'trial', serves: 'imunita · fyzička',  frequency: 'denně',     streak: 0, pack: 'fyzicka' },
  { id: 'beh',        name: 'Běh',                     status: 'trial', serves: 'fyzička · sen',      frequency: '2–3×/tý',   streak: 0, pack: 'fyzicka' },
  { id: 'boulder',    name: 'Boulder',                 status: 'trial', serves: 'fyzička',            frequency: '1×/měs',    streak: 0, pack: 'fyzicka' },
  { id: 'kolo',       name: 'Kolo 100km+',             status: 'trial', serves: 'výpravy · fyzička',  frequency: 'dle plánu', streak: 0, pack: 'fyzicka' },
  // Graduated
  { id: 'imerze', name: 'Japonská imerze', status: 'graduated', serves: 'japonština · sen', frequency: 'denně', streak: 45 },
  { id: 'denik',  name: 'Hlasový deník',   status: 'graduated', serves: 'vault · meta',     frequency: 'denně', streak: 45 },
]

const ACTIVE     = ALL_HABITS.filter(h => h.status === 'active')
const TRIAL_SOLO = ALL_HABITS.filter(h => h.status === 'trial' && !h.pack)
const IMUNITA    = ALL_HABITS.filter(h => h.pack === 'imunita')
const FYZICKA    = ALL_HABITS.filter(h => h.pack === 'fyzicka')
const GRADUATED  = ALL_HABITS.filter(h => h.status === 'graduated')
const TRACKABLE  = ALL_HABITS.filter(h => h.status !== 'graduated')

const MAX_STREAK = Math.max(...ALL_HABITS.map(h => h.streak))

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatCzechDate(d: Date): string {
  const dny = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota']
  const mesice = ['ledna','února','března','dubna','května','června','července','srpna','září','října','listopadu','prosince']
  return `${dny[d.getDay()]} ${d.getDate()}. ${mesice[d.getMonth()]}`
}

// ─── Online status hook ───────────────────────────────────────────────────────

function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true)
  useEffect(() => {
    setOnline(navigator.onLine)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return online
}

// ─── Habit DB sync ────────────────────────────────────────────────────────────

// Returns localId → dbId map after seeding missing habits
async function syncHabitsToDb(profileId: string): Promise<Record<string, string>> {
  const { data: existing } = await supabase
    .from('habits').select('id, name').eq('profile_id', profileId)
  const byName: Record<string, string> = {}
  for (const h of existing ?? []) byName[h.name] = h.id

  const toInsert = ALL_HABITS
    .filter(h => !byName[h.name])
    .map(h => ({
      profile_id: profileId,
      name: h.name,
      category: h.status as string,
      frequency: h.frequency,
      vault_serves: [h.serves],
    }))

  if (toInsert.length > 0) {
    const { data: inserted } = await supabase
      .from('habits').insert(toInsert).select('id, name')
    for (const h of inserted ?? []) byName[h.name] = h.id
  }

  const idMap: Record<string, string> = {}
  for (const h of ALL_HABITS) {
    if (byName[h.name]) idMap[h.id] = byName[h.name]
  }
  return idMap
}

// Load today's done habits from habit_logs
async function loadTodayLogs(idMap: Record<string, string>, date: string): Promise<Set<string>> {
  const dbIds = Object.values(idMap)
  if (!dbIds.length) return new Set()

  const { data } = await supabase
    .from('habit_logs')
    .select('habit_id, status')
    .in('habit_id', dbIds)
    .eq('date', date)

  const doneDbIds = new Set(
    (data ?? []).filter(l => l.status === 'done').map(l => l.habit_id as string)
  )
  const reverse: Record<string, string> = {}
  for (const [local, db] of Object.entries(idMap)) reverse[db] = local

  return new Set([...doneDbIds].map(dbId => reverse[dbId]).filter(Boolean))
}

// Load current streaks from streaks_cache
async function loadStreaks(idMap: Record<string, string>): Promise<Record<string, number>> {
  const dbIds = Object.values(idMap)
  if (!dbIds.length) return {}
  const { data } = await supabase
    .from('streaks_cache')
    .select('habit_id, current_streak')
    .in('habit_id', dbIds)

  const reverse: Record<string, string> = {}
  for (const [local, db] of Object.entries(idMap)) reverse[db] = local

  const result: Record<string, number> = {}
  for (const row of data ?? []) {
    const localId = reverse[row.habit_id]
    if (localId) result[localId] = row.current_streak
  }
  return result
}

// ─── SVG: straw hat silhouette ────────────────────────────────────────────────

function StrawHatFigure() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/luffy.jpg"
      alt=""
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: '50%',
        right: -10,
        transform: 'translateY(-50%)',
        height: 160,
        width: 'auto',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 0,
        filter: 'invert(1) grayscale(1)',
        mixBlendMode: 'screen',
        opacity: 0.09,
      }}
    />
  )
}

// ─── Water Tracker ────────────────────────────────────────────────────────────

const DEFAULT_GOAL = 2000

function WaterTracker({ profileId, isOnline }: { profileId: string | null; isOnline: boolean }) {
  const dateKey = todayISO()
  const lsAmountKey = `hikari_water_${dateKey}`
  const lsGoalKey = 'hikari_water_goal'
  const lsPendingKey = `hikari_water_pending_${dateKey}`

  const [amount, setAmount] = useState(0)
  const [goal, setGoal] = useState(DEFAULT_GOAL)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput] = useState('')
  const [customInput, setCustomInput] = useState('')
  const [syncing, setSyncing] = useState(false)
  const prevOnline = useRef(isOnline)

  useEffect(() => {
    const savedAmount = localStorage.getItem(lsAmountKey)
    const savedGoal = localStorage.getItem(lsGoalKey)
    if (savedAmount) setAmount(Number(savedAmount))
    if (savedGoal) setGoal(Number(savedGoal))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const syncToSupabase = useCallback(async (ml: number, pid: string) => {
    setSyncing(true)
    await supabase.from('water_logs').upsert(
      { profile_id: pid, date: dateKey, amount_ml: ml, updated_at: new Date().toISOString() },
      { onConflict: 'profile_id,date' }
    )
    localStorage.removeItem(lsPendingKey)
    setSyncing(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, lsPendingKey])

  // Auto-sync on reconnect
  useEffect(() => {
    if (!prevOnline.current && isOnline && profileId) {
      const pending = localStorage.getItem(lsPendingKey)
      if (pending) syncToSupabase(Number(pending), profileId)
    }
    prevOnline.current = isOnline
  }, [isOnline, profileId, lsPendingKey, syncToSupabase])

  // Load goal from user_context
  useEffect(() => {
    if (!profileId || !isOnline) return
    supabase.from('user_context').select('value')
      .eq('profile_id', profileId).eq('key', 'water_goal_ml').single()
      .then(({ data }) => {
        if (data?.value) { const g = Number(data.value); setGoal(g); localStorage.setItem(lsGoalKey, String(g)) }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, isOnline])

  // Load today's water from Supabase
  useEffect(() => {
    if (!profileId || !isOnline) return
    supabase.from('water_logs').select('amount_ml')
      .eq('profile_id', profileId).eq('date', dateKey).single()
      .then(({ data }) => {
        if (data?.amount_ml != null) {
          const ml = Number(data.amount_ml)
          setAmount(ml)
          localStorage.setItem(lsAmountKey, String(ml))
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, isOnline])

  const updateAmount = useCallback((newAmount: number) => {
    const clamped = Math.max(0, newAmount)
    setAmount(clamped)
    localStorage.setItem(lsAmountKey, String(clamped))
    if (isOnline && profileId) {
      syncToSupabase(clamped, profileId)
    } else {
      localStorage.setItem(lsPendingKey, String(clamped))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, profileId, lsAmountKey, lsPendingKey, syncToSupabase])

  const saveGoal = useCallback(async (newGoal: number) => {
    setGoal(newGoal)
    localStorage.setItem(lsGoalKey, String(newGoal))
    setEditingGoal(false)
    if (isOnline && profileId) {
      await supabase.from('user_context').upsert(
        { profile_id: profileId, key: 'water_goal_ml', value: String(newGoal) },
        { onConflict: 'profile_id,key' }
      )
    }
  }, [isOnline, profileId])

  const pct = Math.min(100, (amount / goal) * 100)
  const reached = amount >= goal

  return (
    <div style={{
      background: '#0e0e0e',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14,
      padding: '14px 16px',
      marginBottom: 20,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.65)' }}>💧 VODA</span>
          {syncing && <span style={{ fontSize: 10, color: 'rgba(245,158,11,0.4)' }}>↑</span>}
        </div>
        <button
          onClick={() => { setGoalInput(String(goal)); setEditingGoal(e => !e) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center' }}
          aria-label="Nastavit cíl"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 14, height: 14 }}>
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {editingGoal && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
          <input
            type="number"
            value={goalInput}
            onChange={e => setGoalInput(e.target.value)}
            placeholder="Cíl v ml"
            style={{ flex: 1, background: '#1a1a1a', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, color: '#ededed', fontSize: 13, padding: '6px 10px', outline: 'none' }}
          />
          <button
            onClick={() => { const g = Number(goalInput); if (g > 0) saveGoal(g) }}
            style={{ background: '#F59E0B', color: '#080808', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer' }}
          >
            Uložit
          </button>
        </div>
      )}

      {/* Progress bar */}
      <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 99, marginBottom: 12, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: reached ? '#F59E0B' : 'rgba(245,158,11,0.55)', borderRadius: 99, transition: 'width 0.3s ease' }} />
      </div>

      {/* Amount */}
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: reached ? '#F59E0B' : 'rgba(255,255,255,0.8)', letterSpacing: '-0.02em', lineHeight: 1 }}>{amount}</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)', marginLeft: 4 }}>/ {goal} ml</span>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => updateAmount(amount - 250)} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: 'rgba(255,255,255,0.6)', fontSize: 18, padding: '10px 0', cursor: 'pointer' }}>−</button>
        <div style={{ display: 'flex', flex: 2, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
          <input
            type="number"
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            placeholder="ml"
            style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: 'none', color: '#ededed', fontSize: 13, padding: '10px 10px', outline: 'none', minWidth: 0, textAlign: 'center' }}
          />
          <button
            onClick={() => { const v = Number(customInput); if (v > 0) { updateAmount(amount + v); setCustomInput('') } }}
            style={{ background: 'rgba(245,158,11,0.12)', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.06)', color: '#F59E0B', fontSize: 12, fontWeight: 600, padding: '10px 12px', cursor: 'pointer' }}
          >+</button>
        </div>
        <button onClick={() => updateAmount(amount + 250)} style={{ flex: 1, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, color: '#F59E0B', fontSize: 18, fontWeight: 600, padding: '10px 0', cursor: 'pointer' }}>+</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'center' }}>
        {[250, 330, 500].map(ml => (
          <button key={ml} onClick={() => updateAmount(amount + ml)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, color: 'rgba(255,255,255,0.3)', fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}>+{ml}</button>
        ))}
      </div>
    </div>
  )
}

// ─── Habit row ────────────────────────────────────────────────────────────────

function HabitRow({ habit, done, onToggle, liveStreak }: { habit: Habit; done: boolean; onToggle: () => void; liveStreak?: number }) {
  const displayStreak = liveStreak !== undefined ? liveStreak : habit.streak
  return (
    <div className="flex items-center gap-3 py-3 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
      <button
        onClick={() => { console.log('[HabitRow] click', habit.id); onToggle() }}
        style={{
          flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
          border: done ? '2px solid #F59E0B' : '2px solid rgba(255,255,255,0.15)',
          background: done ? '#F59E0B' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s ease', cursor: 'pointer',
        }}
        aria-label={done ? 'Odznačit' : 'Splnit'}
      >
        {done && (
          <svg viewBox="0 0 24 24" fill="none" style={{ width: 13, height: 13 }}>
            <path d="M5 13l4 4L19 7" stroke="#080808" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 14, fontWeight: 500, margin: 0,
          color: done ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.88)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          transition: 'color 0.15s',
          textDecorationLine: done ? 'line-through' : 'none',
          textDecorationColor: 'rgba(255,255,255,0.2)',
        }}>
          {habit.packCode && <span style={{ color: '#F59E0B', opacity: 0.5, marginRight: 4, fontSize: 11 }}>{habit.packCode}</span>}
          {habit.name}
        </p>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', margin: '2px 0 0' }}>{habit.serves}</p>
      </div>

      <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {displayStreak > 0 && (
          <span style={{ fontSize: 15, fontWeight: 700, color: '#F59E0B', lineHeight: 1 }}>
            {displayStreak}<span style={{ fontSize: 10, fontWeight: 400, color: 'rgba(245,158,11,0.55)', marginLeft: 1 }}>×</span>
          </span>
        )}
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', lineHeight: 1 }}>{habit.frequency}</span>
        {(habit.endDate || habit.trialEnd) && (
          <span style={{ fontSize: 9, color: 'rgba(245,158,11,0.30)', lineHeight: 1 }}>do {habit.endDate ?? habit.trialEnd}</span>
        )}
      </div>
    </div>
  )
}

// ─── Pack accordion ───────────────────────────────────────────────────────────

function PackSection({ title, subtitle, habits, done, onToggle, streakMap }: {
  title: string; subtitle: string; habits: Habit[]; done: Set<string>; onToggle: (id: string) => void; streakMap: Record<string, number>
}) {
  const [open, setOpen] = useState(false)
  const completedCount = habits.filter(h => done.has(h.id)).length
  const allPackDone = completedCount === habits.length

  return (
    <div style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'transparent', cursor: 'pointer', border: 'none', color: 'inherit' }}
      >
        <div style={{ textAlign: 'left' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.65)' }}>{title}</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', marginLeft: 8 }}>{subtitle}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: allPackDone ? '#F59E0B' : 'rgba(255,255,255,0.25)' }}>
            {completedCount}/{habits.length}
          </span>
          <svg viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16, color: 'rgba(255,255,255,0.25)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>
      {open && (
        <div style={{ padding: '0 16px 8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {habits.map(h => <HabitRow key={h.id} habit={h} done={done.has(h.id)} onToggle={() => onToggle(h.id)} liveStreak={streakMap[h.id]} />)}
        </div>
      )}
    </div>
  )
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', margin: '0 0 8px 2px' }}>
      {children}
    </p>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HabitsPage() {
  const today = new Date()
  const dateKey = todayISO()
  const isOnline = useOnlineStatus()

  const [done, setDone] = useState<Set<string>>(new Set())
  const [profileId, setProfileId] = useState<string | null>(null)
  const [habitIdMap, setHabitIdMap] = useState<Record<string, string>>({})
  const [streakMap, setStreakMap] = useState<Record<string, number>>({})

  // Load localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(`hikari_habits_${dateKey}`)
    if (saved) {
      try { setDone(new Set(JSON.parse(saved))) } catch { /* ignore */ }
    }
  }, [dateKey])

  // Init DB: resolve profile → seed habits → load today's logs
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }: { data: { user: User | null } }) => {
      if (!user) return
      const pid = await getProfileId(user)
      if (!pid) return
      setProfileId(pid)

      const idMap = await syncHabitsToDb(pid).catch(() => ({} as Record<string, string>))
      setHabitIdMap(idMap)

      if (Object.keys(idMap).length > 0) {
        const [dbDone, dbStreaks] = await Promise.all([
          loadTodayLogs(idMap, dateKey).catch(() => new Set<string>()),
          loadStreaks(idMap).catch(() => ({} as Record<string, number>)),
        ])
        setStreakMap(dbStreaks)
        setDone(prev => {
          const merged = new Set([...prev, ...dbDone])
          localStorage.setItem(`hikari_habits_${dateKey}`, JSON.stringify([...merged]))
          return merged
        })
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey])

  const toggle = (id: string) => {
    // Read current state directly — done is always fresh at click time
    const nowDone = !done.has(id)
    console.log('[toggle]', id, '→', nowDone, 'dbId:', habitIdMap[id])

    setDone(prev => {
      const next = new Set(prev)
      nowDone ? next.add(id) : next.delete(id)
      localStorage.setItem(`hikari_habits_${dateKey}`, JSON.stringify([...next]))
      return next
    })

    const dbId = habitIdMap[id]
    if (dbId) {
      const habit = ALL_HABITS.find(h => h.id === id)
      supabase.from('habit_logs').upsert(
        { habit_id: dbId, date: dateKey, status: nowDone ? 'done' : 'fail', source: 'dashboard' },
        { onConflict: 'habit_id,date' }
      ).then(({ error }) => {
        if (error) { console.error('[toggle] upsert error:', error); return }
        return rebuildStreak(dbId, habit?.mandatory ?? false)
      }).then(newStreak => {
        if (newStreak !== undefined) {
          setStreakMap(prev => ({ ...prev, [id]: newStreak }))
        }
      })
    }
  }

  const doneCount = TRACKABLE.filter(h => done.has(h.id)).length
  const totalCount = TRACKABLE.length
  const allDone = doneCount === totalCount && totalCount > 0

  return (
    <>
      <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', color: '#ededed', overflowX: 'hidden' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px 80px' }}>

          {/* ── Header ── */}
          <header style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', paddingTop: 14, paddingBottom: 28 }}>
            <Link href="/" style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.02em', color: '#F59E0B', textDecoration: 'none' }}>
              光 Hikari
            </Link>

            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', textTransform: 'capitalize', whiteSpace: 'nowrap', textAlign: 'center' }}>
              {formatCzechDate(today)}
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
              {!isOnline && (
                <span style={{ fontSize: 9, color: 'rgba(255,100,50,0.7)', background: 'rgba(255,100,50,0.08)', border: '1px solid rgba(255,100,50,0.15)', borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em', fontWeight: 600 }}>
                  OFFLINE
                </span>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: doneCount > 0 ? '#F59E0B' : 'rgba(255,255,255,0.25)', lineHeight: 1 }}>{doneCount}</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', lineHeight: 1 }}>/</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.28)', lineHeight: 1 }}>{totalCount}</span>
              </div>
            </div>
          </header>

          {/* ── Streak hero ── */}
          <div style={{ position: 'relative', textAlign: 'center', marginBottom: 36, padding: '8px 0' }}>
            <StrawHatFigure />
            <div style={{ position: 'relative', zIndex: 1, fontSize: 64, fontWeight: 900, color: '#F59E0B', lineHeight: 1, letterSpacing: '-0.02em' }}>{streakMap['anki'] ?? MAX_STREAK}</div>
            <div style={{ position: 'relative', zIndex: 1, fontSize: 12, color: 'rgba(255,255,255,0.28)', marginTop: 6, letterSpacing: '0.04em' }}>dní v řadě · Anki</div>
            {allDone && (
              <div style={{ marginTop: 20, padding: '0 24px' }}>
                <div style={{ width: 24, height: 1, background: 'rgba(245,158,11,0.3)', margin: '0 auto 14px' }} />
                <p style={{ fontSize: 13, fontStyle: 'italic', color: 'rgba(245,158,11,0.82)', lineHeight: 1.6, margin: '0 0 6px' }}>
                  &ldquo;If you give up, you&rsquo;re going to regret it forever.&rdquo;
                </p>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.06em', margin: 0 }}>— Monkey D. Luffy</p>
              </div>
            )}
          </div>

          {/* ── Voda ── */}
          <section>
            <SectionLabel>Voda</SectionLabel>
            <WaterTracker profileId={profileId} isOnline={isOnline} />
          </section>

          {/* ── Aktivní ── */}
          <section style={{ marginBottom: 20 }}>
            <SectionLabel>Aktivní</SectionLabel>
            <div style={{ background: '#0e0e0e', borderRadius: 14, padding: '0 16px' }}>
              {ACTIVE.map(h => <HabitRow key={h.id} habit={h} done={done.has(h.id)} onToggle={() => toggle(h.id)} liveStreak={streakMap[h.id]} />)}
            </div>
          </section>

          {/* ── Testovací ── */}
          <section style={{ marginBottom: 20 }}>
            <SectionLabel>Testovací</SectionLabel>
            <div style={{ background: '#0e0e0e', borderRadius: 14, padding: '0 16px' }}>
              {TRIAL_SOLO.map(h => <HabitRow key={h.id} habit={h} done={done.has(h.id)} onToggle={() => toggle(h.id)} liveStreak={streakMap[h.id]} />)}
            </div>
          </section>

          {/* ── Balíčky ── */}
          <section style={{ marginBottom: 20 }}>
            <SectionLabel>Balíčky</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PackSection title="Imunita" subtitle="Trial · do 30.6." habits={IMUNITA} done={done} onToggle={toggle} streakMap={streakMap} />
              <PackSection title="Fyzička" subtitle="Trial · od ~5.6." habits={FYZICKA} done={done} onToggle={toggle} streakMap={streakMap} />
            </div>
          </section>

          {/* ── Zautomatizováno ── */}
          <section>
            <SectionLabel>Zautomatizováno</SectionLabel>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {GRADUATED.map(h => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 10, background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(245,158,11,0.45)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.32)' }}>{h.name}</span>
                  <span style={{ fontSize: 11, color: 'rgba(245,158,11,0.35)', fontWeight: 600 }}>{streakMap[h.id] ?? h.streak}×</span>
                </div>
              ))}
            </div>
          </section>

          <div style={{ textAlign: 'center', padding: '24px 24px 48px', opacity: 0.5 }}>
            <p style={{ fontSize: 13, fontStyle: 'italic', color: '#F59E0B', lineHeight: 1.6, margin: 0 }}>
              &ldquo;If you give up, you&rsquo;re going to regret it forever.&rdquo;
            </p>
            <p style={{ fontSize: 11, color: '#666', marginTop: 6 }}>— Monkey D. Luffy</p>
          </div>

        </div>
      </div>
    </>
  )
}
