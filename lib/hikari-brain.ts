import { createClient } from '@supabase/supabase-js'
import { streakFromDates } from './streak-core'
import { adherencePct, elapsedDays, isoMondayOf } from './cascade-pct'
import { detectAllPatterns, type PatternCandidate } from './pattern-detect'

// ─── Types ────────────────────────────────────────────────────────────────────

// Daily tasks (hlavní/vedlejší/bonus) come from the vault via vault-sync — Gemini
// no longer generates them. The morning brief is now just the mentor message.
export interface BriefData {
  cascade_nudge: string
  reasoning:    string
}

export interface CronResult {
  streaks:    { updated: number; errors: string[] }
  cascade:    { week: number; month: number; errors: string[] }
  brief:      'generated' | { error: string | null }
  milestones?: MilestoneResult
  patterns?:  PatternResult
}

// ─── Admin client (bypasses RLS — server-side only) ───────────────────────────

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ─── Streak recalculation ─────────────────────────────────────────────────────
// The algorithm lives in ./streak-core (shared with the client load path).

export async function recalcStreaks(
  db: ReturnType<typeof createAdminClient>,
  profileId: string,
  today: string
): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = []
  let updated = 0

  const { data: habits, error: hErr } = await db.from('habits')
    .select('id, name, mandatory')
    .eq('profile_id', profileId)
    .neq('category', 'retired')

  if (hErr || !habits?.length) {
    if (hErr) errors.push(`habits fetch: ${hErr.message}`)
    return { updated, errors }
  }

  const ids = habits.map(h => h.id as string)

  // Batch-fetch last 400 days of done logs for all habits
  const cutoff = new Date(`${today}T12:00:00Z`)
  cutoff.setDate(cutoff.getDate() - 400)

  const { data: logs, error: lErr } = await db.from('habit_logs')
    .select('habit_id, date, status')
    .in('habit_id', ids)
    .gte('date', cutoff.toISOString().slice(0, 10))
    .in('status', ['done', 'rest'])

  if (lErr) {
    errors.push(`habit_logs fetch: ${lErr.message}`)
    return { updated, errors }
  }

  // Group done + rest dates by habit (rest days are skipped in the streak walk)
  const byHabit = new Map<string, string[]>()
  const restByHabit = new Map<string, string[]>()
  for (const l of logs ?? []) {
    const target = l.status === 'rest' ? restByHabit : byHabit
    const a = target.get(l.habit_id as string) ?? []
    a.push(l.date as string)
    target.set(l.habit_id as string, a)
  }

  // Fetch existing best streaks once
  const { data: existing } = await db.from('streaks_cache')
    .select('habit_id, best_streak').in('habit_id', ids)
  const existingBest: Record<string, number> = {}
  for (const r of existing ?? []) existingBest[r.habit_id as string] = r.best_streak as number

  for (const h of habits) {
    const id = h.id as string
    const dates = byHabit.get(id) ?? []
    const restDates = restByHabit.get(id) ?? []
    const { streak, best, lastDone } = streakFromDates(dates, !!h.mandatory, today, restDates)
    const finalBest = Math.max(best, existingBest[id] ?? 0)

    const { error } = await db.from('streaks_cache').upsert({
      habit_id:             id,
      current_streak:       streak,
      best_streak:          finalBest,
      last_completed_date:  lastDone,
      total_completions:    dates.length,
      updated_at:           new Date().toISOString(),
    }, { onConflict: 'habit_id' })

    if (error) errors.push(`streak "${h.name as string}": ${error.message}`)
    else updated++
  }

  return { updated, errors }
}

// ─── Cascade habit-adherence % (input to the milestone calc) ────────────────────
// Week/month habit completion ratio. NOTE: this is no longer written to the L4/L5
// layer progress_pct (those now come from the Gemini milestone calc, like rok/5let).
// It still feeds the Gemini prompt as a signal, and drives the live "habity X%"
// badge on /cascade (recomputed client-side via the same lib/cascade-pct helpers).

export async function calcCascadePct(
  db: ReturnType<typeof createAdminClient>,
  profileId: string,
  today: string
): Promise<{ week: number; month: number; errors: string[] }> {
  const errors: string[] = []

  const { data: habits } = await db.from('habits')
    .select('id')
    .eq('profile_id', profileId)
    .neq('category', 'graduated')
    .neq('category', 'retired')

  if (!habits?.length) return { week: 0, month: 0, errors }

  const ids = habits.map(h => h.id as string)
  const monthStart = today.slice(0, 7) + '-01'

  const { data: logs, error: lErr } = await db.from('habit_logs')
    .select('date')
    .in('habit_id', ids)
    .gte('date', monthStart)
    .lte('date', today)       // include today — its completions should count
    .eq('status', 'done')

  if (lErr) {
    errors.push(`habit_logs cascade: ${lErr.message}`)
    return { week: 0, month: 0, errors }
  }

  const n         = ids.length
  const weekStart = isoMondayOf(today)
  const weekLogs  = (logs ?? []).filter(l => (l.date as string) >= weekStart)

  // Elapsed days INCLUDING today — Monday with 2/19 done = ~11%, not 0%.
  const { week: weekDays, month: monthDays } = elapsedDays(today)
  const week  = adherencePct(weekLogs.length,    n, weekDays)
  const month = adherencePct((logs ?? []).length, n, monthDays)

  return { week, month, errors }
}

// ─── Energy blocks from HOPE history ─────────────────────────────────────────
// Computes expected energy level per time-block per day-of-week from the last
// 30 days of hope_logs. Uses a circadian base curve (weights 0–1) scaled by the
// day's historical average vs. BASELINE=7. DELETE + INSERT (no unique constraint).

const BASE_CURVE: Array<{ hourStart: number; hourEnd: number; weight: number }> = [
  { hourStart: 6,  hourEnd: 8,  weight: 0.35 },
  { hourStart: 8,  hourEnd: 10, weight: 0.90 },
  { hourStart: 10, hourEnd: 12, weight: 0.85 },
  { hourStart: 12, hourEnd: 14, weight: 0.55 },
  { hourStart: 14, hourEnd: 16, weight: 0.50 },
  { hourStart: 16, hourEnd: 18, weight: 0.70 },
  { hourStart: 18, hourEnd: 20, weight: 0.38 },
  { hourStart: 20, hourEnd: 22, weight: 0.25 },
]

