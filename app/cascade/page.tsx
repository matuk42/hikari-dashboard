'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { OfflineBadge } from '@/app/components/OfflineBadge'
import { supabase } from '@/lib/supabase'

// ─── Vault data (baked from 2nd_brain/wiki/cile/cascade/sen.md + prijem.md) ──

interface Chip {
  label: string
  detail: string
  linkedHabits?: string[]
  hikariNote?: string
}
type DimKind = 'main' | 'side' | 'bonus'
interface Dimension { name: string; progress: number; completed?: boolean; detail?: string; kind?: DimKind | null }

interface Layer {
  n: number
  title: string
  timeframe: string
  deadline?: Date
  noProgressBar?: boolean
  progress?: number
  chips?: Chip[]
  dimensions?: Dimension[]
  /** When true the milestones are the live vault list — render names only (no per-milestone %). */
  dimsFromVault?: boolean
}

const LAYERS: Layer[] = [
  {
    n: 1,
    title: 'Životní sen',
    timeframe: 'Věk 28+',
    noProgressBar: true,
    chips: [
      {
        label: '日本語 · N2',
        detail: 'Porozumění 90%+ anime, podcastů a videí. Japonština jako druhý domov.',
        linkedHabits: ['Anki procvičování', 'Anki tvorba', 'Japonská imerze'],
        hikariNote: 'Anki streak je tvůj záchytný bod — každý den karta = každý den krok k N2. Nether miss it.',
      },
      {
        label: '🌏 Location-free',
        detail: '2 paralelní digitální produkty · cíl 50 000 Kč/měs · 2–3h ráno na laptopu.',
        linkedHabits: [],
        hikariNote: 'Hikari Dashboard je tvůj první produkt. Každý commit = 1 krok k location-free životu.',
      },
      {
        label: '⛰️ Výpravy',
        detail: 'Alpe Adria kolo · Japonsko na kole · Eurasie · Nepál · Camino z Česka.',
        linkedHabits: ['Běh', 'Kolo 100km+', 'Boulder'],
        hikariNote: 'Výpravy nevznikají náhodou — fyzička je základ. Každý trénink teď = výprava v budoucnu.',
      },
      {
        label: '🎬 YouTube',
        detail: 'Sdílet cestu autenticky — velké mini-filmy z výprav. Vliv jako vedlejší produkt.',
        linkedHabits: ['Hlasový deník'],
        hikariNote: 'Hlasový deník trénuje tvůj hlas a příběhové myšlení. Dokumentuj teď, sestříhej pak.',
      },
      {
        label: '💪 Fyzička · B',
        detail: '30 km/den hory · 100 km/den kolo · 10 km běh bez bolesti · shyby se závažím.',
        linkedHabits: ['Posilování calisthenics', 'Běh', 'Studená sprcha 30s', 'Kolo 100km+'],
        hikariNote: 'Fyzička trial balíček běží do 30. 6. — každý trénink se počítá. Buduj zvyk, ne výkon.',
      },
      {
        label: '🌿 Příroda · rytmus',
        detail: 'Rytmus mezi módy: hluboká příroda · město · pomoc lidem · výpravy · klidové fáze.',
        linkedHabits: ['30 min v lese', 'Spánek 22:00–06:15'],
        hikariNote: '30 min v lese = lepší fokus zbytek dne. Příroda nabíjí, ne odebírá.',
      },
    ],
  },
  {
    n: 2,
    title: '5 let',
    timeframe: 'Věk 21 · 2031',
    deadline: new Date('2031-01-01'),
    progress: 5,
    dimensions: [
      { name: 'Fyzička · B Solidní outdoor', progress: 8 },
      { name: 'Imunita · max 2× nemocný/rok', progress: 5 },
      { name: 'Japonština · N2', progress: 18 },
      { name: 'YouTube · 3 velké výpravy natočené', progress: 0 },
      { name: 'DofE · Zlato dokončené', progress: 15 },
      { name: 'Příjem · B1+B2 stabilní · 30–50k Kč/měs', progress: 2 },
    ],
  },
  {
    n: 3,
    title: 'Rok',
    timeframe: '1. 9. 2027',
    deadline: new Date('2027-09-01'),
    progress: 15,
    dimensions: [
      { name: 'Fyzička · shyby + kolo 100km + hory 20km', progress: 10 },
      { name: 'Imunita · léto 0× nemocný', progress: 5 },
      { name: 'Japonština · N3–N4', progress: 23 },
      { name: 'YouTube · 1 velké video z výpravy', progress: 0 },
      { name: 'Výprava · Alpe Adria kolo k moři', progress: 5 },
      { name: 'Erasmus · CV + Cambridge + doporučení', progress: 20 },
      { name: 'DofE · Bronz splněn + stříbro start', progress: 25 },
      { name: 'Příjem · B1 online · první 500 Kč/měs', progress: 12 },
    ],
  },
  {
    n: 4,
    title: 'Měsíc',
    timeframe: 'Červen 2026',
    deadline: new Date('2026-06-30'),
    progress: 5,
    dimensions: [
      { name: 'Hikari Dashboard MVP · moduly 1–3', progress: 15 },
      { name: 'Autoškola A1 · zkouška 30. 6.', progress: 40 },
      { name: 'Anki · 25+ karet denně · streak drží', progress: 60 },
      { name: 'Fyzička · Imunita balíček trial', progress: 5 },
    ],
  },
  {
    n: 5,
    title: 'Týden',
    timeframe: 'W23 · 2–8. 6.',
    deadline: new Date('2026-06-08'),
    progress: 0,
    dimensions: [
      { name: 'Hikari: Home + Cascade + Kibou hotové', progress: 0 },
      { name: 'Autoškola testy · 2× denně', progress: 0 },
      { name: 'Anki streak · 25+ karet', progress: 0 },
    ],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysUntil(d: Date): number {
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86_400_000))
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRect({ width = '100%', height = 16, radius = 8, style: extra }: {
  width?: string | number; height?: number; radius?: number; style?: React.CSSProperties
}) {
  return (
    <div className="skeleton-pulse" style={{ width, height, borderRadius: radius, background: 'rgba(255,255,255,0.08)', flexShrink: 0, ...extra }} />
  )
}

function CascadeSkeleton() {
  return (
    <div>
      {/* Hero */}
      <div style={{ marginBottom: 28 }}>
        <SkeletonRect width={110} height={10} radius={4} style={{ marginBottom: 10 }} />
        <SkeletonRect width="72%" height={13} radius={6} style={{ marginBottom: 6 }} />
        <SkeletonRect width="52%" height={13} radius={6} />
      </div>

      {/* Timeline — 5 layers */}
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ display: 'flex', gap: 0, marginBottom: i < 5 ? 12 : 0 }}>
          <div style={{ width: 24, flexShrink: 0, paddingTop: 18, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div className="skeleton-pulse" style={{ width: 10, height: 10, borderRadius: '50%', background: 'rgba(245,158,11,0.25)' }} />
            {i < 5 && <div style={{ flex: 1, width: 2, minHeight: 20, background: 'rgba(245,158,11,0.08)', marginTop: 5 }} />}
          </div>
          <div style={{ flex: 1, paddingLeft: 14 }}>
            <div style={{ background: '#0e0e0e', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <SkeletonRect width={28} height={20} radius={6} />
                <div style={{ flex: 1 }}>
                  <SkeletonRect width="42%" height={14} radius={6} style={{ marginBottom: 6 }} />
                  <SkeletonRect width="28%" height={10} radius={4} />
                </div>
                {i > 1 && <SkeletonRect width={34} height={14} radius={6} />}
              </div>
              {i > 1 && <div style={{ marginTop: 12 }}><SkeletonRect height={4} radius={2} /></div>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Components ───────────────────────────────────────────────────────────────

function ProgressBar({ value, height = 5 }: { value: number; height?: number }) {
  return (
    <div style={{ height, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{
        height: '100%',
        width: `${Math.max(value > 0 ? 2 : 0, value)}%`,
        background: 'linear-gradient(to right, #d97706, #F59E0B)',
        borderRadius: 3,
        transition: 'width 0.3s ease',
      }} />
    </div>
  )
}

function ChipDetail({ chip, onClose }: { chip: Chip; onClose: () => void }) {
  const hasLinked = chip.linkedHabits && chip.linkedHabits.length > 0
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        padding: '0 0 32px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#111',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 18,
          padding: '20px 20px 24px',
          maxWidth: 440,
          width: 'calc(100% - 40px)',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, color: '#F59E0B', marginBottom: 10 }}>
          {chip.label}
        </div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, margin: `0 0 ${hasLinked || chip.hikariNote ? 14 : 0}px` }}>
          {chip.detail}
        </p>

        {hasLinked && (
          <div style={{ marginBottom: chip.hikariNote ? 14 : 0 }}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Napojené habits
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {chip.linkedHabits!.map(h => (
                <span key={h} style={{
                  fontSize: 11, padding: '3px 9px', borderRadius: 20,
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                  color: 'rgba(245,158,11,0.7)',
                }}>
                  {h}
                </span>
              ))}
            </div>
          </div>
        )}

        {chip.hikariNote && (
          <div style={{
            background: 'rgba(245,158,11,0.05)',
            border: '1px solid rgba(245,158,11,0.15)',
            borderRadius: 10, padding: '10px 12px',
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 10, color: 'rgba(245,158,11,0.4)', marginBottom: 4, letterSpacing: '0.08em' }}>
              HIKARI →
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, margin: 0 }}>
              {chip.hikariNote}
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.3)',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: '6px 14px',
            cursor: 'pointer',
          }}
        >
          Zavřít
        </button>
      </div>
    </div>
  )
}

