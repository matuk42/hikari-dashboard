// ─── Deterministic pattern detection ────────────────────────────────────────────
// Pure functions, no DB, no AI. They turn raw hope_logs + habit_logs into pattern
// CANDIDATES with VERIFIED numbers (means / deltas computed here, never by Gemini).
// The brain (lib/hikari-brain.ts) then dedups against hikari_memory and lets Gemini
// curate + phrase the survivors with vault context — but the numbers stay these.
//
// Two pattern families (per PRD §7.1 examples):
//   1. day-of-week × HOPE metric   — "v úterý bývá energie nižší"
//   2. habit → HOPE metric         — "ve dnech kdy splníš kytaru je HOPE o +1.8 vyšší"

export type PatternMetric = 'energy' | 'mood' | 'hope'

export interface HopeRow { date: string; mood: number; energy: number; hope: number }
export interface HabitLogRow { habit_id: string; date: string; status: string }
export interface HabitRow { id: string; name: string }

export interface PatternCandidate {
  sourceRef:    string                  // stable dedup key — same pattern → same ref forever
  kind:         'dow' | 'habit'
  metric:       PatternMetric
  value:        number                  // the group mean (this weekday / done-days)
  baseline:     number                  // overall mean (dow) | not-done-days mean (habit)
  delta:        number                  // value − baseline (signed)
  sample:       number                  // group sample size
  fallbackText: string                  // deterministic Czech phrasing (used if Gemini drops the text)
  memType:      'pattern' | 'preference'
  confidence:   number                  // 0–1
}

// ─── Thresholds (conservative — better to miss a weak pattern than nag) ──────────
const MIN_DOW_SAMPLE   = 3     // need ≥3 of a given weekday before trusting its mean
const DOW_DELTA_MIN    = 1.0   // weekday mean must differ from overall by ≥1.0 points
const MIN_HABIT_SAMPLE = 4     // need ≥4 done-days AND ≥4 not-done-days
const HABIT_DELTA_MIN  = 1.0   // done vs not-done mean must differ by ≥1.0 points
const MAX_CANDIDATES   = 6     // cap per run — Gemini curates further

// JS getDay() index → Czech locative ("v pondělí", "ve středu", …)
const V_DAY = ['v neděli', 'v pondělí', 'v úterý', 've středu', 've čtvrtek', 'v pátek', 'v sobotu']

const METRIC_LABEL: Record<PatternMetric, string> = {
  energy: 'energie',
  mood:   'nálada',
  hope:   'naděje (HOPE)',
}

// ─── Small helpers ──────────────────────────────────────────────────────────────
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length
const round1 = (n: number): number => Math.round(n * 10) / 10
const cz = (n: number): string => round1(n).toFixed(1).replace('.', ',')   // "5,2"
const dow = (iso: string): number => new Date(`${iso}T12:00:00Z`).getUTCDay()

// Confidence blends sample size and effect size, each saturating, clamped to [0,1].
function confidenceOf(sample: number, absDelta: number): number {
  const bySample = Math.min(1, sample / 8)
  const byEffect = Math.min(1, absDelta / 2)
  return Math.round(bySample * byEffect * 100) / 100
}

// ─── 1. Day-of-week × HOPE metric ───────────────────────────────────────────────
// For each weekday + metric where we have enough samples and the weekday mean
// deviates from the overall mean by ≥ threshold, emit one candidate. To avoid 21
// near-duplicates we keep, per weekday, only the metric with the largest deviation.

export function detectDowPatterns(hope: HopeRow[]): PatternCandidate[] {
  if (hope.length < MIN_DOW_SAMPLE * 2) return []

  const metrics: PatternMetric[] = ['energy', 'mood', 'hope']
  const out: PatternCandidate[] = []

  // overall means per metric
  const overall: Record<PatternMetric, number> = {
    energy: mean(hope.map(h => h.energy)),
    mood:   mean(hope.map(h => h.mood)),
    hope:   mean(hope.map(h => h.hope)),
  }

  for (let d = 0; d < 7; d++) {
    const rows = hope.filter(h => dow(h.date) === d)
    if (rows.length < MIN_DOW_SAMPLE) continue

    // best (largest |delta|) metric for this weekday
    let best: { metric: PatternMetric; value: number; delta: number } | null = null
    for (const m of metrics) {
      const value = mean(rows.map(r => r[m]))
      const delta = value - overall[m]
      if (Math.abs(delta) < DOW_DELTA_MIN) continue
      if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { metric: m, value, delta }
    }
    if (!best) continue

    const up = best.delta > 0
    const label = METRIC_LABEL[best.metric]
    const fallbackText = up
      ? `${V_DAY[d][0].toUpperCase()}${V_DAY[d].slice(1)} ti ${label} stoupá — průměr ${cz(best.value)}/10 oproti běžným ${cz(overall[best.metric])}/10.`
      : `${V_DAY[d][0].toUpperCase()}${V_DAY[d].slice(1)} bývá tvoje ${label} nižší — průměr ${cz(best.value)}/10 oproti běžným ${cz(overall[best.metric])}/10.`

    out.push({
      sourceRef:    `dow-${best.metric}-${d}`,
      kind:         'dow',
      metric:       best.metric,
      value:        round1(best.value),
      baseline:     round1(overall[best.metric]),
      delta:        round1(best.delta),
      sample:       rows.length,
      fallbackText,
      memType:      'pattern',
      confidence:   confidenceOf(rows.length, Math.abs(best.delta)),
    })
  }

  return out
}

