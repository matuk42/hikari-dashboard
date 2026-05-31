interface LayerData {
  n: number
  title: string
  timeframe: string
  quote?: string
  progress: number
  countdown?: number
}

const LAYERS: LayerData[] = [
  {
    n: 1,
    title: 'Životní sen',
    timeframe: 'Věk 28+',
    quote: 'Žiju v rytmu mezi módy světa',
    progress: 8,
  },
  {
    n: 2,
    title: '5 let',
    timeframe: 'Věk 21 · 2031',
    progress: 5,
  },
  {
    n: 3,
    title: 'Rok',
    timeframe: '1.9.2027',
    progress: 15,
    countdown: 458,
  },
  {
    n: 4,
    title: 'Měsíc',
    timeframe: 'Červen 2026',
    progress: 0,
  },
  {
    n: 5,
    title: 'Týden',
    timeframe: 'W22',
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
                <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>
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