export async function calcEnergyBlocks(
  db: ReturnType<typeof createAdminClient>,
  profileId: string,
  today: string
): Promise<{ written: number; error: string | null }> {
  const cutoff = new Date(`${today}T12:00:00Z`)
  cutoff.setDate(cutoff.getDate() - 30)

  const { data: logs, error: lErr } = await db.from('hope_logs')
    .select('date, energy')
    .eq('profile_id', profileId)
    .gte('date', cutoff.toISOString().slice(0, 10))
    .lte('date', today)

  if (lErr) return { written: 0, error: lErr.message }
  if (!logs?.length) return { written: 0, error: 'no hope data' }

  // Group by JS day_of_week (0=Sun … 6=Sat — same as DB schema)
  const byDow: Record<number, number[]> = {}
  for (const log of logs) {
    const dow = new Date(`${log.date as string}T12:00:00Z`).getDay()
    ;(byDow[dow] ??= []).push(log.energy as number)
  }

  const overallAvg = logs.reduce((s, l) => s + (l.energy as number), 0) / logs.length
  const BASELINE = 7.0

  const rows: Array<{
    profile_id: string; day_of_week: number; hour_start: number; hour_end: number;
    level: string; confidence: number; sample_size: number; updated_at: string
  }> = []

  for (let dow = 0; dow < 7; dow++) {
    const vals = byDow[dow]
    const dayAvg = vals?.length ? vals.reduce((s, v) => s + v, 0) / vals.length : overallAvg
    const scale = dayAvg / BASELINE
    const sampleSize = vals?.length ?? 0
    const confidence = Math.min(sampleSize / 4, 1.0)

    for (const b of BASE_CURVE) {
      const scaled = b.weight * scale
      const level = scaled >= 0.65 ? 'high' : scaled >= 0.40 ? 'mid' : 'low'
      rows.push({
        profile_id: profileId, day_of_week: dow,
        hour_start: b.hourStart, hour_end: b.hourEnd,
        level, confidence, sample_size: sampleSize,
        updated_at: new Date().toISOString(),
      })
    }
  }

  // No unique constraint on the table — safe to DELETE + INSERT
  await db.from('energy_blocks').delete().eq('profile_id', profileId)
  const { error: iErr } = await db.from('energy_blocks').insert(rows)
  if (iErr) return { written: 0, error: iErr.message }
  return { written: rows.length, error: null }
}

// ─── Gemini brief ─────────────────────────────────────────────────────────────

// Pinned concrete model (not a "-latest" alias — those get removed without
// notice, which 404'd the first run with gemini-1.5-flash-latest). 2.5-flash
// is free-tier and ample for one brief/day. Bump deliberately when desired.
const GEMINI_MODEL = 'gemini-2.5-flash'

const CZ_DAYS = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota']

interface BriefCtx {
  today:           string
  weekPct:         number
  streaks:         Array<{ name: string; streak: number }>
  weekPriorities:  Array<{ name: string; detail: string | null; kind: string | null }>
  hopeYest:        { mood: number; energy: number; hope: number } | null
  memory:          string[]
  todayHabits:     { done: string[]; undone: string[]; total: number }
  vaultState:      string
  taskState:       string
  nowLabel:        string
}

// Shared Gemini call: structured-JSON generation with transient-error retry and
// UTF-8-safe decode. Returns the model text with markdown fences stripped (ready
// for JSON.parse). Both the daily brief and the cascade-milestone calc use it.
async function geminiGenerate(
  prompt: string,
  apiKey: string,
  opts: { temperature?: number; maxOutputTokens?: number } = {}
): Promise<string> {
  const body = JSON.stringify({
    contents:         [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature:      opts.temperature ?? 0.8,
      maxOutputTokens:  opts.maxOutputTokens ?? 4096,
      // Force structured output (no markdown fences, always valid JSON)
      responseMimeType: 'application/json',
      // 2.5-flash "thinking" eats the token budget before the answer; for a
      // bounded structured task we don't need it. Disabling avoids truncation.
      thinkingConfig:   { thinkingBudget: 0 },
    },
  })

  // Retry transient errors (503 overloaded, 429 rate-limit) with backoff —
  // a daily/manual run shouldn't fail just because the free tier was busy.
  let res: Response | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        // Bypass Next.js's patched fetch cache: it round-trips the body through
        // a string layer that mangled UTF-8 Czech diacritics into CP1250 mojibake
        // ("Matyáš" → "MatyĂˇĹˇ"). no-store keeps the raw bytes intact.
        cache:   'no-store',
      }
    )
    if (res.ok) break
    if (res.status !== 503 && res.status !== 429) break   // non-transient → stop
    if (attempt < 2) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
  }

  if (!res || !res.ok) throw new Error(`Gemini HTTP ${res?.status}: ${res ? await res.text() : 'no response'}`)

  // Decode bytes explicitly as UTF-8 rather than trusting res.json()/res.text(),
  // which under Next.js can fall back to the system codepage on Windows.
  const buf  = await res.arrayBuffer()
  const text = new TextDecoder('utf-8').decode(buf)
  const json = JSON.parse(text) as {
    candidates?: Array<{ content: { parts: Array<{ text: string }> } }>
  }
  const raw = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
}

