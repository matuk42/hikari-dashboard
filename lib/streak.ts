import { supabase } from './supabase'
import { streakFromDates } from './streak-core'

interface HabitLite { id: string; mandatory?: boolean }

/**
 * Rebuild every habit's streak from `habit_logs` (the source of truth) and write
 * the result to `streaks_cache`. Runs on app load so the displayed streak is
 * always correct regardless of toggle history — the old reconcile path only ever
 * *broke* streaks to 0 and never rebuilt them upward, so a real run drifted out
 * of sync (Anki showed 1 instead of its real 3). `best_streak` is preserved via
 * max() so the vault-seeded all-time best (e.g. Anki 45) survives.
 * Returns a map habitId → current streak.
 */
export async function rebuildStreaksFromLogs(
  habits: HabitLite[],
  today: string,         // "YYYY-MM-DD"
): Promise<Record<string, number>> {
  const ids = habits.map(h => h.id)
  if (!ids.length) return {}

  const cutoff = new Date(`${today}T12:00:00Z`)
  cutoff.setDate(cutoff.getDate() - 400)

  const { data: logs } = await supabase.from('habit_logs')
    .select('habit_id, date, status')
    .in('habit_id', ids)
    .gte('date', cutoff.toISOString().slice(0, 10))
    .in('status', ['done', 'rest'])

  // Group done + rest dates by habit (rest days are skipped in the streak walk)
  const byHabit = new Map<string, string[]>()
  const restByHabit = new Map<string, string[]>()
  for (const l of logs ?? []) {
    const target = l.status === 'rest' ? restByHabit : byHabit
    const a = target.get(l.habit_id as string) ?? []
    a.push(l.date as string)
    target.set(l.habit_id as string, a)
  }

  // Existing best streaks (preserve all-time best — e.g. seeded baseline)
  const { data: existing } = await supabase.from('streaks_cache')
    .select('habit_id, best_streak, current_streak').in('habit_id', ids)
  const prevBest: Record<string, number> = {}
  const prevCur:  Record<string, number> = {}
  for (const r of existing ?? []) {
    prevBest[r.habit_id as string] = (r.best_streak as number) ?? 0
    prevCur[r.habit_id as string]  = (r.current_streak as number) ?? 0
  }

  const out: Record<string, number> = {}
  const mandatoryById: Record<string, boolean> = {}
  for (const h of habits) mandatoryById[h.id] = !!h.mandatory

  for (const h of habits) {
    const dates = byHabit.get(h.id) ?? []
    const restDates = restByHabit.get(h.id) ?? []
    const { streak, best, lastDone } = streakFromDates(dates, mandatoryById[h.id], today, restDates)
    out[h.id] = streak
    const finalBest = Math.max(best, prevBest[h.id] ?? 0)

    // Only write when something actually changed (avoid needless upserts)
    if (streak !== (prevCur[h.id] ?? 0) || finalBest !== (prevBest[h.id] ?? 0)) {
      await supabase.from('streaks_cache').upsert({
        habit_id:            h.id,
        current_streak:      streak,
        best_streak:         finalBest,
        last_completed_date: lastDone,
        total_completions:   dates.length,
        updated_at:          new Date().toISOString(),
      }, { onConflict: 'habit_id' })
    }
  }

  return out
}
