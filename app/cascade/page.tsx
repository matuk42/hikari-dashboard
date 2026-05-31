const NOW = new Date('2026-05-31')

function pct(start: Date, end: Date): number {
  const total = end.getTime() - start.getTime()
  const elapsed = NOW.getTime() - start.getTime()
  return Math.max(0, Math.min(100, (elapsed / total) * 100))
}

function daysLeft(end: Date): number {
  return Math.max(0, Math.ceil((end.getTime() - NOW.getTime()) / 86400000))
}

// ─── Static data z vaultu (sen.md + prijem.md) ────────────────────────────────

const LAYERS = [
  {
    n: 1,
    title: 'Životní sen',
    timeframe: 'Věk 28+',
    quote: 'Žiju v rytmu mezi módy světa',
    chips: ['výpravy', 'Japonsko', 'fyzička', 'YouTube', 'svoboda'],
    progress: null as number | null,
    countdown: null as number | null,
  },
  {
    n: 2,
    title: '5 let',
    timeframe: 'Věk 21 · 2031',
    quote: null as string | null,
    chips: ['fyzička', 'japonština', 'YouTube', 'DofE'],
    progress: pct(new Date('2026-05-29'), new Date('2031-01-01')),
    countdown: null,
  },
  {
    n: 3,
    title: 'Rok',
    timeframe: '1.9.2027',
    quote: null,
    chips: ['výprava kolo k moři', 'N3–N4', 'YouTube video', 'Erasmus CV'],
    progress: pct(new Date('2026-05-29'), new Date('2027-09-01')),
    countdown: daysLeft(new Date('2027-09-01')),
  },
  {
    n: 4,
    title: 'Měsíc',
    timeframe: 'Červen 2026',
    quote: null,
    chips: ['autoškola zkouška', 'Hikari modul 2–3', 'japonština', 'kytara bronz'],
    progress: pct(new Date('2026-06-01'), new Date('2026-07-01')),
    countdown: null,
  },
  {
    n: 5,
    title: 'Týden',
    timeframe: 'W23',
    quote: null,
    chips: ['Autoškola 350 otázek', 'Hikari Dashboard', 'Kytara Anděl'],
    progress: pct(new Date('2026-05-25'), new Date('2026-06-01')),
    countdown: null,
  },
]

// ─── Styles (shared) ─────────────────────────────────────────────────────────

const chip: React.CSSProperties = {
  fontSize: 11,
  color: '#F59E0B',
  background: 'rgba(245,158,11,0.07)',
  border: '1px solid rgba(245,158,11,0.2)',
  padding: '3px 9px',
  borderRadius: 12,
  whiteSpace: 'nowrap' as const,
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CascadePage() {
  return (
    <main style={{ minHeight: '100vh', background: '#080808', color: '#fff', fontFamily: 'var(--font-geist-sans, sans-serif)' }}>

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
            opacity: 0.09,
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, padding: '44px 24px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#F59E0B', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 10 }}>
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
          <div key={layer.n} style={{ display: 'flex', gap: 0 }}>

            {/* Dot + čára */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 26, flexShrink: 0, paddingTop: 4 }}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#F59E0B',
                boxShadow: '0 0 8px rgba(245,158,11,0.45)',
                flexShrink: 0,
              }} />
              {i < LAYERS.length - 1 && (
                <div style={{
                  flex: 1,
                  width: 2,
                  minHeight: 52,
                  background: 'linear-gradient(to bottom, rgba(245,158,11,0.35), rgba(245,158,11,0.05))',
                  marginTop: 5,
                }} />
              )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, paddingLeft: 18, paddingBottom: i < LAYERS.length - 1 ? 36 : 0 }}>

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

              {/* Quote (jen L1) */}
              {layer.quote && (
                <div style={{ fontSize: 13, color: '#bbb', fontStyle: 'italic', marginBottom: 12, lineHeight: 1.55 }}>
                  &ldquo;{layer.quote}&rdquo;
                </div>
              )}

              {/* Progress bar */}
              {layer.progress !== null && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ height: 5, background: '#141414', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.max(layer.progress, 0.4)}%`,
                      background: 'linear-gradient(to right, #d97706, #F59E0B)',
                      borderRadius: 3,
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
                    <span style={{ fontSize: 10, color: '#444' }}>
                      {layer.progress < 1 ? layer.progress.toFixed(2) : layer.progress.toFixed(1)}%
                    </span>
                    {layer.countdown !== null && (
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
                  <span key={c} style={chip}>{c}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Luffy quote */}
      <div style={{ textAlign: 'center', padding: '0 24px 56px', opacity: 0.45 }}>
        <p style={{ fontSize: 12, fontStyle: 'italic', color: '#F59E0B', lineHeight: 1.6, margin: 0 }}>
          &ldquo;Dreams don&rsquo;t have expiration dates.&rdquo;
        </p>
        <p style={{ fontSize: 11, color: '#555', marginTop: 5 }}>— Monkey D. Luffy</p>
      </div>
    </main>
  )
}