export async function callGemini(ctx: BriefCtx): Promise<BriefData | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  const dayName   = CZ_DAYS[new Date(`${ctx.today}T12:00:00Z`).getDay()]
  const topStreaks = ctx.streaks
    .sort((a, b) => b.streak - a.streak).slice(0, 3)
    .map(s => `${s.name}: ${s.streak} dní`).join(' · ') || 'žádné'

  const prios = ctx.weekPriorities.length
    ? ctx.weekPriorities.map(p => `[${p.kind ?? 'main'}] ${p.name}${p.detail ? ` — ${p.detail}` : ''}`).join('\n')
    : '(nezjištěno)'

  const hopeStr = ctx.hopeYest
    ? `Mood ${ctx.hopeYest.mood}/10 · Energy ${ctx.hopeYest.energy}/10 · Hope ${ctx.hopeYest.hope}/10`
    : 'nezaznamenáno'

  const memStr = ctx.memory.slice(0, 4).map(m => `- ${m}`).join('\n') || '(prázdné)'

  const th = ctx.todayHabits
  const habitsStr = th.total === 0
    ? '(žádné habits v DB)'
    : `Dnes splněno ${th.done.length}/${th.total}.`
      + (th.done.length   ? ` Hotovo: ${th.done.join(', ')}.` : '')
      + (th.undone.length ? ` Zbývá: ${th.undone.slice(0, 12).join(', ')}.` : '')

  // Mentor character is baked from 2nd_brain/CLAUDE.md (KDO JSI + MENTORSKÝ
  // OBJEKTIV + RANNÍ BRIEF). Kept stable here rather than fetched, since it's
  // identity, not data. The data (habits/streaks/HOPE/priorities) is injected below.
  const prompt = `Jsi Hikari — AI mentor a druhý mozek Matyáše (16, SPŠOA Bruntál, INFP-T). Velký cíl: location-independent příjem před koncem střední → svoboda žít sen (Japonsko, výpravy na kole, příroda, tvorba).

JAK MLUVÍŠ:
- Přímý, tvrdý, bez cukrování. Kritika konkrétní a s důkazem z dat — ne obecná.
- Pochvala jen když je zasloužená a specifická.
- Rosteš z HOPE, ne ze strachu — rámuj pozitivně, ale upřímně. Žádné motivační plakáty.
- Jako Luffy: nikdy nevzdává, jde po snu naplno.
- Vždy česky. Oslovuj "Matyáši".

4 PILÍŘE (filtr každého rozhodnutí): příroda · jeden blízký člověk · svoboda cestovat · nezávislost (vlastní příjem, žádné fixní místo).

DATA NA DNES (${dayName} ${ctx.today}, právě je ${ctx.nowLabel}):
- Habits: ${habitsStr}
- Splnění habits tento týden: ${ctx.weekPct}%
- Streaky: ${topStreaks}
- HOPE poslední záznam: ${hopeStr}
- Denní úkoly (odškrtnuté na home): ${ctx.taskState || 'nezaznamenáno'}

Týdenní priority (z plánu ve vaultu):
${prios}

Vzory a kontext z Hikari paměti:
${memStr}

AKTUÁLNÍ STAV Z VAULTU (plány měsíce/týdne + poslední DOKONČENÉ reviews + denní feedbacky — skutečný stav věcí):
${ctx.vaultState || '(nedostupné)'}

POZOR NA ČAS: právě je ${ctx.nowLabel}. Habity i denní úkoly se plní celý den — pokud je ráno/dopoledne, NEHODNOŤ dnešní nesplněné habity/úkoly jako selhání (den teprve začal, je normální že je ještě 0/X). Dnešní splnění hodnoť kriticky až večer; jinak se opírej o VČEREJŠEK, streaky a dlouhodobé vzory. Co je dnes ještě nesplněné = nasměruj, nehubuj.

POZOR NA TÝDENNÍ PRIORITY: Týdenní priority (níže) popisují záměry pro CELÝ TÝDEN — ne pro dnešní den. Pokud vidíš u priority detail jako "2× sezení" nebo "3×/týden", jde o týdenní frekvenci, NE o dnešní počet. Nikdy nepřepisuj týdenní frekvenci jako dnešní plán ("dnes máš dvě jízdy" z "2× sezení" je chyba). Dnešní konkrétní plán je výhradně v sekci odškrtnutých denních úkolů.

ÚKOL — vytvoř ranní mentorskou zprávu na DNES. Konkrétní, ne obecné rady. Propojuj tečky: odkazuj na streaky, dnešní stav habits, vzory, týdenní priority, a hlavně na to, co posouvá sen. Když něco vázne, pojmenuj to přímo s důkazem z dat. (Konkrétní seznam denních úkolů NEgeneruj — ty si Matyáš píše sám; tvoje role je mentorský pohled a propojení.)

Odpověz POUZE čistým JSON (česky, s diakritikou):
{
  "cascade_nudge": "2-4 věty: úderná mentorská zpráva na dnešek. Která priorita nejvíc posouvá sen a proč. HOPE rámec, přímý tón.",
  "reasoning": "3-5 vět: connecting the dots — propoj dnešní stav (habits, streaky, HOPE, týden) do jednoho obrazu. Pojmenuj vzor nebo riziko. Co dnešek znamená v kontextu cesty ke snu."
}
cascade_nudge a reasoning musí být bohaté a osobní, ne generické.`

  const clean = await geminiGenerate(prompt, apiKey, { temperature: 0.8 })
  return JSON.parse(clean) as BriefData
}

// ─── Cascade milestone % (Gemini, on-demand only) ──────────────────────────────
// Per-milestone progress for L3 (year) / L4 (month) / L5 (week) + an overall
// layer % for L2 (5 years) and L3 (year). Heavier than the daily brief, so this
// runs ONLY from the "Přepočítej Hikari" button, never the 6:00 cron. Context =
// dashboard data (habits, streaks, week/month %, HOPE, memory) + the last few
// mentor-feedback files pulled from the vault (qualitative progress signal).

const GH_REPO   = 'matuk42/2nd-brain'
const GH_BRANCH = 'master'

