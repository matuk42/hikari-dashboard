// ─── Static data z vaultu: sen.md · prijem.md · 2026-W22.md · 2026-06.md ─────

// TODO: Layer 2 progress — connect to real 5-year tracking (prijem.md milníky)
// TODO: Layer 3 progress — connect to real annual milestone completion
// TODO: Layer 4 progress — connect to Supabase (monthly goal tracking)
// TODO: Layer 5 progress — connect to Supabase (weekly task completion)

interface LayerData {
  n: number
  title: string
  timeframe: string
  quote?: string
  chips: string[]
  chipsDone?: boolean[]     // true = splněno (zlaté + přeškrtnuté), false = čeká (šedé)
  progress: number | null   // 0–100, null = žádný progress bar (L1)
  done?: number
  total?: number
  countdown?: number        // dní zbývá
}

// Vrstvy cascade — data z vaultu k 2026-05-31
const LAYERS: LayerData[] = [
  {
    n: 1,
    title: 'Životní sen',
    timeframe: 'Věk 28+',
    quote: 'Žiju v rytmu mezi módy světa',
    // sen.md: 4 pilíře, 5 dimenzí
    chips: ['výpravy', 'Japonsko', 'fyzička', 'YouTube', 'svoboda'],
    progress: null,
  },
  {
    n: 2,
    title: '5 let',
    timeframe: 'Věk 21 · 2031',
    // prijem.md: B1 → B2, 30–50k Kč/měs, 4 timeline milníky
    // TODO: connect to real tracking — tady manuální odhad (B1 ještě nevybrán)
    chips: ['fyzička', 'japonština', 'YouTube', 'DofE'],
    progress: 1,
    done: 0,
    total: 4,
  },
  {
    n: 3,
    title: 'Rok',
    timeframe: '1.9.2027',
    // sen.md: 10 dimenzí s milníky — japonština a cascade rozjety, zbytek 0
    chips: ['výprava kolo k moři', 'N3–N4', 'YouTube video', 'Erasmus CV', 'DofE bronz'],
    progress: 10,
    done: 1,
    total: 10,
    countdown: 458,
  },
  {
    n: 4,
    title: 'Měsíc',
    timeframe: 'Červen 2026',
    // 2026-06.md: 6 SEN milníků pro červen — červen právě začíná
    chips: ['autoškola zkouška', 'Hikari 1–3', 'kytara Anděl', 'DofE start', 'japonština', 'fyzička'],
    progress: 0,
    done: 0,
    total: 6,
  },
  {
    n: 5,
    title: 'Týden',
    timeframe: 'W22',
    // 2026-W22.md — Pokrok projektů:
    //   ✅ Cascade vrstva 1+2 (milestone)
    //   ✅ Autoškola testy (4/4)
    //   ❌ ANI-WATCH sort icon (4× perpetual-tomorrow eskalace)
    chips: ['Cascade vrstva 1+2', 'Autoškola 4/4', 'ANI-WATCH sort'],
    chipsDone: [true, true, false],
    progress: 67,
    done: 2,
    total: 3,
  },
]

// ─── Chip style (sdílený) ─────────────────────────────────────────────────────

const chip = (): React.CSSProperties => ({
  fontSize: 11,
  color: '#F59E0B',
  background: 'rgba(245,158,11,0.07)',
  border: '1px solid rgba(245,158,11,0.2)',
  padding: '3px 9px',
  borderRadius: 12,
  whiteSpace: 'nowrap' as const,
})

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CascadePage() {
  return (
    <main style={{
      minHeight: '100vh',
      background: '#080808',
      color: '#fff',
      fontFamily: 'var(--font-geist-sans, sans-serif)',
    }}>

      {/* ── Hero s Luffym ── */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
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
            opacity: 0.08,
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, padding: '44px 24px 32px', textAlign: 'center' }}>
          <div style={{
            fontSize: 12,
            color: '#F59E0B',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}>
            光 Hikari
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            Cascade
          </h1>
          <div style={{ fontSize: 12, color: '#555', marginTop: 8 }}>
            Životní trajektorie · 31. května 2026
          </div>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 20px 80px' }}>
        {LAYERS.map((layer, i) => (
          <div key={layer.n} style={{ display: 'flex' }}>

            {/* Dot + čára */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: 26,
              flexShrink: 0,
              paddingTop: 4,
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
                  minHeight: 56,
                  background: 'linear-gradient(to bottom, rgba(245,158,11,0.4), rgba(245,158,11,0.06))',
                  marginTop: 5,
                }} />
              )}
            </div>

            {/* Content */}
            <div style={{
              flex: 1,
              paddingLeft: 18,
              paddingBottom: i < LAYERS.length - 1 ? 36 : 0,
            }}>

              {/* Hlavička */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#F59E0B',
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  padding: '2px 7px',
                  borderRadius: 8,
                  letterSpacing: '0.08em',
                  flexShrink: 0,
                }}>
                  L{layer.n}
                </span>
                <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>
                  {layer.title}
                </span>
                <span style={{ fontSize: 11, color: '#555', marginLeft: 'auto', flexShrink: 0 }}>
                  {layer.timeframe}
                </span>
              </div>

              {/* Quote (jen L1 — směr, ne cíl) */}
              {layer.quote && (
                <div style={{
                  fontSize: 13,
                  color: '#aaa',
                  fontStyle: 'italic',
                  marginBottom: 12,
                  lineHeight: 1.55,
                }}>
                  &ldquo;{layer.quote}&rdquo;
                </div>
              )}

              {/* Progress bar */}
              {layer.progress !== null && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{
                    height: 5,
                    background: '#141414',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.max(layer.progress, layer.progress > 0 ? 2 : 0)}%`,
                      background: 'linear-gradient(to right, #d97706, #F59E0B)',
                      borderRadius: 3,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: 5,
                    alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 10, color: '#444' }}>
                      {layer.done !== undefined && layer.total !== undefined
                        ? `${layer.done} / ${layer.total} splněno`
                        : `${layer.progress}%`}
                    </span>
                    {layer.countdown !== undefined && (
                      <span style={{ fontSize: 10, color: '#555' }}>
                        {layer.countdown} dní zbývá
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {layer.chips.map(c => (
                  <span key={c} style={chip()}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Luffy quote */}
      <div style={{ textAlign: 'center', padding: '0 24px 56px', opacity: 0.45 }}>
        <p style={{
          fontSize: 12,
          fontStyle: 'italic',
          color: '#F59E0B',
          lineHeight: 1.6,
          margin: 0,
        }}>
          &ldquo;Dreams don&rsquo;t have expiration dates.&rdquo;
        </p>
        <p style={{ fontSize: 11, color: '#555', marginTop: 5 }}>— Monkey D. Luffy</p>
      </div>
    </main>
  )
}
