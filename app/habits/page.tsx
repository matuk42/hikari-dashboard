'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { getProfileId } from '@/lib/profile'

// ─── LocalStorage keys ───────────────────────────────────────────────────────

const LS_PROFILE_ID = 'hikari_profile_id'
const LS_HABIT_LIST = 'hikari_habit_list'
const LS_STREAK_MAP = 'hikari_streak_map'

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
  mandatory?: boolean   // no grace day (autoškola) — streak breaks on a single miss
}

// Habits jsou plně spravované v appce (přidat/upravit/odebrat) a žijí v Supabase.
// Žádný hardcoded seznam ani seed — prázdná DB = prázdný stav s tlačítkem „Přidat".

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

// ─── DB → Habit mappers ───────────────────────────────────────────────────────

type DbHabit = {
  id: string; name: string; category: string; frequency: string | null
  vault_serves: string[] | null; end_date: string | null; trial_end: string | null
  pack: string | null; pack_code: string | null; mandatory: boolean | null
}

/** "2026-06-30" → "30.6." (matches the short display style of the fallback list) */
function formatShortCz(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${Number(m[3])}.${Number(m[2])}.` : iso
}

function dbToHabits(rows: DbHabit[]): Habit[] {
  return rows
    .filter(r => r.category !== 'retired')
    .map(r => ({
      id: r.id,
      name: r.name,
      status: (r.category === 'active' || r.category === 'graduated' ? r.category : 'trial') as Habit['status'],
      // Strip Obsidian wikilinks so subtitles read "sen/japonština", not "[[sen]]/japonština"
      serves: (r.vault_serves ?? []).filter(Boolean).map(s => s.replace(/\[\[([^\]|]+)\]\]/g, '$1')).join(' · '),
      frequency: r.frequency ?? '',
      streak: 0,
      endDate: r.end_date ? formatShortCz(r.end_date) : undefined,
      trialEnd: r.trial_end ? formatShortCz(r.trial_end) : undefined,
      pack: (r.pack === 'imunita' || r.pack === 'fyzicka') ? r.pack : undefined,
      packCode: r.pack_code ?? undefined,
      mandatory: !!r.mandatory,
    }))
}

function groupHabits(list: Habit[]) {
  return {
    active:    list.filter(h => h.status === 'active'),
    trialSolo: list.filter(h => h.status === 'trial' && !h.pack),
    imunita:   list.filter(h => h.pack === 'imunita'),
    fyzicka:   list.filter(h => h.pack === 'fyzicka'),
    graduated: list.filter(h => h.status === 'graduated'),
    trackable: list.filter(h => h.status !== 'graduated'),
  }
}

// ─── Habit CRUD (app is the source of truth) ──────────────────────────────────

// UI group → DB (category, pack). One picker covers both columns so the form
// stays simple. Packs are always trial-category.
type HabitGroup = 'active' | 'trial' | 'imunita' | 'fyzicka' | 'graduated'

const GROUP_LABELS: Record<HabitGroup, string> = {
  active:    'Aktivní',
  trial:     'Testovací',
  imunita:   'Balíček Imunita',
  fyzicka:   'Balíček Fyzička',
  graduated: 'Zautomatizováno',
}

interface HabitForm {
  name: string
  group: HabitGroup
  frequency: string
  serves: string
  mandatory: boolean
  packCode: string
  until: string   // YYYY-MM-DD, optional → end_date (active) / trial_end (others)
}

function emptyForm(): HabitForm {
  return { name: '', group: 'trial', frequency: '', serves: '', mandatory: false, packCode: '', until: '' }
}

/** Existing habit → form (for editing). */
function habitToForm(h: Habit): HabitForm {
  const group: HabitGroup =
    h.pack === 'imunita' ? 'imunita' :
    h.pack === 'fyzicka' ? 'fyzicka' :
    h.status === 'active' ? 'active' :
    h.status === 'graduated' ? 'graduated' : 'trial'
  // endDate/trialEnd are display-formatted ("30.6.") — keep the date input empty
  // rather than feeding it a non-ISO value it can't parse.
  return {
    name: h.name, group, frequency: h.frequency, serves: h.serves,
    mandatory: !!h.mandatory, packCode: h.packCode ?? '', until: '',
  }
}

/** Form → DB row columns (without profile_id). */
function formToRow(form: HabitForm): Record<string, unknown> {
  const category = form.group === 'imunita' || form.group === 'fyzicka' ? 'trial' : form.group
  const pack     = form.group === 'imunita' ? 'imunita' : form.group === 'fyzicka' ? 'fyzicka' : null
  const until    = /^\d{4}-\d{2}-\d{2}$/.test(form.until) ? form.until : null
  return {
    name:        form.name.trim(),
    category,
    frequency:   form.frequency.trim() || null,
    vault_serves: form.serves.trim() ? [form.serves.trim()] : [],
    mandatory:   form.mandatory,
    end_date:    category === 'active' ? until : null,
    trial_end:   category === 'active' ? null : until,
    pack,
    pack_code:   pack && form.packCode.trim() ? form.packCode.trim().toUpperCase() : null,
  }
}

/** Strip pack columns for a pre-migration-003 retry so a forgotten migration degrades. */
function withoutPack(row: Record<string, unknown>): Record<string, unknown> {
  const r = { ...row }; delete r.pack; delete r.pack_code; return r
}

async function createHabit(profileId: string, form: HabitForm): Promise<string | null> {
  const row = { ...formToRow(form), profile_id: profileId }
  let { error } = await supabase.from('habits').insert(row)
  if (error) ({ error } = await supabase.from('habits').insert(withoutPack(row)))
  return error ? error.message : null
}

async function updateHabit(habitId: string, form: HabitForm): Promise<string | null> {
  const row = formToRow(form)
  let { error } = await supabase.from('habits').update(row).eq('id', habitId)
  if (error) ({ error } = await supabase.from('habits').update(withoutPack(row)).eq('id', habitId))
  return error ? error.message : null
}

/** Soft-delete: category='retired' (reads everywhere filter it out; logs/streaks survive). */
async function retireHabit(habitId: string): Promise<string | null> {
  const { error } = await supabase.from('habits').update({ category: 'retired' }).eq('id', habitId)
  return error ? error.message : null
}

/**
 * Live habit list from the DB (the source of truth once vault sync has run).
 * Tolerates pack/pack_code being absent (migration 003 not applied) by retrying
 * without them. Returns null on hard failure so the caller keeps the fallback.
 */
async function loadHabits(profileId: string): Promise<Habit[] | null> {
  type Res = { data: unknown[] | null; error: unknown }
  let res = await supabase.from('habits')
    .select('id, name, category, frequency, vault_serves, end_date, trial_end, mandatory, pack, pack_code')
    .eq('profile_id', profileId) as Res
  if (res.error) {
    res = await supabase.from('habits')
      .select('id, name, category, frequency, vault_serves, end_date, trial_end, mandatory')
      .eq('profile_id', profileId) as Res
  }
  if (res.error || !res.data) return null
  const rows = (res.data as Partial<DbHabit>[]).map(r => ({
    id: r.id!, name: r.name!, category: r.category!, frequency: r.frequency ?? null,
    vault_serves: r.vault_serves ?? null, end_date: r.end_date ?? null,
    trial_end: r.trial_end ?? null, pack: r.pack ?? null, pack_code: r.pack_code ?? null,
    mandatory: r.mandatory ?? null,
  }))
  return dbToHabits(rows)
}

async function loadTodayDone(ids: string[], date: string): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const { data } = await supabase.from('habit_logs')
    .select('habit_id, status').in('habit_id', ids).eq('date', date)
  return new Set((data ?? []).filter(l => l.status === 'done').map(l => l.habit_id as string))
}

/** Whole calendar days between two YYYY-MM-DD strings (b − a). */
function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`)
  const db = Date.parse(`${b}T00:00:00Z`)
  if (Number.isNaN(da) || Number.isNaN(db)) return 0
  return Math.round((db - da) / 86_400_000)
}