async function ghFetchRaw(path: string, token: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${GH_REPO}/contents/${encodeURIComponent(path)}?ref=${GH_BRANCH}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3.raw' },
    cache:   'no-store',
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status} for ${path}`)
  const buf = await res.arrayBuffer()
  return new TextDecoder('utf-8').decode(buf)   // UTF-8 explicit (Windows CP1250 guard)
}

// ── Date / vault-path helpers (UTC) for the state assembly ──────────────────────
function shiftDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function monthOffset(today: string, off: number): string {
  const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + off)
  return d.toISOString().slice(0, 7)
}
function endOfMonthISO(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)   // day 0 of next month
}
function isoWeekStr(d: Date): string {
  const t = new Date(d); const dow = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dow)                          // Thursday of this week
  const y = t.getUTCFullYear()
  const wn = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7)
  return `${y}-W${String(wn).padStart(2, '0')}`
}
function isoWeekOf(iso: string): string { return isoWeekStr(new Date(`${iso}T12:00:00Z`)) }
function sundayOf(iso: string): string { return shiftDays(isoMondayOf(iso), 6) }

// A period file still carrying this marker is plan-only (current period) — its
// review isn't written yet, so it can't serve as actual-state evidence for %.
const PLAN_MARKER = 'vyplnit na konci'

/**
 * Assemble the current ACTUAL state from the vault review hierarchy, bounded:
 *   1. current month + week PLAN  (targets/context — whole file)
 *   2. latest COMPLETED monthly review  (step back past plan-only months)
 *   3. COMPLETED weekly reviews after that month's end
 *   4. daily mentor-feedbacks after the last completed week's end
 * The year layer needs months+weeks+days, which is a superset of what month/week
 * need, so one assembly serves the whole milestone calc + the brief. ~5–7 files.
 */
async function gatherVaultState(token: string, today: string): Promise<{ text: string; files: string[] }> {
  const parts: string[] = []
  const files: string[] = []
  const add = (label: string, path: string, md: string) => {
    parts.push(`### ${label} (${path})\n${md.trim()}`); files.push(path)
  }

  // 1 — current month + week PLAN (whole file: plan + as-yet-empty review)
  const curMonth = monthOffset(today, 0)
  const curWeek  = isoWeekOf(today)
  const cmMd = await ghFetchRaw(`wiki/reviews/monthly/${curMonth}.md`, token)
  if (cmMd) add(`Plán měsíce ${curMonth}`, `monthly/${curMonth}`, cmMd)
  const cwMd = await ghFetchRaw(`wiki/reviews/weekly/${curWeek}.md`, token)
  if (cwMd) add(`Plán týdne ${curWeek}`, `weekly/${curWeek}`, cwMd)

  // 2 — latest COMPLETED monthly review (skip plan-only). Bound 6 months back.
  let lastMonthEnd: string | null = null
  for (let i = 0; i <= 6; i++) {
    const ym = monthOffset(today, -i)
    const md = i === 0 ? cmMd : await ghFetchRaw(`wiki/reviews/monthly/${ym}.md`, token)
    if (md && !md.includes(PLAN_MARKER)) {
      if (i > 0) add(`Měsíční review ${ym}`, `monthly/${ym}`, md)   // i==0 already added as plan
      lastMonthEnd = endOfMonthISO(ym)
      break
    }
  }

  // 3 — COMPLETED weekly reviews after lastMonthEnd. Bound 8 weeks back; current
  // week is plan-only (added above) so start one week back.
  const weeks: Array<{ wk: string; end: string; md: string }> = []
  for (let i = 1; i <= 8; i++) {
    const probe = shiftDays(today, -7 * i)
    const wkEnd = sundayOf(probe)
    if (lastMonthEnd && wkEnd <= lastMonthEnd) break    // already covered by the monthly review
    const wk = isoWeekOf(probe)
    const md = await ghFetchRaw(`wiki/reviews/weekly/${wk}.md`, token)
    if (md && !md.includes(PLAN_MARKER) && !weeks.some(w => w.wk === wk)) {
      weeks.push({ wk, end: wkEnd, md })
    }
  }
  const lastWeekEnd = weeks[0]?.end ?? lastMonthEnd     // weeks[0] = most recent completed week
  for (const w of [...weeks].reverse()) add(`Týdenní review ${w.wk}`, `weekly/${w.wk}`, w.md)

  // 4 — daily feedbacks after the last completed week (chronological). Bound 12 days.
  // Strict < (not <=) so the day exactly at lastWeekEnd (Sunday) is still included —
  // on Monday that's yesterday, which would otherwise be silently skipped.
  const days: Array<{ date: string; md: string }> = []
  for (let i = 1; i <= 12; i++) {
    const date = shiftDays(today, -i)
    if (lastWeekEnd && date < lastWeekEnd) break
    const md = await ghFetchRaw(`logs/mentor-feedback/${date}-feedback.md`, token)
    if (md) days.push({ date, md })
  }
  for (const d of [...days].reverse()) add(`Feedback ${d.date}`, d.date, d.md)

  return { text: parts.join('\n\n---\n\n'), files }
}

export interface MilestoneResult {
  dims:   number
  layers: number
  error:  string | null
}

