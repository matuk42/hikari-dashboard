'use client'

import { useState } from 'react'
import Link from 'next/link'

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
}

// ─── Data z vaultu (habits.md) ───────────────────────────────────────────────

const ALL_HABITS: Habit[] = [
  // Active
  {
    id: 'anki',
    name: 'Anki procvičování',
    status: 'active',
    serves: 'japonština · sen',
    frequency: '25+ karet denně',
    streak: 45,
  },
  {
    id: 'autoschola',
    name: 'Autoškola testy A1',
    status: 'active',
    serves: 'motorky · svoboda pohybu',
    frequency: '2× denně',
    streak: 2,
    endDate: '30.6.',
  },
  // Trial solo
  {
    id: 'mining',
    name: 'Anki tvorba',
    status: 'trial',
    serves: 'japonština · sen',
    frequency: '200 karet / týden',
    streak: 0,
    trialEnd: '30.6.',
  },
  {
    id: 'kytara',
    name: 'Kytara',
    status: 'trial',
    serves: 'DofE talent',
    frequency: '3× týdně · 20 min',
    streak: 1,
    trialEnd: '30.6.',
  },
  // Balíček Imunita
  { id: 'spanek',     name: 'Spánek 22:00–06:15',    status: 'trial', serves: 'imunita · fyzička',       frequency: 'denně',   streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'A' },
  { id: 'vitd3',      name: 'Vit D3 1000 IU',         status: 'trial', serves: 'imunita',                 frequency: 'denně',   streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'B' },
  { id: 'zinek',      name: 'Zinek',                   status: 'trial', serves: 'imunita',                 frequency: '1×/tý',   streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'C' },
  { id: 'probiotika', name: 'Probiotika',              status: 'trial', serves: 'imunita',                 frequency: '3×/tý',   streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'D' },
  { id: 'voda',       name: '2 L vody',                status: 'trial', serves: 'imunita',                 frequency: 'denně',   streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'E' },
  { id: 'les',        name: '30 min v lese',           status: 'trial', serves: 'příroda · imunita · sen', frequency: '5×/tý',   streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'G' },
  { id: 'ovoce',      name: '2× ovoce + 0 sladké',    status: 'trial', serves: 'imunita',                 frequency: 'denně',   streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'H' },
  { id: 'vetrani',    name: 'Větrat ložnici',          status: 'trial', serves: 'imunita',                 frequency: 'denně',   streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'I' },
  { id: 'omega3',     name: 'Omega-3',                 status: 'trial', serves: 'imunita',                 frequency: '2×/tý',   streak: 0, trialEnd: '30.6.', pack: 'imunita', packCode: 'J' },
  // Balíček Fyzička
  { id: 'posilovani', name: 'Posilování calisthenics', status: 'trial', serves: 'fyzička · sen',       frequency: '3×/tý',    streak: 0, pack: 'fyzicka' },
  { id: 'sprcha',     name: 'Studená sprcha 30s',      status: 'trial', serves: 'imunita · fyzička',   frequency: 'denně',    streak: 0, pack: 'fyzicka' },
  { id: 'beh',        name: 'Běh',                     status: 'trial', serves: 'fyzička · sen',       frequency: '2–3×/tý',  streak: 0, pack: 'fyzicka' },
  { id: 'boulder',    name: 'Boulder',                 status: 'trial', serves: 'fyzička',             frequency: '1×/měs',   streak: 0, pack: 'fyzicka' },
  { id: 'kolo',       name: 'Kolo 100km+',             status: 'trial', serves: 'výpravy · fyzička',   frequency: 'dle plánu',streak: 0, pack: 'fyzicka' },
  // Graduated
  { id: 'imerze', name: 'Japonská imerze', status: 'graduated', serves: 'japonština · sen', frequency: 'denně', streak: 45 },
  { id: 'denik',  name: 'Hlasový deník',   status: 'graduated', serves: 'vault · meta',     frequency: 'denně', streak: 45 },
]

const ACTIVE    = ALL_HABITS.filter(h => h.status === 'active')
const TRIAL_SOLO = ALL_HABITS.filter(h => h.status === 'trial' && !h.pack)
const IMUNITA   = ALL_HABITS.filter(h => h.pack === 'imunita')
const FYZICKA   = ALL_HABITS.filter(h => h.pack === 'fyzicka')
const GRADUATED = ALL_HABITS.filter(h => h.status === 'graduated')
const TRACKABLE = ALL_HABITS.filter(h => h.status !== 'graduated')

const MAX_STREAK = Math.max(...ALL_HABITS.map(h => h.streak))

// ─── Date helper ─────────────────────────────────────────────────────────────

