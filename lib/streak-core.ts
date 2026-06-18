// Pure streak algorithm — NO imports, safe for both server (cron) and client.
// Single source of truth for "X dní v řadě" so the morning cron and the in-app
// load path can never disagree (the old client path only ever broke streaks to 0
// and never rebuilt them upward from the logs → Anki showed 1 instead of 3).

/**
 * Compute the current streak (and best seen in this window) by walking backwards
 * from `today` over the set of 'done' dates.
 *   - mandatory (e.g. autoškola): no grace — a single missed day breaks it.
 *   - others: one rest day forgiven, a second consecutive miss breaks it.
 *   - explicit rest days (restDates): intentional skips (e.g. a 3×/week habit on
 *     its off days) — they neither break nor build the streak; the walk skips
 *     them entirely, so the streak number is preserved across the gap.
 * Today (i === 0) never breaks the streak if not yet done — the day is still open.
 */
export function streakFromDates(
  doneDates: string[],   // 'done' date strings ("YYYY-MM-DD"), any order
  mandatory: boolean,
  today: string,         // "YYYY-MM-DD"
  restDates: string[] = []   // 'rest' date strings — skipped (preserve streak)
): { streak: number; best: number; lastDone: string | null } {
  const doneSet = new Set(doneDates)
  const restSet = new Set(restDates)
  let streak    = 0
  let best      = 0
  let graceUsed = false
  const lastDone: string | null = [...doneDates].sort().reverse()[0] ?? null

  for (let i = 0; i <= 400; i++) {
    // Anchor at noon UTC so DST / timezone never shifts the calendar day.
    const d = new Date(`${today}T12:00:00Z`)
    d.setDate(d.getDate() - i)
    const s = d.toISOString().slice(0, 10)

    // Rest day: intentional skip — neither breaks nor builds the streak.
    if (restSet.has(s)) continue

    const isDone = doneSet.has(s)

    if (i === 0) {
      if (isDone) { streak++; best = Math.max(best, streak); graceUsed = false }
      continue   // today still in progress — don't break
    }

    if (isDone) {
      streak++
      best = Math.max(best, streak)
      graceUsed = false
    } else if (!mandatory && !graceUsed && streak > 0) {
      graceUsed = true   // one rest day forgiven
    } else {
      break
    }
  }

  return { streak, best, lastDone }
}
