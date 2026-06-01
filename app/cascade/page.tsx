'use client'

import Link from 'next/link'
import { useState } from 'react'
import { OfflineBadge } from '@/app/components/OfflineBadge'

// ─── Vault data (baked from 2nd_brain/wiki/cile/cascade/sen.md + prijem.md) ──

interface Chip { label: string; detail: string }
interface Dimension { name: string; progress: number; completed?: boolean }

interface Layer {
  n: number
  title: string
  timeframe: string
  deadline?: Date
  noProgressBar?: boolean
  progress?: number
  chips?: Chip[]
  dimensions?: Dimension[]
}

const LAYERS: Layer[] = [
  {
    n: 1,
    title: 'Životní sen',
    timeframe: 'Věk 28+',
    noProgressBar: true,
    chips: [
      { label: '日本語 · N2', detail: 'Porozumění 90%+ anime, podcastů a videí. Japonština jako druhý domov.' },
      { label: '🌏 Location-free', detail: '2 paralelní digitální produkty · cíl 50 000 Kč/měs · 2–3h ráno na laptopu.' },
      { label: '⛰️ Výpravy', detail: 'Alpe Adria kolo · Japonsko na kole · Eurasie · Nepál · Camino z Česka.' },
      { label: '🎬 YouTube', detail: 'Sdílet cestu autenticky — velké mini-filmy z výprav. Vliv jako vedlejší produkt.' },
      { label: '💪 Fyzička · B', detail: '30 km/den hory · 100 km/den kolo · 10 km běh bez bolesti · shyby se závažím.' },
      { label: '🌿 Příroda · rytmus', detail: 'Rytmus mezi módy: hluboká příroda · město · pomoc lidem · výpravy · klidové fáze.' },
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
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, margin: 0 }}>
          {chip.detail}
        </p>
        <button
          onClick={onClose}
          style={{
            marginTop: 16,
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
              <div style={{ fontSize: 10, color: 'rgba(245,158,11,0.4)', marginTop: 2 }}>
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

            {/* Layers 2-5: dimensions */}
            {layer.dimensions && (
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

export default function CascadePage() {
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
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>
            Cascade
          </span>
        </header>

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

        {/* ── Timeline ── */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {LAYERS.map((layer, i) => (
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
                {i < LAYERS.length - 1 && (
                  <div style={{
                    flex: 1,
                    width: 2,
                    minHeight: 20,
                    background: 'linear-gradient(to bottom, rgba(245,158,11,0.35), rgba(245,158,11,0.06))',
                    marginTop: 5,
                  }} />
                )}
              </div>

              {/* Layer card */}
              <div style={{ flex: 1, paddingLeft: 14, paddingBottom: i < LAYERS.length - 1 ? 12 : 0 }}>
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

      </div>
    </div>
  )
}
