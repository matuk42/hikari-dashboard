'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { ReactNode, CSSProperties } from 'react'

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
    <div style={{ textAlign: 'center', paddingBottom: 8 }}>
      <button
        onClick={handleSync}
        disabled={state === 'loading'}
        style={{
          background: 'transparent',
          border: `1px solid ${borderColor}`,
          borderRadius: 10,
          color: textColor,
          fontSize: 11,
          letterSpacing: '0.04em',
          padding: '6px 16px',
          cursor: state === 'loading' ? 'wait' : 'pointer',
          transition: 'all 0.15s',
          maxWidth: 260,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </button>
    </div>
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

const MAIN_TASKS = [
  { label: 'Hikari Dashboard: Home + Cascade + Kibou', tag: 'Kód · peak' },
  { label: 'Autoškola testy A1 · 2× sezení', tag: 'Autoškola · mandatory' },
  { label: 'Anki 25+ karet · japonština', tag: 'Japonština · streak' },
]

const SIDE_TASKS = [
  { label: 'Kytara 20 min', tag: 'DofE' },
  { label: 'Les 30 min', tag: 'Imunita' },
]

const BONUS_TASK = { label: '30 min One Piece — pasivní imerze', tag: 'Japonština' }

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

function TaskRow({ label, tag, dim = false }: { label: string; tag: string; dim?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontSize: 13, color: dim ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.82)', lineHeight: 1.4, flex: 1, paddingRight: 8 }}>{label}</span>
      <span style={{ fontSize: 10, color: 'rgba(245,158,11,0.55)', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: 6, padding: '2px 6px', whiteSpace: 'nowrap', flexShrink: 0 }}>{tag}</span>
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

interface HomeData {
  habitsDone: number
  habitsTotal: number
  streakValue: number
  streakHabit: string
  hopeToday: { mood: number; energy: number; hope: number } | null
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
  })

  useEffect(() => {
    // LS fast path — synchronous, before first async tick
    const lsDone    = localStorage.getItem(`hikari_habits_${dateKey}`)
    const lsStreaks = localStorage.getItem(LS_STREAK_MAP)
    const lsMap     = localStorage.getItem(LS_HABIT_MAP)

    const lsHabitsDone  = lsDone    ? (JSON.parse(lsDone) as string[]).length   : null
    const lsHabitsTotal = lsMap     ? Object.keys(JSON.parse(lsMap) as object).length : null
    const lsStreak      = lsStreaks ? ((JSON.parse(lsStreaks) as Record<string, number>)['anki'] ?? null) : null

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
      const trackableIds = allHabits.filter(h => h.category !== 'graduated').map(h => h.id)
      const ankiHabit = allHabits.find(h => h.name === 'Anki procvičování')

      const [logsRes, ankiStreakRes] = await Promise.all([
        trackableIds.length > 0
          ? supabase.from('habit_logs').select('*', { count: 'exact', head: true })
              .in('habit_id', trackableIds).eq('date', dateKey).eq('status', 'done')
          : Promise.resolve({ count: 0 }),
        ankiHabit
          ? supabase.from('streaks_cache').select('current_streak')
              .eq('habit_id', ankiHabit.id).single()
          : Promise.resolve({ data: null }),
      ])

      setData({
        habitsDone:  (logsRes as { count: number | null }).count ?? 0,
        habitsTotal: trackableIds.length,
        streakValue: (ankiStreakRes as { data: { current_streak: number } | null }).data?.current_streak ?? FALLBACK_STREAK,
        streakHabit: 'Anki',
        hopeToday:   hopeRes.data ?? null,
      })
    }).catch(() => {})
  }, [dateKey])

  const { habitsDone, habitsTotal, streakValue, streakHabit, hopeToday } = data

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
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span style={{ fontSize: 26, fontWeight: 800, color: '#F59E0B', lineHeight: 1 }}>W23</span>
              </div>
              <div style={{ marginTop: 6, height: 4, background: '#1a1a1a', borderRadius: 2 }}>
                <div style={{ height: '100%', width: '67%', background: 'linear-gradient(to right, #d97706, #F59E0B)', borderRadius: 2 }} />
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', marginTop: 4 }}>67% · klepni →</div>
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
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>😌 {hopeToday.mood}</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>⚡ {hopeToday.energy}</span>
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
            {MAIN_TASKS.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px', borderBottom: i < MAIN_TASKS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(245,158,11,0.6)', minWidth: 16, paddingTop: 1 }}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 1.4 }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: 'rgba(245,158,11,0.45)', marginTop: 3 }}>{t.tag}</div>
                </div>
              </div>
            ))}
          </Card>
        </section>

        {/* ── Vedlejší úkoly + Bonus ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          <section>
            <SectionLabel>Vedlejší</SectionLabel>
            <Card>
              {SIDE_TASKS.map((t, i) => <TaskRow key={i} label={t.label} tag={t.tag} />)}
            </Card>
          </section>
          <section>
            <SectionLabel>Bonus</SectionLabel>
            <Card>
              <TaskRow label={BONUS_TASK.label} tag={BONUS_TASK.tag} dim />
            </Card>
          </section>
        </div>

        {/* ── Zlepšení za měsíc ── */}
        <section style={{ marginBottom: 20 }}>
          <SectionLabel>Zlepšení za měsíc</SectionLabel>
          <Card style={{ padding: '16px 16px' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic', textAlign: 'center', lineHeight: 1.6 }}>
              Hikari vyhodnotí koncem června —<br />habits + HOPE + cascade + milníky
            </div>
          </Card>
        </section>

        {/* ── Vault sync ── */}
        <VaultSyncButton />

      </div>
    </div>
  )
}
