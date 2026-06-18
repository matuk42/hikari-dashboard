// Diagnostika rest days — najde všechny 'rest' logy + nejnovější habit_logs.
// Spuštění: node scripts/check-rest.mjs
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

const today = new Date()
const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
console.log('Dnešní lokální datum:', todayISO)

const { data: rest, error: rErr } = await db.from('habit_logs')
  .select('habit_id, date, status, source')
  .eq('status', 'rest')
  .order('date', { ascending: false })
console.log('\n=== Všechny REST logy ===')
if (rErr) console.log('CHYBA:', rErr)
console.log(rest)

const { data: recent } = await db.from('habit_logs')
  .select('habit_id, date, status')
  .order('date', { ascending: false })
  .limit(20)
console.log('\n=== 20 nejnovějších habit_logs (všechny statusy) ===')
console.log(recent)

// Je rest habit retired? (retired = vyřazen z /history listu)
const { data: hab } = await db.from('habits')
  .select('id, name, category')
  .eq('id', '99cad89a-69ef-483a-85f5-76747dd1e709')
console.log('\n=== Rest habit (je retired?) ===')
console.log(hab)

// Přesná replika /history fetchu: všechny non-retired habity + jejich logy za červen
const { data: habitsLite } = await db.from('habits')
  .select('id, name, category')
const activeIds = (habitsLite ?? []).filter(h => h.category !== 'retired').map(h => h.id)
const { data: monthLogs } = await db.from('habit_logs')
  .select('habit_id, date, status')
  .in('habit_id', activeIds)
  .gte('date', '2026-06-01')
  .lte('date', '2026-06-30')
const todayLogs = (monthLogs ?? []).filter(l => l.date === todayISO)
console.log(`\n=== /history-style fetch: dnešní logy (${todayISO}) z ${activeIds.length} aktivních habitů ===`)
console.log(todayLogs)
