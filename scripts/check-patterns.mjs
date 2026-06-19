// Suchý běh detekce vzorů proti REÁLNÉ DB — NIC nezapisuje, žádné AI.
// Ukáže kandidáty (den-v-týdnu × HOPE a habit → HOPE) s ověřenými čísly,
// + které už jsou v hikari_memory (a tedy by se přeskočily).
// Spuštění: node scripts/check-patterns.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
// Node 24 strips TypeScript types nativně → lib/pattern-detect.ts jde importovat přímo.
import { detectAllPatterns } from '../lib/pattern-detect.ts'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const today = new Date()
const todayISO = today.toISOString().slice(0, 10)
const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 60)
const cutoffISO = cutoff.toISOString().slice(0, 10)
console.log(`Okno: ${cutoffISO} … ${todayISO} (60 dní)\n`)

const { data: profiles } = await db.from('profiles').select('id')
const pid = profiles?.[0]?.id
if (!pid) { console.error('Žádný profil.'); process.exit(1) }

const [{ data: hope }, { data: habits }] = await Promise.all([
  db.from('hope_logs').select('date, mood, energy, hope')
    .eq('profile_id', pid).gte('date', cutoffISO).lte('date', todayISO),
  db.from('habits').select('id, name').eq('profile_id', pid).neq('category', 'retired'),
])
const ids = (habits ?? []).map(h => h.id)
const { data: habitLogs } = ids.length
  ? await db.from('habit_logs').select('habit_id, date, status')
      .in('habit_id', ids).gte('date', cutoffISO).lte('date', todayISO).eq('status', 'done')
  : { data: [] }

console.log(`hope_logs: ${hope?.length ?? 0} · habits: ${habits?.length ?? 0} · done logy: ${habitLogs?.length ?? 0}\n`)

const candidates = detectAllPatterns(hope ?? [], habitLogs ?? [], habits ?? [])

// Co už je v paměti (jakýkoli status) → přeskočilo by se
const { data: existing } = await db.from('hikari_memory')
  .select('source_ref, status').eq('profile_id', pid).eq('source', 'auto')
const seen = new Map((existing ?? []).map(r => [r.source_ref, r.status]))

console.log(`=== ${candidates.length} KANDIDÁTŮ (seřazeno dle síly) ===\n`)
for (const c of candidates) {
  const dup = seen.has(c.sourceRef) ? `  [už v DB: ${seen.get(c.sourceRef)} → SKIP]` : '  [NOVÝ]'
  console.log(`• ${c.fallbackText}`)
  console.log(`    ref=${c.sourceRef} · metric=${c.metric} · Δ=${c.delta} · n=${c.sample} · conf=${c.confidence} · type=${c.memType}${dup}\n`)
}
if (!candidates.length) console.log('(žádné vzory nepřekročily práh — málo dat nebo slabé signály)')