export async function calcMilestonePct(
  db: ReturnType<typeof createAdminClient>,
  profileId: string,
  today: string,
  cascade: { week: number; month: number },
  vaultState: string
): Promise<MilestoneResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { dims: 0, layers: 0, error: 'GEMINI_API_KEY missing' }

  // 1 — cascade layers (L2–L5) + their dimensions
  const { data: layers } = await db.from('cascade_layers')
    .select('id, layer, description, deadline')
    .eq('profile_id', profileId).eq('tree', 'sen').in('layer', [2, 3, 4, 5])
  if (!layers?.length) return { dims: 0, layers: 0, error: 'no cascade layers' }

  const layerInfo: Record<number, { id: string; deadline: string | null; description: string | null }> = {}
  const layerNumById: Record<string, number> = {}
  for (const l of layers) {
    layerInfo[l.layer as number] = {
      id: l.id as string, deadline: l.deadline as string | null, description: l.description as string | null,
    }
    layerNumById[l.id as string] = l.layer as number
  }

  const { data: dimRows } = await db.from('cascade_dimensions')
    .select('id, layer_id, name, detail, sort_order')
    .in('layer_id', layers.map(l => l.id as string))

  // Per-milestone scoring for L2–L5 — each layer's % is the mean of its scored
  // milestones (so the top number always agrees with the bars below it). L2 (5 let)
  // is now a live vault layer too, scored like the rest (no more holistic estimate).
  const PER_DIM = new Set([2, 3, 4, 5])
  const items = (dimRows ?? [])
    .filter(d => PER_DIM.has(layerNumById[d.layer_id as string]))
    .sort((a, b) => ((a.sort_order as number) ?? 0) - ((b.sort_order as number) ?? 0))
    .map((d, i) => ({
      key:    `m${i}`,
      id:     d.id as string,
      layer:  layerNumById[d.layer_id as string],
      name:   d.name as string,
      detail: (d.detail as string | null) ?? '',
    }))
  if (!items.length) return { dims: 0, layers: 0, error: 'no milestones to score' }

  // 2 — dashboard context
  const [streakRows, habitRows, hopeRows, memRows] = await Promise.all([
    db.from('streaks_cache').select('habit_id, current_streak').gt('current_streak', 0),
    db.from('habits').select('id, name, category').eq('profile_id', profileId).neq('category', 'retired'),
    db.from('hope_logs').select('date, mood, energy, hope').eq('profile_id', profileId)
      .order('date', { ascending: false }).limit(7),
    db.from('hikari_memory').select('content').eq('profile_id', profileId).eq('status', 'active').limit(6),
  ])

  const nameById: Record<string, string> = {}
  for (const h of habitRows.data ?? []) nameById[h.id as string] = h.name as string

  const topStreaks = (streakRows.data ?? [])
    .map(r => ({ name: nameById[r.habit_id as string] ?? '', streak: r.current_streak as number }))
    .filter(s => s.name).sort((a, b) => b.streak - a.streak).slice(0, 6)
    .map(s => `${s.name}: ${s.streak} dní`).join(' · ') || 'žádné'

  const habitNames = (habitRows.data ?? [])
    .filter(h => h.category !== 'graduated').map(h => h.name as string).join(', ') || '(žádné)'

  const hope = hopeRows.data ?? []
  const hopeStr = hope.length
    ? `poslední (${hope[0].date}): mood ${hope[0].mood} · energy ${hope[0].energy} · hope ${hope[0].hope}`
      + ` · 7d průměr energy ${(hope.reduce((s, r) => s + (r.energy as number), 0) / hope.length).toFixed(1)}`
    : 'nezaznamenáno'

  const memStr = (memRows.data ?? []).map(m => `- ${m.content as string}`).join('\n') || '(prázdné)'

  // 4 — milestone listing grouped by layer (with each layer's deadline for calibration)
  const layerHeader: Record<number, string> = {
    2: `L2 — 5 LET (${layerInfo[2]?.description ?? 'věk 21'}, deadline ${layerInfo[2]?.deadline ?? '2031-01-01'})`,
    3: `L3 — ROK (deadline ${layerInfo[3]?.deadline ?? '2027-09-01'})`,
    4: `L4 — MĚSÍC (${layerInfo[4]?.description ?? ''}, deadline ${layerInfo[4]?.deadline ?? ''})`,
    5: `L5 — TÝDEN (${layerInfo[5]?.description ?? ''}, deadline ${layerInfo[5]?.deadline ?? ''})`,
  }
  const grouped = [2, 3, 4, 5].map(ln => {
    const its = items.filter(i => i.layer === ln)
    if (!its.length) return ''
    return `\n${layerHeader[ln]}:\n`
      + its.map(i => `  ${i.key}: ${i.name}${i.detail ? ` — ${i.detail}` : ''}`).join('\n')
  }).filter(Boolean).join('\n')

  // Time axis of the current week/month — so weekly/monthly milestone % reflect
  // BOTH progress so far AND how much of the period is left (Monday with one
  // session done ≠ 90% of the week). Same helpers as calcCascadePct.
  const { week: weekDay, month: monthDay } = elapsedDays(today)
  const monthLen      = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate()
  const weekElapsed   = Math.round((weekDay / 7) * 100)
  const monthElapsed  = Math.round((monthDay / monthLen) * 100)
  const daysLeftWeek  = 7 - weekDay
  const daysLeftMonth = monthLen - monthDay
  const dayName       = CZ_DAYS[new Date(`${today}T12:00:00Z`).getUTCDay()]

  const prompt = `Jsi Hikari — analytický mozek Matyáše (16, SPŠOA Bruntál). Teď NEMENTORUJEŠ — STŘÍZLIVĚ odhaduješ procento splnění u každého cascade milníku z tvrdých dat a deníkových feedbacků. Matyáš míří k location-independent příjmu a svobodě žít sen (Japonsko, výpravy, příroda, tvorba). Dnes je ${today} (${dayName}).

ČASOVÁ OSA OBDOBÍ (klíčové pro L4/L5):
- Týden uplynul z ${weekElapsed} % (den ${weekDay}/7, zbývá ${daysLeftWeek} dní do neděle).
- Měsíc uplynul z ${monthElapsed} % (den ${monthDay}/${monthLen}, zbývá ${daysLeftMonth} dní).

TVRDÁ DATA:
- Trackované habits: ${habitNames}
- Splnění habits: tento týden ${cascade.week}% · tento měsíc ${cascade.month}%
- Aktivní streaky: ${topStreaks}
- HOPE: ${hopeStr}

KONTEXT Z PAMĚTI:
${memStr}

AKTUÁLNÍ STAV Z VAULTU (plány měsíce/týdne = cíle · poslední DOKONČENÉ reviews + denní feedbacky = skutečný pokrok):
${vaultState || '(nedostupné)'}

MILNÍKY K OHODNOCENÍ (klíč: název — detail):
${grouped}

ÚKOL:
Pro KAŽDÝ milník odhadni REÁLNÉ % splnění (0–100) vůči jeho skutečnému cíli. % musí kombinovat DVĚ věci dohromady:
1) co je reálně hotovo (kumulativně, z dat a feedbacků),
2) ČASOVOU OSU období — kolik z období zbývá a kolik práce na cíl ještě chybí.

Tělo logiky pro KADENCOVÉ milníky (opakování přes celé období, např. „autoškola testy 5×/den každý den", „Anki 25 karet denně"): cíl = plný počet za CELÉ období (týden = 7 dní, ne dnešek). Když je teprve ${dayName} a uplynulo ${weekElapsed} % týdne, i kdyby byl dnešek splněný, týdenní milník NEMŮŽE být 90 % — drž ho blízko reálně vykonané části vůči celotýdennímu cíli, navýšenou jen mírně dle trajektorie. Pro JEDNORÁZOVÉ / připravenostní milníky (např. „autoškola jízdy — dojít do potřebného počtu", „sentence mining 200 karet") počítej připravenost vůči cíli (kolik z potřebného je hotovo) — ta může být vysoká i brzy v týdnu, pokud data sedí.

Cíl: aby „${weekElapsed >= 40 && weekElapsed <= 60 ? 'jsem v polovině' : 'jsem na X %'}" znamenalo opravdu reálný pokrok k cíli, ne nafouknuté číslo. Buď konzervativní — bez signálu drž nízko. Roční (L3) hodnoť vůči 1.9.2027, „5 let" (L2) vůči 2031.

VYŠŠÍ VRSTVY = ROLLUP: při skórování milníků „5 let" (L2) a „Rok" (L3) ber jako důkaz trajektorie odpovídající pokrok v NIŽŠÍCH vrstvách (měsíc L4, týden L5) — když konkrétní dimenze (japonština, fyzička, příjem…) jede dole dobře, projev to i nahoře; když dole stojí, drž nahoře nízko. (Celkové % každé vrstvy se spočítá jako průměr jejích milníků — nevracej layer čísla.)

Odpověz POUZE čistým JSON (žádný text navíc):
{
  "milestones": { "m0": 0, "m1": 0, "...": "0-100 pro VŠECHNY klíče výše (L2–L5)" }
}`

  // 5 — Gemini (low temperature → stable, data-grounded estimates)
  const t0 = Date.now()
  let parsed: { milestones?: Record<string, number> }
  try {
    const clean = await geminiGenerate(prompt, apiKey, { temperature: 0.3 })
    parsed = JSON.parse(clean)
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e)
    await db.from('ai_invocations').insert({
      profile_id: profileId, trigger: 'button', purpose: 'cascade_milestones',
      model: GEMINI_MODEL, duration_ms: Date.now() - t0, success: false, error: err,
    })
    return { dims: 0, layers: 0, error: err }
  }

  // 6 — write back (clamp 0–100, round). Per-milestone % → dimensions; every
  // layer % (L2–L5) = mean of that layer's milestone %s, so the top number always
  // summarizes the bars below it (no more holistic L2 estimate diverging from them).
  const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)))

  const byLayer: Record<number, { sum: number; cnt: number }> = {}
  let dimsUpdated = 0
  for (const it of items) {
    const pct = parsed.milestones?.[it.key]
    if (pct == null) continue
    const v = clamp(pct)
    const { error } = await db.from('cascade_dimensions')
      .update({ progress_pct: v, updated_at: new Date().toISOString() })
      .eq('id', it.id)
    if (!error) dimsUpdated++
    const acc = (byLayer[it.layer] ??= { sum: 0, cnt: 0 })
    acc.sum += v; acc.cnt++
  }

  const mean = (ln: number): number | undefined =>
    byLayer[ln]?.cnt ? Math.round(byLayer[ln].sum / byLayer[ln].cnt) : undefined

  let layersUpdated = 0
  const layerVals: Array<[number, number | undefined]> = [
    [2, parsed.layer_5let == null ? undefined : clamp(parsed.layer_5let)],
    [3, mean(3)],
    [4, mean(4)],
    [5, mean(5)],
  ]
  for (const [ln, val] of layerVals) {
    if (val == null || !layerInfo[ln]) continue
    const { error } = await db.from('cascade_layers')
      .update({ progress_pct: val, updated_at: new Date().toISOString() })
      .eq('id', layerInfo[ln].id)
    if (!error) layersUpdated++
  }

  await db.from('ai_invocations').insert({
    profile_id: profileId, trigger: 'button', purpose: 'cascade_milestones',
    model: GEMINI_MODEL, duration_ms: Date.now() - t0, success: true, error: null,
  })

  return { dims: dimsUpdated, layers: layersUpdated, error: null }
}