/**
 * Lazy daily streak recompute (the morning cron's job until it exists, PRD W26).
 * Runs on load: if a streak's last completion is too far back, the streak is
 * broken and reset to 0. Rules per PRD:
 *   - mandatory (autoškola): no grace — break after 1 missed day (gap ≥ 2)
 *   - others: 1 rest day forgiven — break after 2+ missed days (gap ≥ 3)
 * gap = days since last completion; gap 0 (done today) / 1 (done yesterday,
 * today still open) never break. The vault-seeded baseline is preserved until
 * an actual miss; best_streak is untouched. Returns the corrected streak map.
 */
async function reconcileStreaks(habits: Habit[], today: string): Promise<Record<string, number>> {
  const ids = habits.map(h => h.id)
  if (!ids.length) return {}
  const mandatoryById: Record<string, boolean> = {}
  for (const h of habits) mandatoryById[h.id] = !!h.mandatory

  const { data } = await supabase.from('streaks_cache')
    .select('habit_id, current_streak, last_completed_date').in('habit_id', ids)

  const out: Record<string, number> = {}
  for (const row of data ?? []) {
    const id = row.habit_id as string
    let streak = (row.current_streak as number) ?? 0
    const last = row.last_completed_date as string | null
    if (streak > 0 && last) {
      const gap = daysBetween(last, today)
      const broke = mandatoryById[id] ? gap >= 2 : gap >= 3
      if (broke) {
        streak = 0
        await supabase.from('streaks_cache')
          .update({ current_streak: 0, updated_at: new Date().toISOString() })
          .eq('habit_id', id)
      }
    }
    out[id] = streak
  }
  return out
}

