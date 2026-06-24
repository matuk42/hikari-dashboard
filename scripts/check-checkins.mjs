// Diagnostika intraday HOPE check-inů (energetické oblouky dne).
// Vypíše: poslední check-iny, kolik poznámek čeká na otagování, jak vypadá
// dnešní oblouk, učící se energetickou osu (kolik bloků je z reálných dat vs.
// syntetické), a hotové korelace aktivita→HOPE. NIC nezapisuje.
// Spuštění: node scripts/check-checkins.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const today = new Date().toISOString().slice(0, 10)

// ─── 1. Check-iny ───────────────────────────────────────────────────────────
const { data: ci, error } = await db.from('hope_checkins')
  .select('date, ts, mood, energy, hope, note, activity_tag')
  .order('ts', { ascending: false })
  .limit(20)

if (error) {
  console.log('=== hope_checkins ===')
  console.log('CHYBA (tabulka možná neexistuje — spustil jsi migraci 010?):', error.message)
  process.exit(1)
}

console.log('=== hope_checkins (posledních 20) ===')
if (!ci?.length) {
  console.log('(žádné check-iny — zatím nikdo nezaznamenal)')
} else {
  for (const r of ci) {
    const t = new Date(r.ts).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    const tag = r.activity_tag == null ? '(neotagováno)' : r.activity_tag === '—' ? '(bez aktivity)' : `#${r.activity_tag}`
    console.log(`  ${t}  🌟${r.hope} ⚡${r.energy} 😌${r.mood}  ${tag}${r.note ? `  „${r.note}"` : ''}`)
  }
}

const untagged = (ci ?? []).filter(r => r.activity_tag == null && (r.note ?? '').trim().length > 1)
console.log(`\nPoznámek čekajících na otagování (z posledních 20): ${untagged.length}`)

// ─── 2. Dnešní oblouk ─────────────────────────────────────────────────────────
const todayCi = (ci ?? []).filter(r => r.date === today).sort((a, b) => a.ts.localeCompare(b.ts))
console.log(`\n=== Dnešní oblouk (${today}) — ${todayCi.length} check-inů ===`)
for (const r of todayCi) {
  const t = new Date(r.ts).toLocaleTimeString('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' })
  console.log(`  ${t}  energie ${r.energy}`)
}

// ─── 3. Energetická osa: reálná vs syntetická ─────────────────────────────────
const { data: blocks } = await db.from('energy_blocks')
  .select('day_of_week, hour_start, level, sample_size, confidence')
  .order('day_of_week').order('hour_start')
console.log(`\n=== energy_blocks (${blocks?.length ?? 0} řádků) ===`)
if (blocks?.length) {
  // sample_size > odhad → reálné; konkrétně nemáme flag, tak ukážeme confidence
  const real = blocks.filter(b => b.confidence >= 0.5 && b.sample_size >= 3).length
  console.log(`  bloků s vyšší jistotou (≥3 vzorky): ${real} / ${blocks.length}`)
}

// ─── 4. Korelace ──────────────────────────────────────────────────────────────
const { data: corr } = await db.from('hope_correlations')
  .select('activity_tag, avg_energy_delta, avg_mood_delta, avg_hope_delta, sample_size, last_seen_date')
  .order('avg_energy_delta', { ascending: false })
console.log(`\n=== hope_correlations (${corr?.length ?? 0}) — co hýbe energií ===`)
if (!corr?.length) {
  console.log('(zatím prázdné — potřebuje check-iny s poznámkami + ranní cron na otagování + výpočet)')
} else {
  for (const c of corr) {
    const e = c.avg_energy_delta >= 0 ? `+${c.avg_energy_delta}` : c.avg_energy_delta
    console.log(`  ${c.activity_tag.padEnd(14)} energie ${e} ⚡ · nálada ${c.avg_mood_delta} · naděje ${c.avg_hope_delta}  (n=${c.sample_size}, naposled ${c.last_seen_date})`)
  }
}