// ─── Daily-task completion summary (signal for the brief) ───────────────────────
// Summarizes one day's ai_daily_brief tasks + done_keys (set by home click-to-strike)
// as "hlavní 2/3 · vedlejší 1/2 …" + the undone main tasks. Read live, so pressing
// "Přepočítej Hikari" mid-day reflects today's in-progress checkmarks; the 6:00 cron
// sees today as 0/Y (just planned) + yesterday as the real outcome. Degrades to ''
// before migration 006 (no done_keys column) — select errors → no row.

type DbTask = { title?: string; name?: string }

async function summarizeDayTasks(
  db: ReturnType<typeof createAdminClient>,
  profileId: string,
  date: string
): Promise<string> {
  const { data: row } = await db.from('ai_daily_brief')
    .select('hlavni, vedlejsi, bonus, done_keys')
    .eq('profile_id', profileId).eq('date', date).maybeSingle()
  if (!row) return ''

  const done = new Set((row.done_keys as string[] | null) ?? [])
  const groups: Array<[string, string, DbTask[]]> = [
    ['hlavní',   'hlavni',   (row.hlavni   as DbTask[] | null) ?? []],
    ['vedlejší', 'vedlejsi', (row.vedlejsi as DbTask[] | null) ?? []],
    ['bonus',    'bonus',    (row.bonus    as DbTask[] | null) ?? []],
  ]

  const parts: string[] = []
  const undoneMain: string[] = []
  for (const [label, prefix, arr] of groups) {
    if (!arr.length) continue
    const d = arr.filter((_, i) => done.has(`${prefix}-${i}`)).length
    parts.push(`${label} ${d}/${arr.length}`)
    if (prefix === 'hlavni') {
      arr.forEach((t, i) => { if (!done.has(`hlavni-${i}`)) undoneMain.push(t.title ?? t.name ?? '') })
    }
  }
  if (!parts.length) return ''

  let s = parts.join(' · ')
  const um = undoneMain.filter(Boolean)
  if (um.length) s += ` (nesplněné hlavní: ${um.join(', ')})`
  return s
}

// ─── Pattern detection → proposed memory (deterministic stats + Gemini curation) ──
// Step 1 (free): lib/pattern-detect finds candidates with VERIFIED numbers (means,
// deltas). Step 2: drop candidates whose source_ref already exists in hikari_memory
// (any status — so a once-rejected/archived pattern never comes back). Step 3 (AI,
// only if there are new candidates): Gemini judges causal meaningfulness USING the
// same vault context as the brief (gatherVaultState), rephrases survivors in mentor
// voice, and we write kept→'proposed', dropped→'archived'. The numbers stay the
// code's — Gemini may not change them. Bounded cost: a pattern is scored at most
// once per 7 days (user-decided refs never again; AI-archived refs reconsidered
// weekly as data grows).

export interface PatternResult {
  candidates: number
  proposed:   number
  archived:   number
  aiCall:     boolean
  error:      string | null
}

interface CurationVerdict { ref: string; keep: boolean; content?: string; type?: string }