/**
 * Apply a single ±1 streak change while preserving the vault-seeded baseline and
 * the all-time best. Shared by the optimistic toggle and the offline flush so
 * both paths keep the same semantics.
 */
async function bumpStreak(habitId: string, nowDone: boolean, date: string): Promise<number> {
  const { data: cached } = await supabase.from('streaks_cache')
    .select('current_streak, best_streak').eq('habit_id', habitId).maybeSingle()
  const newStreak = Math.max(0, (cached?.current_streak ?? 0) + (nowDone ? 1 : -1))
  const newBest = Math.max(newStreak, cached?.best_streak ?? 0)
  await supabase.from('streaks_cache').upsert({
    habit_id: habitId, current_streak: newStreak, best_streak: newBest,
    ...(nowDone ? { last_completed_date: date } : {}), updated_at: new Date().toISOString(),
  }, { onConflict: 'habit_id' })
  return newStreak
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRect({ width = '100%', height = 16, radius = 8, style: extra }: {
  width?: string | number; height?: number; radius?: number; style?: React.CSSProperties
}) {
  return (
    <div
      className="skeleton-pulse"
      style={{ width, height, borderRadius: radius, background: 'rgba(255,255,255,0.08)', flexShrink: 0, ...extra }}
    />
  )
}

function HabitRowSkeleton() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="skeleton-pulse" style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <SkeletonRect width="58%" height={13} />
        <SkeletonRect width="38%" height={10} />
      </div>
      <SkeletonRect width={28} height={18} radius={6} />
    </div>
  )
}

