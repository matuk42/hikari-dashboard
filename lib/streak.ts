import { supabase } from './supabase'

export async function rebuildStreak(habitId: string, isMandatory: boolean): Promise<number> {
  const { data: logs } = await supabase
    .from('habit_logs')
    .select('date, status')
    .eq('habit_id', habitId)
    .order('date', { ascending: false })
    .limit(120)

  if (!logs || logs.length === 0) {
    await supabase.from('streaks_cache').upsert({
      habit_id: habitId,
      current_streak: 0,
      best_streak: 0,
      last_completed_date: null,
      last_grace_used: null,
      total_completions: 0,
      total_misses: 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'habit_id' })
    return 0
  }

  const doneDates = new Set(logs.filter(l => l.status === 'done').map(l => l.date as string))
  const totalCompletions = doneDates.size
  const totalMisses = logs.filter(l => l.status !== 'done').length

  const today = new Date()
  let streak = 0
  let graceUsed = false
  let lastCompleted: string | null = null
  let lastGrace: string | null = null
  let bestStreak = 0

  for (let i = 0; i <= 120; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const iso = d.toISOString().slice(0, 10)
    const isDone = doneDates.has(iso)

    if (isDone) {
      streak++
      if (!lastCompleted) lastCompleted = iso
      graceUsed = false
      bestStreak = Math.max(bestStreak, streak)
    } else if (i === 0) {
      // Today not logged yet — don't break streak
      continue
    } else if (!isMandatory && !graceUsed && streak > 0) {
      graceUsed = true
      lastGrace = iso
    } else {
      break
    }
  }

  await supabase.from('streaks_cache').upsert({
    habit_id: habitId,
    current_streak: streak,
    best_streak: bestStreak,
    last_completed_date: lastCompleted,
    last_grace_used: lastGrace,
    total_completions: totalCompletions,
    total_misses: totalMisses,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'habit_id' })

  return streak
}