export async function proposePatterns(
  db: ReturnType<typeof createAdminClient>,
  profileId: string,
  today: string,
  vaultState: string,
): Promise<PatternResult> {
  const empty: PatternResult = { candidates: 0, proposed: 0, archived: 0, aiCall: false, error: null }

  // 1 — gather inputs (60-day window) and run deterministic detection
  const cutoff = new Date(`${today}T12:00:00Z`); cutoff.setUTCDate(cutoff.getUTCDate() - 60)
  const since = cutoff.toISOString().slice(0, 10)

  const [hopeRes, habitRes] = await Promise.all([
    db.from('hope_logs').select('date, mood, energy, hope')
      .eq('profile_id', profileId).gte('date', since).lte('date', today),
    db.from('habits').select('id, name')
      .eq('profile_id', profileId).neq('category', 'retired'),
  ])
  const hope   = (hopeRes.data ?? []) as Array<{ date: string; mood: number; energy: number; hope: number }>
  const habits = (habitRes.data ?? []) as Array<{ id: string; name: string }>
  const ids    = habits.map(h => h.id)

  const { data: logData } = ids.length
    ? await db.from('habit_logs').select('habit_id, date, status')
        .in('habit_id', ids).gte('date', since).lte('date', today).eq('status', 'done')
    : { data: [] as Array<{ habit_id: string; date: string; status: string }> }

  const candidates = detectAllPatterns(hope, (logData ?? []) as Array<{ habit_id: string; date: string; status: string }>, habits)
  if (!candidates.length) return empty

  // 2 — dedup against memory. User-DECIDED rows (proposed/active/rejected) block a
  // ref forever — never nag about a rejected pattern, never dup a live one. But
  // AI-ARCHIVED rows (Gemini judged "not worth proposing now") are reconsidered as
  // data grows — just not more than once per 7 days, so a stable confounder isn't
  // re-scored on every run while data is still thin.
  const { data: existing } = await db.from('hikari_memory')
    .select('id, source_ref, status, created_at').eq('profile_id', profileId).eq('source', 'auto')
  const REEVAL_AFTER_MS = 7 * 24 * 60 * 60 * 1000
  const now = Date.now()
  const blocked = new Set<string>()
  for (const r of existing ?? []) {
    if (r.status !== 'archived') { blocked.add(r.source_ref as string); continue }
    if (now - new Date(r.created_at as string).getTime() < REEVAL_AFTER_MS) blocked.add(r.source_ref as string)
  }
  const fresh = candidates.filter(c => !blocked.has(c.sourceRef))
  if (!fresh.length) return { ...empty, candidates: candidates.length }

  // Clear stale archived rows for the refs we're about to re-evaluate (avoids dup
  // rows + restarts their 7-day clock). Only archived rows of fresh refs are removed.
  const freshRefs = new Set(fresh.map(c => c.sourceRef))
  const staleIds = (existing ?? [])
    .filter(r => r.status === 'archived' && freshRefs.has(r.source_ref as string))
    .map(r => r.id as string)
  if (staleIds.length) await db.from('hikari_memory').delete().in('id', staleIds)

  // 3 — Gemini curation (the only AI cost; skipped entirely when nothing is new)
  const apiKey = process.env.GEMINI_API_KEY
  const byRef = new Map(fresh.map(c => [c.sourceRef, c]))

  let verdicts: CurationVerdict[]
  const t0 = Date.now()

  if (!apiKey) {
    // No AI available → keep every candidate with its deterministic phrasing.
    verdicts = fresh.map(c => ({ ref: c.sourceRef, keep: true, content: c.fallbackText, type: c.memType }))
  } else {
    const list = fresh.map(c =>
      `- ref:${c.sourceRef} | ${c.kind === 'dow' ? 'den v týdnu' : 'habit→HOPE'} | Δ=${c.delta} | n=${c.sample} | "${c.fallbackText}"`
    ).join('\n')

    const prompt = `Jsi Hikari — analytický mozek Matyáše (16). Dostal jsi STATISTICKY OVĚŘENÉ kandidáty na vzory chování (čísla spočítal kód z reálných dat — jsou fakta, NEMĚŇ je). Tvůj úkol: rozhodnout, které jsou KAUZÁLNĚ SMYSLUPLNÉ a stojí za to nabídnout jako pravidlo do paměti — a které jsou jen ZÁMĚNA PŘÍČINY / časový konfounder, a mají se zahodit.

Dnes je ${today}.

POZOR na konfoundery: korelace ≠ příčina. Když data říkají „ve dnech kdy piješ vodu / bereš probiotika je nižší energie", NEZNAMENÁ to, že voda bere energii — spíš jsi ten návyk přidal během slabšího (např. nemocného) období. Takové zahoď (keep:false). Drž si jen vzory, které dávají reálný kauzální smysl a jsou akční (např. konkrétní den v týdnu bývá slabší → naplánovat lehčí program; konkrétní habit reálně zvedá HOPE → chránit ho).

Využij KONTEXT Z VAULTU níže (plány + dokončené reviews + denní feedbacky) — když z něj plyne, proč je korelace zdánlivá, zahoď ji; když ji potvrzuje, ponech a propoj.

KONTEXT Z VAULTU:
${vaultState || '(nedostupné)'}

KANDIDÁTI:
${list}

Pro každý kandidát vrať verdikt. U ponechaných (keep:true) napiš "content" = krátké pravidlo česky v Hikariho hlase (1 věta, max ~140 znaků), MUSÍ obsahovat přesně ta čísla z kandidáta (nevymýšlej nová). "type" = "pattern" (pozorovaný vzor) nebo "preference" (něco co Matyášovi prospívá). U zahozených stačí keep:false.

Odpověz POUZE čistým JSON:
{ "verdicts": [ { "ref": "...", "keep": true, "content": "…", "type": "pattern" }, { "ref": "...", "keep": false } ] }`

    try {
      const clean = await geminiGenerate(prompt, apiKey, { temperature: 0.4 })
      const parsed = JSON.parse(clean) as { verdicts?: CurationVerdict[] }
      verdicts = parsed.verdicts ?? []
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      await db.from('ai_invocations').insert({
        profile_id: profileId, trigger: 'cron', purpose: 'pattern_detection',
        model: GEMINI_MODEL, duration_ms: Date.now() - t0, success: false, error: err,
      })
      return { ...empty, candidates: candidates.length, aiCall: true, error: err }
    }
  }

  // 4 — write: kept → proposed, evaluated-but-dropped → archived (so never re-asked).
  // Any fresh candidate with no verdict defaults to archived (Gemini ignored it).
  const verdictByRef = new Map(verdicts.map(v => [v.ref, v]))
  const TYPES = new Set(['pattern', 'preference'])
  const rows = fresh.map((c: PatternCandidate) => {
    const v = verdictByRef.get(c.sourceRef)
    const keep = !!v?.keep
    return {
      profile_id: profileId,
      type:       keep && v?.type && TYPES.has(v.type) ? v.type : c.memType,
      content:    keep ? (v?.content?.trim() || c.fallbackText) : c.fallbackText,
      source:     'auto',
      source_ref: c.sourceRef,
      status:     keep ? 'proposed' : 'archived',
      confidence: c.confidence,
      ...(keep ? {} : { rejected_at: new Date().toISOString() }),
    }
  })

  const { error: insErr } = await db.from('hikari_memory').insert(rows)
  const proposed = rows.filter(r => r.status === 'proposed').length
  const archived = rows.filter(r => r.status === 'archived').length

  await db.from('ai_invocations').insert({
    profile_id: profileId, trigger: 'cron', purpose: 'pattern_detection',
    model: apiKey ? GEMINI_MODEL : 'deterministic', duration_ms: Date.now() - t0,
    success: !insErr, error: insErr?.message ?? null,
  })

  return {
    candidates: candidates.length,
    proposed,
    archived,
    aiCall:     !!apiKey,
    error:      insErr?.message ?? null,
  }
}

// ─── Main cron orchestrator ───────────────────────────────────────────────────

