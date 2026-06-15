'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { ReactNode, CSSProperties } from 'react'

// ─── Hikari Refresh Button ────────────────────────────────────────────────────

function HikariRefreshButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  async function handleRefresh() {
    setState('loading')
    setMsg('')
    try {
      const res = await fetch('/api/hikari/refresh', { method: 'POST' })
      const data = await res.json() as { ok?: boolean; brief?: string | { error: string | null }; error?: string }
      if (data.ok && data.brief === 'generated') {
        setState('ok')
        setMsg('Brief vygenerován ✓')
      } else if (data.ok) {
        setState('ok')
        setMsg('Streaky přepočítány ✓')
      } else {
        setState('error')
        setMsg(data.error ?? 'Chyba')
      }
    } catch {
      setState('error')
      setMsg('Síťová chyba')
    }
  }

  const borderColor = state === 'ok' ? 'rgba(34,197,94,0.4)' : state === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.35)'
  const textColor   = state === 'ok' ? 'rgba(34,197,94,0.8)'  : state === 'error' ? 'rgba(239,68,68,0.75)' : 'rgba(245,158,11,0.65)'
  const label       = state === 'loading' ? '↻ Počítám…' : state === 'ok' ? msg : state === 'error' ? `⚠ ${msg}` : '✦ Přepočítej Hikari'

  return (
    <button
      onClick={handleRefresh}
      disabled={state === 'loading'}
      style={{
        flex: 1, background: 'transparent', border: `1px solid ${borderColor}`, borderRadius: 10,
        color: textColor, fontSize: 11, letterSpacing: '0.04em', padding: '6px 10px',
        cursor: state === 'loading' ? 'wait' : 'pointer', transition: 'all 0.15s',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

// ─── Vault Sync Button ────────────────────────────────────────────────────────

function VaultSyncButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [msg, setMsg] = useState('')

  async function handleSync() {
    setState('loading')
    setMsg('')
    try {
      const res = await fetch('/api/vault-sync', { method: 'POST' })
      const data = await res.json() as { synced?: boolean; files?: string[]; errors?: string[]; error?: string }
      if (data.synced) {
        setState('ok')
        setMsg(`${data.files?.length ?? 0} files synced ✓`)
      } else {
        setState('error')
        setMsg(data.errors?.[0] ?? data.error ?? 'Chyba syncu')
      }
    } catch {
      setState('error')
      setMsg('Síťová chyba')
    }
  }

  const borderColor =
    state === 'ok'    ? 'rgba(34,197,94,0.4)' :
    state === 'error' ? 'rgba(239,68,68,0.4)' :
    'rgba(245,158,11,0.35)'

  const textColor =
    state === 'ok'    ? 'rgba(34,197,94,0.8)' :
    state === 'error' ? 'rgba(239,68,68,0.75)' :
    'rgba(245,158,11,0.65)'

  const label =
    state === 'loading' ? '↻ Syncing…' :
    state === 'ok'      ? msg :
    state === 'error'   ? `⚠ ${msg}` :
    '↻ Sync s vaultem'

  return (
    <button
      onClick={handleSync}
      disabled={state === 'loading'}
      style={{
        flex: 1, background: 'transparent', border: `1px solid ${borderColor}`, borderRadius: 10,
        color: textColor, fontSize: 11, letterSpacing: '0.04em', padding: '6px 10px',
        cursor: state === 'loading' ? 'wait' : 'pointer', transition: 'all 0.15s',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

// ─── Static data (hardcoded until V2) ────────────────────────────────────────

const ENERGY_BLOCKS = [
  { label: '6–8', level: 'low' },
  { label: '8–10', level: 'high' },
  { label: '10–12', level: 'high' },
  { label: '12–14', level: 'mid' },
  { label: '14–16', level: 'mid' },
  { label: '16–18', level: 'high' },
  { label: '18–20', level: 'low' },
  { label: '20–22', level: 'low' },
] as const

const ENERGY_COLOR: Record<string, string> = {
  high: '#22c55e',
  mid: '#eab308',
  low: '#ef4444',
}

// Fallback shown only when the weekly vault file is missing or unparseable.
const FALLBACK_MAIN: PriorityItem[] = [
  { name: 'Hikari Dashboard', detail: 'Home + Cascade + Kibou', kind: 'main' },
  { name: 'Autoškola testy A1', detail: '2× sezení', kind: 'main' },
  { name: 'Anki 25+ karet', detail: 'japonština · streak', kind: 'main' },
]

// ─── LS keys (shared with habits page) ───────────────────────────────────────

const LS_STREAK_MAP = 'hikari_streak_map'
const LS_HABIT_MAP  = 'hikari_habit_id_map'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCzechDate(d: Date): string {
  const dny = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota']
  const mesice = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince']
  return `${dny[d.getDay()]} ${d.getDate()}. ${mesice[d.getMonth()]}`
}

// ─── Components ───────────────────────────────────────────────────────────────

function LuffySilhouette({ opacity = 0.06, right = -10, height = 160 }: {
  opacity?: number; right?: number; height?: number
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/luffy.jpg"
      alt=""
      aria-hidden="true"
      style={{
        position: 'absolute', top: '50%', right,
        transform: 'translateY(-50%)', height, width: 'auto',
        pointerEvents: 'none', userSelect: 'none', zIndex: 0,
        filter: 'invert(1) grayscale(1)', mixBlendMode: 'screen', opacity,
      }}
    />
  )
}

function TaskRow({ name, detail, dim = false, last = false }: {
  name: string; detail?: string; dim?: boolean; last?: boolean
}) {
  return (
    <div style={{ padding: '10px 14px', borderBottom: last ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ fontSize: 13, color: dim ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.85)', lineHeight: 1.35 }}>
        {name}
      </div>
      {detail && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', lineHeight: 1.4, marginTop: 3 }}>
          {detail}
        </div>
      )}
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', margin: '0 0 8px 2px' }}>
      {children}
    </p>
  )
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: '#0e0e0e', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', ...style }}>
      {children}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PriorityKind = 'main' | 'side' | 'bonus'
type PriorityItem = { name: string; detail: string; kind: PriorityKind }

interface HomeData {
  habitsDone: number
  habitsTotal: number
  streakValue: number
  streakHabit: string
  hopeToday: { mood: number; energy: number; hope: number } | null
  weekTitle: string
  weekProgress: number
  mainTasks: PriorityItem[]
  sideTasks: PriorityItem[]
  bonusTasks: PriorityItem[]
  aiNudge:       string | null
  aiReasoning:   string | null
  aiGeneratedAt: string | null
}

const FALLBACK_STREAK = 45

export default function HomePage() {
  const today = new Date()
  const dateKey = today.toISOString().slice(0, 10)

  const [data, setData] = useState<HomeData>({
    habitsDone: 0,
    habitsTotal: 0,
    streakValue: FALLBACK_STREAK,
    streakHabit: 'Anki',
    hopeToday: null,
    weekTitle: 'W23',
    aiNudge: null, aiReasoning: null, aiGeneratedAt: null,
    weekProgress: 0,
    mainTasks: FALLBACK_MAIN,
    sideTasks: [],
    bonusTasks: [],
  })

  useEffect(() => {
    // LS fast path — synchronous, before first async tick
    const lsDone    = localStorage.getItem(`hikari_habits_${dateKey}`)
    const lsStreaks = localStorage.getItem(LS_STREAK_MAP)
    const lsMap     = localStorage.getItem(LS_HABIT_MAP)

    const lsHabitsDone  = lsDone    ? (JSON.parse(lsDone) as string[]).length   : null
    const lsHabitsTotal = lsMap     ? Object.keys(JSON.parse(lsMap) as object).length : null
    const lsStreak      = lsStreaks
      ? Math.max(0, ...Object.values(JSON.parse(lsStreaks) as Record<string, number>))
      : null

    if (lsHabitsDone !== null || lsHabitsTotal !== null || lsStreak !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(prev => ({
        ...prev,
        habitsDone:  lsHabitsDone  ?? prev.habitsDone,
        habitsTotal: lsHabitsTotal ?? prev.habitsTotal,
        streakValue: lsStreak      ?? prev.streakValue,
      }))
    }

    // Async Supabase fetch (online only — errors silently)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles').select('id').eq('auth_user_id', user.id).single()
      if (!profile) return
      const profileId = profile.id

      const [habitsRes, hopeRes] = await Promise.all([
        supabase.from('habits').select('id, name, category').eq('profile_id', profileId),
        supabase.from('hope_logs').select('mood, energy, hope')
          .eq('profile_id', profileId).eq('date', dateKey)
          .order('logged_at', { ascending: false }).limit(1).maybeSingle(),
      ])

      const allHabits = habitsRes.data ?? []
      const allHabitIds = allHabits.map(h => h.id)
      const trackableIds = allHabits.filter(h => h.category !== 'graduated').map(h => h.id)

      const [logsRes, maxStreakRes, weekLayerRes, briefRes] = await Promise.all([
        trackableIds.length > 0
          ? supabase.from('habit_logs').select('*', { count: 'exact', head: true })
              .in('habit_id', trackableIds).eq('date', dateKey).eq('status', 'done')
          : Promise.resolve({ count: 0 }),
        // MAX streak across all habits (not just Anki)
        allHabitIds.length > 0
          ? supabase.from('streaks_cache').select('habit_id, current_streak')
              .in('habit_id', allHabitIds)
              .order('current_streak', { ascending: false })
              .limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
        // Cascade layer 5 (current week) for tasks + cascade card.
        // `kind`/`detail`/`sort_order` arrive in migration 004 — Supabase
        // ignores unknown columns gracefully if the migration hasn't run.
        supabase.from('cascade_layers')
          .select('title, description, progress_pct, cascade_dimensions(name, detail, kind, sort_order)')
          .eq('profile_id', profileId).eq('tree', 'sen').eq('layer', 5)
          .maybeSingle(),
        supabase.from('ai_daily_brief')
          .select('cascade_nudge, reasoning, generated_at')
          .eq('profile_id', profileId).eq('date', dateKey)
          .maybeSingle(),
      ])

      const topStreak = (maxStreakRes as { data: { habit_id: string; current_streak: number } | null }).data
      const topHabitName = topStreak
        ? (allHabits.find(h => h.id === topStreak.habit_id)?.name ?? 'Anki')
        : 'Anki'

      type WeekDim = { name: string; detail: string | null; kind: PriorityKind | null; sort_order: number | null }
      const weekLayer = (weekLayerRes as { data: { title: string; description: string | null; progress_pct: number | null; cascade_dimensions: WeekDim[] } | null }).data
      const weekDims  = weekLayer?.cascade_dimensions ?? []
      // Week token like "W24" comes from the layer description ("W24 · 8.–14.6.")
      const weekToken = weekLayer?.description?.match(/W\d+/)?.[0] ?? weekLayer?.title ?? 'W23'

      const sorted = [...weekDims].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      const toItem = (d: WeekDim, fallbackKind: PriorityKind): PriorityItem => ({
        name:   d.name,
        detail: d.detail ?? '',
        kind:   d.kind ?? fallbackKind,
      })
      // Pre-migration-004 rows have kind=null → treat as main so they still render.
      const mainTasks  = sorted.filter(d => (d.kind ?? 'main') === 'main') .map(d => toItem(d, 'main'))
      const sideTasks  = sorted.filter(d =>  d.kind === 'side')            .map(d => toItem(d, 'side'))
      const bonusTasks = sorted.filter(d =>  d.kind === 'bonus')           .map(d => toItem(d, 'bonus'))

      const brief = (briefRes as { data: { cascade_nudge: string | null; reasoning: string | null; generated_at: string | null } | null }).data

      setData({
        habitsDone:   (logsRes as { count: number | null }).count ?? 0,
        habitsTotal:  trackableIds.length,
        streakValue:  topStreak?.current_streak ?? FALLBACK_STREAK,
        streakHabit:  topHabitName,
        hopeToday:    hopeRes.data ?? null,
        weekTitle:    weekToken,
        weekProgress: weekLayer?.progress_pct ?? 0,
        mainTasks:    mainTasks.length > 0 ? mainTasks : FALLBACK_MAIN,
        sideTasks,
        bonusTasks,
        aiNudge:       brief?.cascade_nudge ?? null,
        aiReasoning:   brief?.reasoning     ?? null,
        aiGeneratedAt: brief?.generated_at  ?? null,
      })
    }).catch(() => {})
  }, [dateKey])

  const { habitsDone, habitsTotal, streakValue, streakHabit, hopeToday, weekTitle, mainTasks, sideTasks, bonusTasks, aiNudge, aiReasoning, aiGeneratedAt } = data
  const weekTaskCount = mainTasks.length + sideTasks.length + bonusTasks.length

  return (
    <div style={{ minHeight: '100vh', background: '#080808', color: '#ededed', fontFamily: 'var(--font-geist-sans, sans-serif)' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px 80px' }}>

        {/* ── Header ── */}
        <header style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', paddingTop: 14, paddingBottom: 24 }}>
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '0.02em', color: '#F59E0B' }}>光 Hikari</span>
          <span suppressHydrationWarning style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', textTransform: 'capitalize', whiteSpace: 'nowrap', textAlign: 'center' }}>
            {formatCzechDate(today)}
          </span>
          <div />
        </header>

        {/* ── Streak hero ── */}
        <div style={{ position: 'relative', textAlign: 'center', marginBottom: 28, padding: '4px 0 12px' }}>
          <LuffySilhouette opacity={0.06} />
          <div suppressHydrationWarning style={{ position: 'relative', zIndex: 1, fontSize: 72, fontWeight: 900, color: '#F59E0B', lineHeight: 1, letterSpacing: '-0.03em' }}>
            {streakValue}
          </div>
          <div style={{ position: 'relative', zIndex: 1, fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 6, letterSpacing: '0.06em' }}>
            dní v řadě · {streakHabit}
          </div>
        </div>

        {/* ── Quick cards: Habits + Cascade ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>

          <Link href="/habits" style={{ textDecoration: 'none' }}>
            <Card style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                Habits dnes
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span suppressHydrationWarning style={{ fontSize: 26, fontWeight: 800, color: habitsDone > 0 ? '#F59E0B' : 'rgba(255,255,255,0.3)', lineHeight: 1 }}>
                  {habitsDone}
                </span>
                <span suppressHydrationWarning style={{ fontSize: 14, color: 'rgba(255,255,255,0.2)' }}>
                  /{habitsTotal > 0 ? habitsTotal : '—'}
                </span>
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', marginTop: 4 }}>
                klepni pro tracker →
              </div>
            </Card>
          </Link>

          <Link href="/cascade" style={{ textDecoration: 'none' }}>
            <Card style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                Cascade
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                <span suppressHydrationWarning style={{ fontSize: 26, fontWeight: 800, color: '#F59E0B', lineHeight: 1 }}>{weekTitle}</span>
                <span suppressHydrationWarning style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1 }}>· {weekTaskCount} priority</span>
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', marginTop: 8 }}>aktuální týden · klepni →</div>
            </Card>
          </Link>
        </div>

        {/* ── HOPE card ── */}
        <Link href="/kibou" style={{ textDecoration: 'none', display: 'block', marginBottom: 20 }}>
          <Card style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                  きぼう — dnešní stav
                </div>
                {hopeToday ? (
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 6 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#F59E0B', lineHeight: 1 }}>{hopeToday.hope}</div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>hope</div>
                    </div>
                    <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.06)' }} />
                    <div style={{ display: 'flex', gap: 10 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/kibou/mood.png" alt="" aria-hidden="true" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                        {hopeToday.mood}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/kibou/energy.png" alt="" aria-hidden="true" style={{ width: 16, height: 16, objectFit: 'contain' }} />
                        {hopeToday.energy}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
                    Zatím nezaznamenáno — klepni pro zadání
                  </div>
                )}
              </div>
              <div style={{ fontSize: 20, opacity: 0.4, marginLeft: 12 }}>→</div>
            </div>
          </Card>
        </Link>

        {/* ── Hikari Brief (AI nudge) ── */}
        {(aiNudge ?? aiReasoning) && (
          <section style={{ marginBottom: 20 }}>
            <SectionLabel>Hikari dnes</SectionLabel>
            <Card style={{ padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
              <LuffySilhouette opacity={0.05} height={100} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                {aiNudge && (
                  <p style={{ fontSize: 13, color: '#F59E0B', lineHeight: 1.6, margin: '0 0 8px', fontStyle: 'italic' }}>
                    &ldquo;{aiNudge}&rdquo;
                  </p>
                )}
                {aiReasoning && (
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5, margin: 0 }}>
                    {aiReasoning}
                  </p>
                )}
                {aiGeneratedAt && (
                  <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.12)', margin: '8px 0 0' }}>
                    {new Date(aiGeneratedAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </Card>
          </section>
        )}

        {/* ── Energie — časová osa ── */}
        <section style={{ marginBottom: 20 }}>
          <SectionLabel>Energie dnes</SectionLabel>
          <Card style={{ position: 'relative', overflow: 'hidden', padding: '16px 14px 12px' }}>
            <LuffySilhouette opacity={0.06} height={120} />
            <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
              {ENERGY_BLOCKS.map(b => (
                <div key={b.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: '100%', height: 36, borderRadius: 6, background: ENERGY_COLOR[b.level], opacity: 0.55 }} />
                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', lineHeight: 1, textAlign: 'center' }}>{b.label}</span>
                </div>
              ))}
            </div>
            <div style={{ position: 'relative', zIndex: 1, fontSize: 9, color: 'rgba(255,255,255,0.18)', marginTop: 10, fontStyle: 'italic', textAlign: 'center' }}>
              Hikari sbírá data — rozvrh se zpřesní za 7 dní きぼう záznamy
            </div>
          </Card>
        </section>

        {/* ── Hlavní úkoly ── */}
        <section style={{ marginBottom: 20 }}>
          <SectionLabel>Hlavní úkoly</SectionLabel>
          <Card>
            {mainTasks.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px', borderBottom: i < mainTasks.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(245,158,11,0.6)', minWidth: 16, paddingTop: 1 }}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.35 }}>{t.name}</div>
                  {t.detail && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', lineHeight: 1.4, marginTop: 3 }}>{t.detail}</div>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </section>

        {/* ── Vedlejší úkoly + Bonus ── */}
        {(sideTasks.length > 0 || bonusTasks.length > 0) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            <section>
              <SectionLabel>Vedlejší</SectionLabel>
              <Card>
                {sideTasks.length > 0
                  ? sideTasks.map((t, i) => (
                      <TaskRow key={i} name={t.name} detail={t.detail} last={i === sideTasks.length - 1} />
                    ))
                  : <div style={{ padding: '12px 14px', fontSize: 11, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>—</div>}
              </Card>
            </section>
            <section>
              <SectionLabel>Bonus</SectionLabel>
              <Card>
                {bonusTasks.length > 0
                  ? bonusTasks.map((t, i) => (
                      <TaskRow key={i} name={t.name} detail={t.detail} dim last={i === bonusTasks.length - 1} />
                    ))
                  : <div style={{ padding: '12px 14px', fontSize: 11, color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>—</div>}
              </Card>
            </section>
          </div>
        )}

        {/* ── Zlepšení za měsíc ── */}
        <section style={{ marginBottom: 20 }}>
          <SectionLabel>Zlepšení za měsíc</SectionLabel>
          <Card style={{ padding: '16px 16px' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', textAlign: 'center', lineHeight: 1.6 }}>
              Hikari vyhodnotí koncem června —<br />habits + HOPE + cascade + milníky
            </div>
          </Card>
        </section>

        {/* ── Akce ── */}
        <div style={{ display: 'flex', gap: 8, paddingBottom: 8 }}>
          <HikariRefreshButton />
          <VaultSyncButton />
        </div>

      </div>
    </div>
  )
}
