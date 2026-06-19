// Diagnostika stavu po session 8: denní úkoly + paměť (proposed/archived) + invokace.
// node scripts/check-state.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const today = new Date().toISOString().slice(0, 10)
const { data: profiles } = await db.from('profiles').select('id')
const pid = profiles?.[0]?.id

console.log('today:', today, '\n')

const { data: brief } = await db.from('ai_daily_brief')
  .select('date, hlavni, vedlejsi, bonus, done_keys, cascade_nudge, generated_at')
  .eq('profile_id', pid).order('date', { ascending: false }).limit(3)
console.log('=== ai_daily_brief (poslední 3) ===')
for (const b of brief ?? []) {
  console.log(`\n${b.date}  (gen: ${b.generated_at})`)
  console.log('  hlavni:  ', JSON.stringify(b.hlavni))
  console.log('  vedlejsi:', JSON.stringify(b.vedlejsi))
  console.log('  bonus:   ', JSON.stringify(b.bonus))
  console.log('  nudge:   ', (b.cascade_nudge ?? '').slice(0, 80))
}

console.log('\n\n=== hikari_memory (source=auto) ===')
const { data: mem } = await db.from('hikari_memory')
  .select('status, type, content, source_ref, confidence, created_at')
  .eq('profile_id', pid).eq('source', 'auto').order('created_at', { ascending: false })
if (!mem?.length) console.log('  (žádné auto řádky — detekce ještě neběžela přes "Přepočítej Hikari")')
for (const m of mem ?? []) console.log(`  [${m.status}] ${m.source_ref} · conf=${m.confidence} · ${(m.content ?? '').slice(0, 70)}`)

console.log('\n=== ai_invocations (posledních 6) ===')
const { data: inv } = await db.from('ai_invocations')
  .select('purpose, success, error, run_at').eq('profile_id', pid)
  .order('run_at', { ascending: false }).limit(6)
for (const i of inv ?? []) console.log(`  ${i.run_at?.slice(0,19)} · ${i.purpose} · ok=${i.success}${i.error ? ' · ERR: ' + i.error.slice(0,60) : ''}`)