// ─── 2. Habit → HOPE metric ─────────────────────────────────────────────────────
// For each habit, compare the HOPE metric on days it was done vs days it wasn't
// (within the same hope_logs window). Per habit, keep the metric with the largest
// |delta| that crosses the threshold, with enough samples on both sides.

export function detectHabitHopePatterns(
  habitLogs: HabitLogRow[],
  hope: HopeRow[],
  habits: HabitRow[],
): PatternCandidate[] {
  if (hope.length < MIN_HABIT_SAMPLE * 2) return []

  const hopeByDate = new Map<string, HopeRow>()
  for (const h of hope) hopeByDate.set(h.date, h)
  const hopeDates = new Set(hopeByDate.keys())

  const metrics: PatternMetric[] = ['hope', 'energy', 'mood']
  const out: PatternCandidate[] = []

  for (const habit of habits) {
    // dates this habit was actually done, intersected with dates we have HOPE for
    const doneDates = new Set(
      habitLogs.filter(l => l.habit_id === habit.id && l.status === 'done' && hopeDates.has(l.date))
        .map(l => l.date)
    )
    if (doneDates.size < MIN_HABIT_SAMPLE) continue

    const doneRows: HopeRow[]    = []
    const notDoneRows: HopeRow[] = []
    for (const h of hope) (doneDates.has(h.date) ? doneRows : notDoneRows).push(h)
    if (notDoneRows.length < MIN_HABIT_SAMPLE) continue

    let best: { metric: PatternMetric; value: number; baseline: number; delta: number } | null = null
    for (const m of metrics) {
      const value    = mean(doneRows.map(r => r[m]))
      const baseline = mean(notDoneRows.map(r => r[m]))
      const delta    = value - baseline
      if (Math.abs(delta) < HABIT_DELTA_MIN) continue
      if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { metric: m, value, baseline, delta }
    }
    if (!best) continue

    const up = best.delta > 0
    const label = METRIC_LABEL[best.metric]
    const fallbackText = up
      ? `Ve dnech, kdy splníš „${habit.name}", je tvoje ${label} v průměru o ${cz(Math.abs(best.delta))} vyšší (${cz(best.value)} vs. ${cz(best.baseline)}).`
      : `Ve dnech, kdy splníš „${habit.name}", je tvoje ${label} v průměru o ${cz(Math.abs(best.delta))} nižší (${cz(best.value)} vs. ${cz(best.baseline)}).`

    out.push({
      sourceRef:    `habit-${best.metric}-${habit.id}`,
      kind:         'habit',
      metric:       best.metric,
      value:        round1(best.value),
      baseline:     round1(best.baseline),
      delta:        round1(best.delta),
      sample:       doneDates.size,
      fallbackText,
      memType:      up ? 'preference' : 'pattern',
      confidence:   confidenceOf(doneDates.size, Math.abs(best.delta)),
    })
  }

  return out
}

// ─── Combine + rank ─────────────────────────────────────────────────────────────
// All candidates from both families, strongest first (confidence × |delta|), capped.

export function detectAllPatterns(
  hope: HopeRow[],
  habitLogs: HabitLogRow[],
  habits: HabitRow[],
): PatternCandidate[] {
  const all = [...detectDowPatterns(hope), ...detectHabitHopePatterns(habitLogs, hope, habits)]
  return all
    .sort((a, b) => (b.confidence * Math.abs(b.delta)) - (a.confidence * Math.abs(a.delta)))
    .slice(0, MAX_CANDIDATES)
}
