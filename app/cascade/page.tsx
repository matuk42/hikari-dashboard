'use client'

type IconKey = 'star' | 'clock' | 'flag' | 'calendar' | 'zap'

interface LayerData {
  n: number
  title: string
  timeframe: string
  quote?: string
  icon: IconKey
  progress: number
  countdown?: number
}

function Icon({ name }: { name: IconKey }) {
  const props = {
    width: 13,
    height: 13,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style: { display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 },
  }
  if (name === 'star')     return <svg {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
  if (name === 'clock')    return <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  if (name === 'flag')     return <svg {...props}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
  if (name === 'calendar') return <svg {...props}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
  return <svg {...props}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
}

const LAYERS: LayerData[] = [
  {
    n: 1,
    title: 'Životní sen',
    timeframe: 'Věk 28+',
    quote: 'Žiju v rytmu mezi módy světa',
    icon: 'star',
    progress: 8,
  },
  {
    n: 2,
    title: '5 let',
    timeframe: 'Věk 21 · 2031',
    icon: 'clock',
    progress: 5,
  },
  {
    n: 3,
    title: 'Rok',
    timeframe: '1.9.2027',
    icon: 'flag',
    progress: 15,
    countdown: 458,
  },
  {
    n: 4,
    title: 'Měsíc',
    timeframe: 'Červen 2026',
    icon: 'calendar',
    progress: 0,
  },
  {
    n: 5,
    title: 'Týden',
    timeframe: 'W22',
    icon: 'zap',
    progress: 67,
  },
]

// ─── Chip style (sdílený) ─────────────────────────────────────────────────────


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
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>
                  <span style={{ color: '#F59E0B', opacity: 0.7 }}><Icon name={layer.icon} /></span>
                  {layer.title}
                </span>
                <span style={{ fontSize: 11, color: '#555', marginLeft: 'auto', flexShrink: 0 }}>
                  {layer.timeframe}
                </span>
              </div>

              {/* Popis cíle */}
              <div style={{
                fontSize: 12,
                color: '#555',
                marginBottom: 12,
                lineHeight: 1.55,
              }}>
                {layer.description}
              </div>

              {/* Progress bar */}
              {(
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
                      {layer.progress}%
                    </span>
                    {layer.countdown !== undefined && (
                      <span style={{ fontSize: 10, color: '#555' }}>
                        {layer.countdown} dní zbývá
                      </span>
                    )}
                  </div>
                </div>
              )}

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