function LayerCard({ layer }: { layer: Layer }) {
  const [open, setOpen] = useState(layer.n === 1)
  const [activeChip, setActiveChip] = useState<Chip | null>(null)
  const isLife = layer.n === 1

  return (
    <>
      {activeChip && <ChipDetail chip={activeChip} onClose={() => setActiveChip(null)} />}

      <div style={{
        background: '#0e0e0e',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14,
        overflow: 'hidden',
      }}>
        {/* Header row — always visible */}
        <div
          onClick={() => !isLife && setOpen(o => !o)}
          role={isLife ? undefined : 'button'}
          tabIndex={isLife ? undefined : 0}
          onKeyDown={e => !isLife && (e.key === 'Enter' || e.key === ' ') && setOpen(o => !o)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: isLife ? '14px 16px 10px' : '12px 16px',
            cursor: isLife ? 'default' : 'pointer',
          }}
        >
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#F59E0B',
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.25)',
            padding: '2px 7px',
            borderRadius: 7,
            letterSpacing: '0.08em',
            flexShrink: 0,
          }}>
            L{layer.n}
          </span>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>
                {layer.title}
              </span>
              <span style={{ fontSize: 10, color: '#555' }}>{layer.timeframe}</span>
            </div>
            {/* Countdown */}
            {layer.deadline && (
              <div suppressHydrationWarning style={{ fontSize: 10, color: 'rgba(245,158,11,0.4)', marginTop: 2 }}>
                {daysUntil(layer.deadline)} dní
              </div>
            )}
          </div>

          {/* Progress % + chevron */}
          {!isLife && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(245,158,11,0.7)' }}>
                {layer.progress}%
              </span>
              <svg viewBox="0 0 24 24" fill="none" style={{
                width: 15,
                height: 15,
                color: 'rgba(255,255,255,0.2)',
                transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease',
              }}>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
        </div>

        {/* Collapsed progress bar (layers 2-5 when closed) */}
        {!isLife && !open && layer.progress !== undefined && (
          <div style={{ padding: '0 16px 12px' }}>
            <ProgressBar value={layer.progress} />
          </div>
        )}

        {/* Expanded content */}
        {open && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '12px 16px 14px' }}>

            {/* Layer 1: chips */}
            {layer.chips && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {layer.chips.map(chip => (
                  <button
                    key={chip.label}
                    onClick={() => setActiveChip(chip)}
                    style={{
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.72)',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 20,
                      padding: '5px 12px',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            {/* Layers 3-5: live vault milestones — clean list, names only (no per-milestone %) */}
            {layer.dimensions && layer.dimsFromVault && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {layer.dimensions.map(d => (
                  <div key={d.name} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ color: 'rgba(245,158,11,0.45)', fontSize: 11, lineHeight: 1.5, flexShrink: 0 }}>›</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.78)', lineHeight: 1.4 }}>{d.name}</div>
                      {d.detail && (
                        <div style={{
                          fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 1,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{d.detail}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Layer 2: curated dimensions with estimate % */}
            {layer.dimensions && !layer.dimsFromVault && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {layer.dimensions.map(d => (
                  <div key={d.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{d.name}</span>
                      <span style={{ fontSize: 11, color: 'rgba(245,158,11,0.55)', fontWeight: 600 }}>{d.progress}%</span>
                    </div>
                    <ProgressBar value={d.progress} height={3} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
//
// Cascade % is meant to be AI-computed (Hikari morning cron, PRD W26). Until
// then the layer/dimension percentages below are hand-set ESTIMATES — shown
// with an "odhad" label so they're never mistaken for live data. The vault sync
// populates cascade_layers/dimensions in the DB silently so the data is ready
// when the AI calc lands; this page intentionally renders the curated copy,
// which carries richer chips (detail + Hikari note) than the DB can hold.

// Which layers carry cron-computed (real) %: L4 month + L5 week, from habit logs.
// L2/L3 stay curated estimates until milestone-based calc lands.
const REAL_PCT_LAYERS = new Set([4, 5])

// Layers whose milestone LIST is the live vault (synced + rolled over each period).
// Rendered as a clean name list (no per-milestone % — that's a future Gemini calc).
// L1 (chips) + L2 (5 let) stay curated; L2 is set once via chat, not auto-parsed.
const VAULT_DIM_LAYERS = new Set([3, 4, 5])

type DbLayer = { layer: number; progress_pct: number | null; description: string | null }
type DbDim = { name: string; detail: string | null; kind: DimKind | null }

export default function CascadePage() {
  const [mounted, setMounted] = useState(false)
  const [dbLayers, setDbLayers] = useState<Record<number, DbLayer>>({})
  const [dbDims, setDbDims] = useState<Record<number, DbDim[]>>({})
  const [hasReal, setHasReal] = useState(false)

  useEffect(() => {
    setMounted(true)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles').select('id').eq('auth_user_id', user.id).single()
      if (!profile) return
      const { data: rows } = await supabase.from('cascade_layers')
        .select('id, layer, progress_pct, description')
        .eq('profile_id', profile.id).eq('tree', 'sen')
      if (!rows?.length) return
      const map: Record<number, DbLayer> = {}
      const idToLayer: Record<string, number> = {}
      for (const r of rows) {
        map[r.layer as number] = r as DbLayer
        idToLayer[r.id as string] = r.layer as number
      }
      setDbLayers(map)
      setHasReal(rows.some(r => REAL_PCT_LAYERS.has(r.layer as number) && r.progress_pct != null))

      // Live milestones per layer (sorted) for the vault-sourced layers.
      type DimRow = { layer_id: string; name: string; detail: string | null; kind: DimKind | null; sort_order: number | null }
      const ids = rows.map(r => r.id as string)
      let dimRows: DimRow[] = []
      const sel = await supabase.from('cascade_dimensions')
        .select('layer_id, name, detail, kind, sort_order').in('layer_id', ids)
      if (sel.error) {
        // Migration 004 not applied → no detail/kind/sort_order columns
        const basic = await supabase.from('cascade_dimensions').select('layer_id, name').in('layer_id', ids)
        dimRows = (basic.data ?? []).map(d => ({ layer_id: d.layer_id as string, name: d.name as string, detail: null, kind: null, sort_order: null }))
      } else {
        dimRows = (sel.data ?? []) as DimRow[]
      }
      const dimMap: Record<number, Array<DbDim & { _sort: number }>> = {}
      for (const d of dimRows) {
        const ln = idToLayer[d.layer_id]
        if (ln == null) continue
        ;(dimMap[ln] ??= []).push({ name: d.name, detail: d.detail, kind: d.kind, _sort: d.sort_order ?? 0 })
      }
      for (const ln of Object.keys(dimMap)) {
        dimMap[Number(ln)].sort((a, b) => a._sort - b._sort)
      }
      setDbDims(dimMap)
    }).catch(() => {})
  }, [])

  // Merge DB overrides onto the curated layers: real % + fresh week/month label
  // where the cron has written them; live vault milestones for L3/L4/L5.
  const displayLayers: Layer[] = LAYERS.map(l => {
    const db = dbLayers[l.n]
    if (!db) return l
    const liveDims = dbDims[l.n]
    const useVaultDims = VAULT_DIM_LAYERS.has(l.n) && liveDims && liveDims.length > 0
    return {
      ...l,
      progress:  db.progress_pct != null && REAL_PCT_LAYERS.has(l.n) ? db.progress_pct : l.progress,
      timeframe: db.description || l.timeframe,
      ...(useVaultDims
        ? {
            dimsFromVault: true,
            dimensions: liveDims!.map(d => ({ name: d.name, progress: 0, detail: d.detail ?? undefined })),
          }
        : {}),
    }
  })

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
          paddingBottom: 28,
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
            <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>
              Cascade
            </span>
          </div>
        </header>

        {/* Skeleton + real content */}
        <div style={{ position: 'relative' }}>

          {!mounted && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1, pointerEvents: 'none' }}>
              <CascadeSkeleton />
            </div>
          )}

          <div style={{ opacity: mounted ? 1 : 0, transition: 'opacity 0.35s ease' }}>

            {/* ── Hero (Luffy behind Layer 1) ── */}
            <div style={{ position: 'relative', marginBottom: 28 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/luffy.jpg"
                alt=""
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: -16,
                  transform: 'translateY(-50%)',
                  height: 200,
                  width: 'auto',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  filter: 'invert(1) grayscale(1)',
                  mixBlendMode: 'screen',
                  opacity: 0.07,
                  zIndex: 0,
                }}
              />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <p style={{
                  fontSize: 11,
                  color: 'rgba(245,158,11,0.5)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  marginBottom: 6,
                }}>
                  Životní trajektorie
                </p>
                <p style={{
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.4)',
                  fontStyle: 'italic',
                  lineHeight: 1.6,
                  margin: 0,
                  maxWidth: 280,
                }}>
                  &ldquo;Žiju v rytmu mezi módy světa — ráno krátký čas u laptopu, zbytek dne žiju dobrodružství.&rdquo;
                </p>
              </div>
            </div>

            {/* ── Estimate notice ── */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              marginBottom: 18, padding: '8px 12px',
              background: 'rgba(245,158,11,0.05)',
              border: '1px solid rgba(245,158,11,0.13)', borderRadius: 10,
            }}>
              <span style={{ fontSize: 13 }}>📊</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
                {hasReal ? (
                  <>Týden a měsíc <span style={{ color: 'rgba(245,158,11,0.7)' }}>počítá Hikari</span> z habitů. Rok a 5 let zatím odhad.</>
                ) : (
                  <>% jsou <span style={{ color: 'rgba(245,158,11,0.7)' }}>odhad</span> — Hikari spočítá přesně s AI cronem.</>
                )}
              </span>
            </div>

            {/* ── Timeline ── */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {displayLayers.map((layer, i) => (
                <div key={layer.n} style={{ display: 'flex', gap: 0 }}>

                  {/* Dot + line */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    width: 24,
                    flexShrink: 0,
                    paddingTop: 18,
                  }}>
                    <div style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: '#F59E0B',
                      boxShadow: '0 0 8px rgba(245,158,11,0.5)',
                      flexShrink: 0,
                    }} />
                    {i < displayLayers.length - 1 && (
                      <div style={{
                        flex: 1,
                        width: 2,
                        minHeight: 20,
                        background: 'linear-gradient(to bottom, rgba(245,158,11,0.35), rgba(245,158,11,0.06))',
                        marginTop: 5,
                      }} />
                    )}
                  </div>

                  {/* Layer card — minWidth:0 lets the flex child shrink so long
                      milestone details truncate (ellipsis) instead of widening the card. */}
                  <div style={{ flex: 1, minWidth: 0, paddingLeft: 14, paddingBottom: i < displayLayers.length - 1 ? 12 : 0 }}>
                    <LayerCard layer={layer} />
                  </div>

                </div>
              ))}
            </div>

            {/* ── Footer quote ── */}
            <div style={{ textAlign: 'center', padding: '32px 24px 16px', opacity: 0.4 }}>
              <p style={{ fontSize: 12, fontStyle: 'italic', color: '#F59E0B', lineHeight: 1.6, margin: 0 }}>
                &ldquo;Dreams don&rsquo;t have expiration dates.&rdquo;
              </p>
              <p style={{ fontSize: 11, color: '#555', marginTop: 5 }}>— Monkey D. Luffy</p>
            </div>

          </div>{/* end real content */}
        </div>{/* end relative wrapper */}

      </div>
    </div>
  )
}
