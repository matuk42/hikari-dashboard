// Pure habit-adherence math shared by the morning cron (server) and the cascade
// page's live "habity X%" badge (client). No DB access here — callers pass counts.

/** ISO date (YYYY-MM-DD) of Monday of the week containing `today`. */
export function isoMondayOf(today: string): string {
  const d = new Date(`${today}T12:00:00Z`)
  const dow = d.getUTCDay() || 7              // Sun→7 Mon→1 … Sat→6
  d.setUTCDate(d.getUTCDate() - (dow - 1))    // rewind to Monday
  return d.toISOString().slice(0, 10)
}

/** Days elapsed in the current week and month, INCLUDING today (Mon with 1 done = day 1). */
export function elapsedDays(today: string): { week: number; month: number } {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay() || 7   // Sun→7 Mon→1
  return { week: dow, month: parseInt(today.slice(8), 10) }
}

/** Adherence % = completions / (habits × daysElapsed), rounded and clamped to 0–100. */
export function adherencePct(done: number, habits: number, days: number): number {
  if (habits <= 0 || days <= 0) return 0
  return Math.min(100, Math.round((done / (habits * days)) * 100))
}