function formatCzechDate(d: Date): string {
  const dny = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota']
  const mesice = ['ledna','února','března','dubna','května','června','července','srpna','září','října','listopadu','prosince']
  return `${dny[d.getDay()]} ${d.getDate()}. ${mesice[d.getMonth()]}`
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

// ─── Habit row ────────────────────────────────────────────────────────────────

function HabitRow({
  habit,
  done,
  onToggle,
}: {
  habit: Habit
  done: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b last:border-0"
      style={{ borderColor: 'rgba(255,255,255,0.05)' }}>

      {/* Toggle circle */}
      <button
        onClick={onToggle}
        style={{
          flexShrink: 0,
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: done ? '2px solid #F59E0B' : '2px solid rgba(255,255,255,0.15)',
          background: done ? '#F59E0B' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease',
          cursor: 'pointer',
        }}
        aria-label={done ? 'Odznačit' : 'Splnit'}
      >
        {done && (
          <svg viewBox="0 0 24 24" fill="none" style={{ width: 13, height: 13 }}>
            <path d="M5 13l4 4L19 7" stroke="#080808" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Name + serves */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 14,
          fontWeight: 500,
          color: done ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.88)',
          margin: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          transition: 'color 0.15s',
          textDecorationLine: done ? 'line-through' : 'none',
          textDecorationColor: 'rgba(255,255,255,0.2)',
        }}>
          {habit.packCode && <span style={{ color: '#F59E0B', opacity: 0.5, marginRight: 4, fontSize: 11 }}>{habit.packCode}</span>}
          {habit.name}
        </p>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', margin: '2px 0 0' }}>
          {habit.serves}
        </p>
      </div>

      {/* Right: streak + frequency + end */}
      <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {habit.streak > 0 && (
          <span style={{ fontSize: 15, fontWeight: 700, color: '#F59E0B', lineHeight: 1 }}>
            {habit.streak}<span style={{ fontSize: 10, fontWeight: 400, color: 'rgba(245,158,11,0.55)', marginLeft: 1 }}>×</span>
          </span>
        )}
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', lineHeight: 1 }}>
          {habit.frequency}
        </span>
        {(habit.endDate || habit.trialEnd) && (
          <span style={{ fontSize: 9, color: 'rgba(245,158,11,0.30)', lineHeight: 1 }}>
            do {habit.endDate ?? habit.trialEnd}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Pack accordion ───────────────────────────────────────────────────────────

function PackSection({
  title,
  subtitle,
  habits,
  done,
  onToggle,
}: {
  title: string
  subtitle: string
  habits: Habit[]
  done: Set<string>
  onToggle: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const completedCount = habits.filter(h => done.has(h.id)).length
  const allPackDone = completedCount === habits.length

  return (
    <div style={{
      background: '#0e0e0e',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'transparent',
          cursor: 'pointer',
          border: 'none',
          color: 'inherit',
        }}
      >
        <div style={{ textAlign: 'left' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.65)' }}>{title}</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', marginLeft: 8 }}>{subtitle}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            color: allPackDone ? '#F59E0B' : 'rgba(255,255,255,0.25)',
          }}>
            {completedCount}/{habits.length}
          </span>
          <svg viewBox="0 0 24 24" fill="none" style={{
            width: 16, height: 16,
            color: 'rgba(255,255,255,0.25)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {open && (
        <div style={{ padding: '0 16px 8px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {habits.map(h => (
            <HabitRow key={h.id} habit={h} done={done.has(h.id)} onToggle={() => onToggle(h.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <p style={{
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.2)',
      margin: '0 0 8px 2px',
    }}>
      {children}
    </p>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function HabitsPage() {
  const today = new Date()
  const [done, setDone] = useState<Set<string>>(new Set())

  const toggle = (id: string) =>
    setDone(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const doneCount = TRACKABLE.filter(h => done.has(h.id)).length
  const totalCount = TRACKABLE.length
  const allDone = doneCount === totalCount && totalCount > 0

  return (
    <>
      <div style={{
        position: 'relative',
        zIndex: 1,
        minHeight: '100vh',
        color: '#ededed',
        overflowX: 'hidden',
      }}>
      {/* Scrollable content */}
      <div style={{
        maxWidth: 480,
        margin: '0 auto',
        padding: '0 20px 80px',
      }}>

        {/* ── Header ── */}
        <header style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          paddingTop: 14,
          paddingBottom: 28,
        }}>
          <Link href="/" style={{
            fontSize: 17,
            fontWeight: 700,
            letterSpacing: '0.02em',
            color: '#F59E0B',
            textDecoration: 'none',
          }}>
            光 Hikari
          </Link>

          <span style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.28)',
            textTransform: 'capitalize',
            whiteSpace: 'nowrap',
            textAlign: 'center',
          }}>
            {formatCzechDate(today)}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
            <span style={{
              fontSize: 15,
              fontWeight: 700,
              color: doneCount > 0 ? '#F59E0B' : 'rgba(255,255,255,0.25)',
              lineHeight: 1,
            }}>
              {doneCount}
            </span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', lineHeight: 1 }}>/</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.28)', lineHeight: 1 }}>
              {totalCount}
            </span>
          </div>
        </header>

        {/* ── Streak hero ── */}
        <div style={{
          position: 'relative',
          textAlign: 'center',
          marginBottom: 36,
          padding: '8px 0',
        }}>
          {/* Luffy — pouze za hero číslem */}
          <StrawHatFigure />

          <div style={{
            position: 'relative',
            zIndex: 1,
            fontSize: 64,
            fontWeight: 900,
            color: '#F59E0B',
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}>
            {MAX_STREAK}
          </div>
          <div style={{
            position: 'relative',
            zIndex: 1,
            fontSize: 12,
            color: 'rgba(255,255,255,0.28)',
            marginTop: 6,
            letterSpacing: '0.04em',
          }}>
            dní v řadě · Anki
          </div>

          {/* Luffy quote — zobrazí se když jsou splněny všechny habits */}
          {allDone && (
            <div style={{ marginTop: 20, padding: '0 24px' }}>
              <div style={{
                width: 24,
                height: 1,
                background: 'rgba(245,158,11,0.3)',
                margin: '0 auto 14px',
              }} />
              <p style={{
                fontSize: 13,
                fontStyle: 'italic',
                color: 'rgba(245,158,11,0.82)',
                lineHeight: 1.6,
                margin: '0 0 6px',
              }}>
                &ldquo;If you give up, you&rsquo;re going to regret it forever.&rdquo;
              </p>
              <p style={{
                fontSize: 10,
                color: 'rgba(255,255,255,0.2)',
                letterSpacing: '0.06em',
                margin: 0,
              }}>
                — Monkey D. Luffy
              </p>
            </div>
          )}
        </div>

        {/* ── Aktivní ── */}
        <section style={{ marginBottom: 20 }}>
          <SectionLabel>Aktivní</SectionLabel>
          <div style={{
            background: '#0e0e0e',
            borderRadius: 14,
            padding: '0 16px',
          }}>
            {ACTIVE.map(h => (
              <HabitRow key={h.id} habit={h} done={done.has(h.id)} onToggle={() => toggle(h.id)} />
            ))}
          </div>
        </section>

        {/* ── Testovací ── */}
        <section style={{ marginBottom: 20 }}>
          <SectionLabel>Testovací</SectionLabel>
          <div style={{
            background: '#0e0e0e',
            borderRadius: 14,
            padding: '0 16px',
          }}>
            {TRIAL_SOLO.map(h => (
              <HabitRow key={h.id} habit={h} done={done.has(h.id)} onToggle={() => toggle(h.id)} />
            ))}
          </div>
        </section>

        {/* ── Balíčky ── */}
        <section style={{ marginBottom: 20 }}>
          <SectionLabel>Balíčky</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PackSection
              title="Imunita"
              subtitle="Trial · do 30.6."
              habits={IMUNITA}
              done={done}
              onToggle={toggle}
            />
            <PackSection
              title="Fyzička"
              subtitle="Trial · od ~5.6."
              habits={FYZICKA}
              done={done}
              onToggle={toggle}
            />
          </div>
        </section>

        {/* ── Zautomatizováno ── */}
        <section>
          <SectionLabel>Zautomatizováno</SectionLabel>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {GRADUATED.map(h => (
              <div key={h.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '7px 12px',
                borderRadius: 10,
                background: '#0e0e0e',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'rgba(245,158,11,0.45)',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.32)' }}>
                  {h.name}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(245,158,11,0.35)', fontWeight: 600 }}>
                  {h.streak}×
                </span>
              </div>
            ))}
          </div>
        </section>

        <div style={{
          textAlign: 'center',
          padding: '24px 24px 48px',
          opacity: 0.5
        }}>
          <p style={{
            fontSize: 13,
            fontStyle: 'italic',
            color: '#F59E0B',
            lineHeight: 1.6,
            margin: 0
          }}>
            &ldquo;If you give up, you&rsquo;re going to regret it forever.&rdquo;
          </p>
          <p style={{
            fontSize: 11,
            color: '#666',
            marginTop: 6
          }}>
            — Monkey D. Luffy
          </p>
        </div>

      </div>
      </div>
    </>
  )
}
