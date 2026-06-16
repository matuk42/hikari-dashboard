// Jednorázově přepočítá streaky z habit_logs a ZAPÍŠE do streaks_cache (best_streak zachová).
// Stejný algoritmus jako lib/streak-core.ts. Spuštění: node scripts/streak-apply.mjs
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
  let streak = 0, best = 0, graceUsed = false
  const lastDone = [...doneDates].sort().reverse()[0] ?? null
  for (let i = 0; i <= 400; i++) {
    const d = new Date(`${today}T12:00:00Z`); d.setDate(d.getDate() - i)
    const s = d.toISOString().slice(0, 10)
    const isDone = doneSet.has(s)
    if (i === 0) { if (isDone) { streak++; best = Math.max(best, streak); graceUsed = false } continue }
    if (isDone) { streak++; best = Math.max(best, streak); graceUsed = false }
    else if (!mandatory && !graceUsed && streak > 0) { graceUsed = true }
    else break
  }
  return { streak, best, lastDone }
}

const { data: habits } = await db.from('habits')
  .select('id, name, mandatory').neq('category', 'retired')
const ids = habits.map(h => h.id)

const cutoff = new Date(`${today}T12:00:00Z`); cutoff.setDate(cutoff.getDate() - 400)
const { data: logs } = await db.from('habit_logs')
  .select('habit_id, date').in('habit_id', ids)
  .gte('date', cutoff.toISOString().slice(0, 10)).eq('status', 'done')
const byHabit = new Map()
for (const l of logs ?? []) { const a = byHabit.get(l.habit_id) ?? []; a.push(l.date); byHabit.set(l.habit_id, a) }

const { data: existing } = await db.from('streaks_cache').select('habit_id, best_streak')
const prevBest = Object.fromEntries((existing ?? []).map(r => [r.habit_id, r.best_streak ?? 0]))

for (const h of habits) {
  const dates = byHabit.get(h.id) ?? []
  const { streak, best, lastDone } = streakFromDates(dates, !!h.mandatory, today)
  const finalBest = Math.max(best, prevBest[h.id] ?? 0)
  const { error } = await db.from('streaks_cache').upsert({
    habit_id: h.id, current_streak: streak, best_streak: finalBest,
    last_completed_date: lastDone, total_completions: dates.length,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'habit_id' })
  if (streak > 0 || error) console.log(`${h.name.padEnd(28)} streak=${streak} best=${finalBest}${error ? '  ERR ' + error.message : ''}`)
}
console.log('hotovo')
