// Dry-run: porovná current_streak v cache vs. přepočet z habit_logs (stejný algoritmus jako cron).
// Nic nezapisuje. Spuštění: node scripts/streak-dryrun.mjs
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

function streakFromDates(doneDates, mandatory, today) {
  const doneSet = new Set(doneDates)
  let streak = 0, graceUsed = false
  for (let i = 0; i <= 400; i++) {
    const d = new Date(`${today}T12:00:00Z`); d.setDate(d.getDate() - i)
    const s = d.toISOString().slice(0, 10)
    const isDone = doneSet.has(s)
    if (i === 0) { if (isDone) { streak++; graceUsed = false } continue }
    if (isDone) { streak++; graceUsed = false }
    else if (!mandatory && !graceUsed && streak > 0) { graceUsed = true }
    else break
  }
  return streak
}

const { data: habits } = await db.from('habits')
  .select('id, name, mandatory, category').neq('category', 'retired')

const { data: cache } = await db.from('streaks_cache').select('habit_id, current_streak')
const cacheById = Object.fromEntries((cache ?? []).map(r => [r.habit_id, r.current_streak]))

const cutoff = new Date(`${today}T12:00:00Z`); cutoff.setDate(cutoff.getDate() - 400)
const ids = habits.map(h => h.id)
const { data: logs } = await db.from('habit_logs')
  .select('habit_id, date').in('habit_id', ids)
  .gte('date', cutoff.toISOString().slice(0, 10)).eq('status', 'done')

const byHabit = new Map()
for (const l of logs ?? []) { const a = byHabit.get(l.habit_id) ?? []; a.push(l.date); byHabit.set(l.habit_id, a) }

console.log(`\ntoday=${today}\n${'HABIT'.padEnd(30)} cache → rebuild   (změna)`)
console.log('─'.repeat(60))
for (const h of habits.sort((a, b) => a.name.localeCompare(b.name))) {
  const rebuilt = streakFromDates(byHabit.get(h.id) ?? [], !!h.mandatory, today)
  const cur = cacheById[h.id] ?? 0
  const mark = rebuilt !== cur ? `  ⚠ ${cur} → ${rebuilt}` : ''
  console.log(`${h.name.padEnd(30)} ${String(cur).padStart(4)} → ${String(rebuilt).padStart(4)}${mark}`)
}