function HabitsSkeleton() {
  return (
    <div>
      {/* Streak hero */}
      <div style={{ textAlign: 'center', marginBottom: 36, padding: '8px 0 0' }}>
        <SkeletonRect width={80} height={64} radius={14} style={{ margin: '0 auto 10px' }} />
        <SkeletonRect width={120} height={12} radius={6} style={{ margin: '0 auto' }} />
      </div>

      {/* Water tracker */}
      <div style={{ marginBottom: 20 }}>
        <SkeletonRect width={50} height={10} radius={4} style={{ marginBottom: 10 }} />
        <div style={{ background: '#0e0e0e', borderRadius: 14, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <SkeletonRect height={6} radius={99} style={{ marginBottom: 14 }} />
          <SkeletonRect width={72} height={28} radius={8} style={{ margin: '0 auto 14px' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <SkeletonRect height={42} radius={10} style={{ flex: 1 }} />
            <SkeletonRect height={42} radius={10} style={{ flex: 2 }} />
            <SkeletonRect height={42} radius={10} style={{ flex: 1 }} />
          </div>
        </div>
      </div>

      {/* Aktivní */}
      <div style={{ marginBottom: 20 }}>
        <SkeletonRect width={56} height={10} radius={4} style={{ marginBottom: 10 }} />
        <div style={{ background: '#0e0e0e', borderRadius: 14 }}>
          <HabitRowSkeleton />
          <HabitRowSkeleton />
        </div>
      </div>

      {/* Testovací */}
      <div style={{ marginBottom: 20 }}>
        <SkeletonRect width={74} height={10} radius={4} style={{ marginBottom: 10 }} />
        <div style={{ background: '#0e0e0e', borderRadius: 14 }}>
          <HabitRowSkeleton />
          <HabitRowSkeleton />
        </div>
      </div>

      {/* Balíčky */}
      <div style={{ marginBottom: 20 }}>
        <SkeletonRect width={56} height={10} radius={4} style={{ marginBottom: 10 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1].map(i => (
            <div key={i} style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <SkeletonRect width={96} height={13} radius={6} />
              <SkeletonRect width={36} height={13} radius={6} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Luffy figure ─────────────────────────────────────────────────────────────

function StrawHatFigure() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/luffy.jpg"
      alt=""
      aria-hidden="true"
      style={{
        position: 'absolute', top: '50%', right: -10,
        transform: 'translateY(-50%)', height: 160, width: 'auto',
        pointerEvents: 'none', userSelect: 'none', zIndex: 0,
        filter: 'invert(1) grayscale(1)', mixBlendMode: 'screen', opacity: 0.09,
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

  useEffect(() => {
    if (!prevOnline.current && isOnline && profileId) {
      const pending = localStorage.getItem(lsPendingKey)
      if (pending) syncToSupabase(Number(pending), profileId)
    }
    prevOnline.current = isOnline
  }, [isOnline, profileId, lsPendingKey, syncToSupabase])

  useEffect(() => {
    if (!profileId || !isOnline) return
    supabase.from('user_context').select('value')
      .eq('profile_id', profileId).eq('key', 'water_goal_ml').single()
      .then(({ data }) => {
        if (data?.value) { const g = Number(data.value); setGoal(g); localStorage.setItem(lsGoalKey, String(g)) }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, isOnline])

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
    <div style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
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

      <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 99, marginBottom: 12, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: reached ? '#F59E0B' : 'rgba(245,158,11,0.55)', borderRadius: 99, transition: 'width 0.3s ease' }} />
      </div>

      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: reached ? '#F59E0B' : 'rgba(255,255,255,0.8)', letterSpacing: '-0.02em', lineHeight: 1 }}>{amount}</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)', marginLeft: 4 }}>/ {goal} ml</span>
      </div>

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

function HabitRow({ habit, done, onToggle, liveStreak }: {
  habit: Habit; done: boolean; onToggle: () => void; liveStreak?: number
}) {
  const displayStreak = liveStreak !== undefined ? liveStreak : habit.streak
  return (
    <div className="flex items-center gap-3 py-3 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
      <button
        onClick={onToggle}
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
          {habits.map(h => (
            <HabitRow key={h.id} habit={h} done={done.has(h.id)} onToggle={() => onToggle(h.id)} liveStreak={streakMap[h.id]} />
          ))}
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

// ─── Habit editor modal ───────────────────────────────────────────────────────

const fieldStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10, color: '#ededed', fontSize: 14, padding: '10px 12px', outline: 'none',
  boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.35)', margin: '0 0 6px 2px', display: 'block',
}

function HabitEditor({ initial, isNew, onSave, onDelete, onClose }: {
  initial: HabitForm
  isNew: boolean
  onSave: (form: HabitForm) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<HabitForm>(initial)
  const [busy, setBusy] = useState<null | 'save' | 'delete'>(null)
  const [err, setErr] = useState('')
  const isPack = form.group === 'imunita' || form.group === 'fyzicka'

  const set = <K extends keyof HabitForm>(k: K, v: HabitForm[K]) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.name.trim()) { setErr('Název nesmí být prázdný.'); return }
    setBusy('save'); setErr('')
    try { await onSave(form) } catch (e) { setErr(e instanceof Error ? e.message : 'Chyba'); setBusy(null) }
  }
  async function handleDelete() {
    if (!onDelete) return
    setBusy('delete'); setErr('')
    try { await onDelete() } catch (e) { setErr(e instanceof Error ? e.message : 'Chyba'); setBusy(null) }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, background: '#0e0e0e',
          borderTopLeftRadius: 18, borderTopRightRadius: 18,
          border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none',
          padding: '20px 20px 28px', maxHeight: '88vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#F59E0B', margin: 0 }}>
            {isNew ? 'Nový habit' : 'Upravit habit'}
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Název</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Např. Anki procvičování" style={fieldStyle} autoFocus={isNew} />
          </div>

          <div>
            <label style={labelStyle}>Skupina</label>
            <select value={form.group} onChange={e => set('group', e.target.value as HabitGroup)} style={{ ...fieldStyle, appearance: 'none' }}>
              {(Object.keys(GROUP_LABELS) as HabitGroup[]).map(g => (
                <option key={g} value={g} style={{ background: '#0e0e0e' }}>{GROUP_LABELS[g]}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Frekvence</label>
              <input value={form.frequency} onChange={e => set('frequency', e.target.value)} placeholder="denně · 3×/tý" style={fieldStyle} />
            </div>
            {isPack && (
              <div style={{ width: 90 }}>
                <label style={labelStyle}>Kód</label>
                <input value={form.packCode} onChange={e => set('packCode', e.target.value)} placeholder="A" maxLength={3} style={fieldStyle} />
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>Slouží (dimenze)</label>
            <input value={form.serves} onChange={e => set('serves', e.target.value)} placeholder="japonština · sen" style={fieldStyle} />
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>{form.group === 'active' ? 'End-date (volitelné)' : 'Konec triálu (volitelné)'}</label>
              <input type="date" value={form.until} onChange={e => set('until', e.target.value)} style={{ ...fieldStyle, colorScheme: 'dark' }} />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 2px' }}>
            <input type="checkbox" checked={form.mandatory} onChange={e => set('mandatory', e.target.checked)} style={{ width: 18, height: 18, accentColor: '#F59E0B' }} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Povinné — bez grace dne (streak padá při 1 vynechání)</span>
          </label>

          {err && <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{err}</p>}

          <button
            onClick={handleSave}
            disabled={busy !== null}
            style={{ background: '#F59E0B', color: '#080808', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, padding: '12px 0', cursor: busy ? 'wait' : 'pointer', marginTop: 4 }}
          >
            {busy === 'save' ? 'Ukládám…' : isNew ? 'Přidat habit' : 'Uložit změny'}
          </button>

          {!isNew && onDelete && (
            <button
              onClick={handleDelete}
              disabled={busy !== null}
              style={{ background: 'transparent', color: 'rgba(239,68,68,0.8)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, fontSize: 13, fontWeight: 600, padding: '10px 0', cursor: busy ? 'wait' : 'pointer' }}
            >
              {busy === 'delete' ? 'Odebírám…' : 'Odebrat habit'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HabitsPage() {
  const today = new Date()
  const dateKey = todayISO()
  const isOnline = useOnlineStatus()

  const [habits, setHabits] = useState<Habit[]>([])
  const [habitsFromDb, setHabitsFromDb] = useState(false)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [profileId, setProfileId] = useState<string | null>(null)
  const [streakMap, setStreakMap] = useState<Record<string, number>>({})
  const [dataLoaded, setDataLoaded] = useState(false)
  const [editMode, setEditMode] = useState(false)
  // null = closed; { habit } = edit existing; { habit: null } = add new
  const [editor, setEditor] = useState<null | { habit: Habit | null }>(null)

  const groups = useMemo(() => groupHabits(habits), [habits])

  // LS fast-path + async DB load
  useEffect(() => {
    const lsList = localStorage.getItem(LS_HABIT_LIST)
    const lsDone = localStorage.getItem(`hikari_habits_${dateKey}`)
    const lsPid  = localStorage.getItem(LS_PROFILE_ID)
    const lsSmap = localStorage.getItem(LS_STREAK_MAP)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (lsList) { try { const l = JSON.parse(lsList) as Habit[]; if (l.length) { setHabits(l); setHabitsFromDb(true) } } catch {} }
    if (lsDone) { try { setDone(new Set(JSON.parse(lsDone))) } catch {} }
    if (lsPid)  { setProfileId(lsPid) }
    if (lsSmap) { try { setStreakMap(JSON.parse(lsSmap)) } catch {} }
    if (lsList) { setDataLoaded(true) }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user
      if (!user) { setDataLoaded(true); return }

      const pid = await getProfileId(user).catch(() => null)
      if (!pid) { setDataLoaded(true); return }
      setProfileId(pid)
      localStorage.setItem(LS_PROFILE_ID, pid)

      const dbHabits = await loadHabits(pid).catch(() => null)
      if (dbHabits && dbHabits.length) {
        setHabits(dbHabits)
        setHabitsFromDb(true)
        localStorage.setItem(LS_HABIT_LIST, JSON.stringify(dbHabits))
      }

      const ids = (dbHabits ?? []).map(h => h.id)
      const [dbDone, dbStreaks] = await Promise.all([
        loadTodayDone(ids, dateKey).catch(() => new Set<string>()),
        // Recompute streaks (break the ones with a missed day) before showing them
        reconcileStreaks(dbHabits ?? [], dateKey).catch(() => ({} as Record<string, number>)),
      ])

      if (Object.keys(dbStreaks).length > 0) {
        setStreakMap(dbStreaks)
        localStorage.setItem(LS_STREAK_MAP, JSON.stringify(dbStreaks))
      }
      setDone(prev => {
        const merged = new Set([...prev, ...dbDone])
        localStorage.setItem(`hikari_habits_${dateKey}`, JSON.stringify([...merged]))
        return merged
      })
      setDataLoaded(true)
    }).catch(err => { console.error(err); setDataLoaded(true) })
  }, [dateKey])

  // Idempotent pending-queue flush on reconnect (ids are DB UUIDs)
  useEffect(() => {
    if (!isOnline || !profileId || !habitsFromDb) return
    const pendingKey = `hikari_habits_pending_${dateKey}`
    const raw = localStorage.getItem(pendingKey)
    if (!raw) return
    const pending = JSON.parse(raw) as Record<string, 'done' | 'fail'>
    const entries = Object.entries(pending)
    if (!entries.length) return

    Promise.all(
      entries.map(([id, status]) =>
        supabase.from('habit_logs')
          .upsert({ habit_id: id, date: dateKey, status, source: 'dashboard' }, { onConflict: 'habit_id,date' })
          .then(async ({ error }) => {
            if (error) return
            const real = await bumpStreak(id, status === 'done', dateKey)
            setStreakMap(prev => ({ ...prev, [id]: real }))
          })
      )
    ).then(() => localStorage.removeItem(pendingKey))
  }, [isOnline, profileId, habitsFromDb, dateKey])

  // Optimistic toggle + offline queue
  const toggle = (id: string) => {
    const nowDone = !done.has(id)
    const next = new Set(done)
    if (nowDone) next.add(id); else next.delete(id)
    setDone(next)
    localStorage.setItem(`hikari_habits_${dateKey}`, JSON.stringify([...next]))

    setStreakMap(prev => ({
      ...prev,
      [id]: Math.max(0, (prev[id] ?? 0) + (nowDone ? 1 : -1)),
    }))

    // No DB habit row yet (offline, logged out, or pre-sync fallback) → queue
    if (!profileId || !habitsFromDb || !isOnline) {
      const pendingKey = `hikari_habits_pending_${dateKey}`
      const pending = JSON.parse(localStorage.getItem(pendingKey) ?? '{}') as Record<string, 'done' | 'fail'>
      pending[id] = nowDone ? 'done' : 'fail'
      localStorage.setItem(pendingKey, JSON.stringify(pending))
      return
    }

    supabase.from('habit_logs').upsert(
      { habit_id: id, date: dateKey, status: nowDone ? 'done' : 'fail', source: 'dashboard' },
      { onConflict: 'habit_id,date' }
    ).then(async ({ error }) => {
      if (error) { console.error('habit_logs upsert error:', error); return }
      const newStreak = await bumpStreak(id, nowDone, dateKey)
      setStreakMap(prev => ({ ...prev, [id]: newStreak }))
    })
  }

  const doneCount = groups.trackable.filter(h => done.has(h.id)).length
  const totalCount = groups.trackable.length
  const allDone = doneCount === totalCount && totalCount > 0

  // Hero: habit with the highest current streak (streaks_cache, else baseline)
  const heroHabit = habits.reduce((best, h) => {
    const val = streakMap[h.id] ?? h.streak ?? 0
    return val > (streakMap[best.id] ?? best.streak ?? 0) ? h : best
  }, habits[0] ?? ALL_HABITS[0])
  const heroStreak = streakMap[heroHabit?.id] ?? heroHabit?.streak ?? 0

  return (
    <div style={{ minHeight: '100vh', color: '#ededed', overflowX: 'hidden' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px 80px' }}>

        {/* Header */}
        <header style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', paddingTop: 14, paddingBottom: 28 }}>
          <Link href="/" style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.02em', color: '#F59E0B', textDecoration: 'none' }}>
            光 Hikari
          </Link>

          <span suppressHydrationWarning style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', textTransform: 'capitalize', whiteSpace: 'nowrap', textAlign: 'center' }}>
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

        {/* Below-header content: skeleton overlays invisible real content until loaded */}
        <div style={{ position: 'relative' }}>

          {/* Skeleton — absolutely positioned, visible while loading */}
          {!dataLoaded && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1, pointerEvents: 'none' }}>
              <HabitsSkeleton />
            </div>
          )}

          {/* Real content — opacity 0 while loading, fades in when ready */}
          <div style={{ opacity: dataLoaded ? 1 : 0, transition: 'opacity 0.35s ease' }}>

            {/* Streak hero */}
            <div style={{ position: 'relative', textAlign: 'center', marginBottom: 36, padding: '8px 0' }}>
              <StrawHatFigure />
              <div style={{ position: 'relative', zIndex: 1, fontSize: 64, fontWeight: 900, color: '#F59E0B', lineHeight: 1, letterSpacing: '-0.02em' }}>{heroStreak}</div>
              <div style={{ position: 'relative', zIndex: 1, fontSize: 12, color: 'rgba(255,255,255,0.28)', marginTop: 6, letterSpacing: '0.04em' }}>dní v řadě · {heroHabit.name}</div>
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

            {/* Voda */}
            <section>
              <SectionLabel>Voda</SectionLabel>
              <WaterTracker profileId={profileId} isOnline={isOnline} />
            </section>

            {/* Aktivní */}
            <section style={{ marginBottom: 20 }}>
              <SectionLabel>Aktivní</SectionLabel>
              <div style={{ background: '#0e0e0e', borderRadius: 14, padding: '0 16px' }}>
                {groups.active.map(h => (
                  <HabitRow key={h.id} habit={h} done={done.has(h.id)} onToggle={() => toggle(h.id)} liveStreak={streakMap[h.id]} />
                ))}
              </div>
            </section>

            {/* Testovací */}
            <section style={{ marginBottom: 20 }}>
              <SectionLabel>Testovací</SectionLabel>
              <div style={{ background: '#0e0e0e', borderRadius: 14, padding: '0 16px' }}>
                {groups.trialSolo.map(h => (
                  <HabitRow key={h.id} habit={h} done={done.has(h.id)} onToggle={() => toggle(h.id)} liveStreak={streakMap[h.id]} />
                ))}
              </div>
            </section>

            {/* Balíčky */}
            <section style={{ marginBottom: 20 }}>
              <SectionLabel>Balíčky</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <PackSection title="Imunita" subtitle="Trial · do 30.6." habits={groups.imunita} done={done} onToggle={toggle} streakMap={streakMap} />
                <PackSection title="Fyzička" subtitle="Trial · od ~5.6." habits={groups.fyzicka} done={done} onToggle={toggle} streakMap={streakMap} />
              </div>
            </section>

            {/* Zautomatizováno */}
            <section>
              <SectionLabel>Zautomatizováno</SectionLabel>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {groups.graduated.map(h => (
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

          </div>{/* end real content */}
        </div>{/* end relative wrapper */}

      </div>
    </div>
  )
}