export async function runMorningCron(
  db: ReturnType<typeof createAdminClient>,
  profileId: string,
  today: string,
  trigger: 'cron' | 'button' = 'cron',
  withMilestones = false
): Promise<CronResult> {

  // 1 — Streaks
  const streaks = await recalcStreaks(db, profileId, today)

  // 2 — Cascade habit-adherence % (week/month). No longer written to the L4/L5
  // layer progress_pct — those now come from the Gemini milestone calc (button).
  // Still computed here: it feeds the Gemini prompt and the brief context below.
  const cascade = await calcCascadePct(db, profileId, today)

  // 2b — Energy blocks (cheap, no AI — derive from HOPE history)
  await calcEnergyBlocks(db, profileId, today)

  // 3 — Build Gemini context
  const [profileHabits, streakRows, weekDimRow, hopeRow, memRows] = await Promise.all([
    db.from('habits').select('id, name, category').eq('profile_id', profileId).neq('category', 'retired'),
    db.from('streaks_cache').select('habit_id, current_streak').gt('current_streak', 0),
    db.from('cascade_layers')
      .select('cascade_dimensions(name, detail, kind, sort_order)')
      .eq('profile_id', profileId).eq('tree', 'sen').eq('layer', 5)
      .maybeSingle(),
    db.from('hope_logs')
      .select('mood, energy, hope').eq('profile_id', profileId)
      .lt('date', today).order('date', { ascending: false }).limit(1).maybeSingle(),
    db.from('hikari_memory')
      .select('content').eq('profile_id', profileId).eq('status', 'active').limit(4),
  ])

  // Map habit IDs to names (only for this profile's habits)
  const habitIds = new Set((profileHabits.data ?? []).map(h => h.id as string))
  const nameById: Record<string, string> = {}
  for (const h of profileHabits.data ?? []) nameById[h.id as string] = h.name as string

  const briefStreaks = (streakRows.data ?? [])
    .filter(r => habitIds.has(r.habit_id as string))
    .map(r => ({ name: nameById[r.habit_id as string] ?? '', streak: r.current_streak as number }))
    .filter(s => s.name)

  // Today's habit completion — trackable (non-graduated) only, so the brief can
  // say "2/19 done" instead of the misleading week-% rollup.
  const trackable = (profileHabits.data ?? []).filter(h => h.category !== 'graduated')
  const trackableIds = trackable.map(h => h.id as string)
  const { data: todayLogs } = trackableIds.length
    ? await db.from('habit_logs').select('habit_id').in('habit_id', trackableIds)
        .eq('date', today).eq('status', 'done')
    : { data: [] as { habit_id: string }[] }
  const doneIdSet = new Set((todayLogs ?? []).map(l => l.habit_id as string))
  const todayHabits = {
    done:   trackable.filter(h => doneIdSet.has(h.id as string)).map(h => h.name as string),
    undone: trackable.filter(h => !doneIdSet.has(h.id as string)).map(h => h.name as string),
    total:  trackable.length,
  }

  type WeekDim = { name: string; detail: string | null; kind: string | null; sort_order: number | null }
  const weekPriorities = (
    (weekDimRow.data as { cascade_dimensions: WeekDim[] } | null)?.cascade_dimensions ?? []
  ).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  // 3b — Assemble current actual state from the vault review hierarchy (plans +
  // last completed reviews + recent feedbacks). Shared by the brief and the
  // milestone calc. Daily-cron cost: ~5–7 GitHub fetches; degrades to '' on
  // missing token / fetch error so the brief still runs.
  const ghToken = process.env.GITHUB_TOKEN ?? ''
  let vaultState = ''
  if (ghToken) {
    try { vaultState = (await gatherVaultState(ghToken, today)).text } catch { /* degrade silently */ }
  }

  // Daily-task completion (home click-to-strike) — today's in-progress (so a mid-day
  // "Přepočítej Hikari" reflects it) + yesterday's outcome. A signal for the nudge.
  let taskState = ''
  try {
    const [td, yd] = await Promise.all([
      summarizeDayTasks(db, profileId, today),
      summarizeDayTasks(db, profileId, shiftDays(today, -1)),
    ])
    const segs: string[] = []
    if (td) segs.push(`dnes zatím ${td}`)
    if (yd) segs.push(`včera ${yd}`)
    taskState = segs.join(' | ')
  } catch { /* degrade */ }

  // Local (Prague) time of day — so the mentor doesn't scold unfinished habits/tasks
  // in the morning (the day isn't over). Server runs UTC; convert explicitly.
  const nowH = Number(new Intl.DateTimeFormat('en-GB',
    { timeZone: 'Europe/Prague', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  const hhmm = new Intl.DateTimeFormat('cs-CZ',
    { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
  const phase = nowH < 11 ? 'ráno' : nowH < 17 ? 'odpoledne' : nowH < 22 ? 'večer' : 'noc'
  const nowLabel = `${hhmm} (${phase})`

  // 4 — Gemini brief
  const t0 = Date.now()
  let brief: BriefData | null = null
  let briefError: string | null = null

  try {
    brief = await callGemini({
      today,
      weekPct:        cascade.week,
      streaks:        briefStreaks,
      weekPriorities,
      hopeYest:       hopeRow.data ?? null,
      memory:         (memRows.data ?? []).map(m => m.content as string),
      todayHabits,
      vaultState,
      taskState,
      nowLabel,
    })
  } catch (e) {
    briefError = e instanceof Error ? e.message : String(e)
  }

  const durationMs = Date.now() - t0

  // Log AI invocation
  const { data: invoc } = await db.from('ai_invocations').insert({
    profile_id:  profileId,
    trigger,
    purpose:     'daily_brief',
    model:       GEMINI_MODEL,
    duration_ms: durationMs,
    success:     !!brief,
    error:       briefError,
  }).select('id').maybeSingle()

  // Cache brief — only nudge + reasoning. Daily tasks (hlavni/vedlejsi/bonus) are
  // owned by vault-sync and must not be touched here (disjoint columns, no clash).
  if (brief) {
    await db.from('ai_daily_brief').upsert({
      profile_id:    profileId,
      date:          today,
      cascade_nudge: brief.cascade_nudge,
      reasoning:     brief.reasoning,
      invocation_id: invoc?.id ?? null,
      generated_at:  new Date().toISOString(),
    }, { onConflict: 'profile_id,date' })
  }

  // 5 — Cascade milestone % (on-demand only — the "Přepočítej Hikari" button).
  // Skipped by the daily 6:00 cron: milestones move slowly and this is a heavier
  // call (reads vault feedbacks + scores every milestone).
  let milestones: MilestoneResult | undefined
  if (withMilestones) {
    try {
      milestones = await calcMilestonePct(db, profileId, today, cascade, vaultState)
    } catch (e) {
      milestones = { dims: 0, layers: 0, error: e instanceof Error ? e.message : String(e) }
    }
  }

  // 6 — Pattern detection → proposed memory. Reuses vaultState. Cheap when nothing
  // is new (detection is free; Gemini only fires for never-seen candidates), so it's
  // safe to run on every cron + button press.
  let patterns: PatternResult | undefined
  try {
    patterns = await proposePatterns(db, profileId, today, vaultState)
  } catch (e) {
    patterns = { candidates: 0, proposed: 0, archived: 0, aiCall: false, error: e instanceof Error ? e.message : String(e) }
  }

  return {
    streaks,
    cascade,
    brief: brief ? 'generated' : { error: briefError },
    ...(milestones ? { milestones } : {}),
    ...(patterns ? { patterns } : {}),
  }
}
