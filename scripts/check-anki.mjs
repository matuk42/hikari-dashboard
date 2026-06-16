// Diagnostika Anki streaku — dotaz na habits + streaks_cache + posledních ~15 habit_logs.
// Spuštění: node scripts/check-anki.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// načti .env.local ručně (žádný dotenv)
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: habits } = await db.from('habits')
  .select('id, name, mandatory, category, profile_id')
  .ilike('name', '%anki%')

console.log('\n=== HABITS matching "anki" ===')
console.log(habits)

if (!habits?.length) { console.log('Žádný Anki habit nenalezen.'); process.exit(0) }

for (const h of habits) {
  console.log(`\n=== ${h.name} (${h.id}) cat=${h.category} mandatory=${h.mandatory} ===`)

  const { data: cache } = await db.from('streaks_cache')
    .select('*').eq('habit_id', h.id)
  console.log('streaks_cache:', cache)

  const { data: logs } = await db.from('habit_logs')
    .select('date, status').eq('habit_id', h.id)
    .order('date', { ascending: false }).limit(15)
  console.log('posledních 15 habit_logs:', logs)
}
