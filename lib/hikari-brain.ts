import { createClient } from '@supabase/supabase-js'
import { streakFromDates } from './streak-core'
import { adherencePct, elapsedDays, isoMondayOf } from './cascade-pct'

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
    .select('habit_id, date')
    .in('habit_id', ids)
    .gte('date', cutoff.toISOString().slice(0, 10))
    .eq('status', 'done')

  if (lErr) {
    errors.push(`habit_logs fetch: ${lErr.message}`)
    return { updated, errors }
  }

  // Group by habit
  const byHabit = new Map<string, string[]>()
  for (const l of logs ?? []) {
    const a = byHabit.get(l.habit_id as string) ?? []
    a.push(l.date as string)
    byHabit.set(l.habit_id as string, a)
  }

  // Fetch existing best streaks once
  const { data: existing } = await db.from('streaks_cache')
    .select('habit_id, best_streak').in('habit_id', ids)
  const existingBest: Record<string, number> = {}
  for (const r of existing ?? []) existingBest[r.habit_id as string] = r.best_streak as number

  for (const h of habits) {
    const id = h.id as string
    const dates = byHabit.get(id) ?? []
    const { streak, best, lastDone } = streakFromDates(dates, !!h.mandatory, today)
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

DATA NA DNES (${dayName} ${ctx.today}):
- Habits: ${habitsStr}
- Splnění habits tento týden: ${ctx.weekPct}%
- Streaky: ${topStreaks}
- HOPE poslední záznam: ${hopeStr}

Týdenní priority (z plánu ve vaultu):
${prios}

Vzory a kontext z Hikari paměti:
${memStr}

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
  const days: Array<{ date: string; md: string }> = []
  for (let i = 1; i <= 12; i++) {
    const date = shiftDays(today, -i)
    if (lastWeekEnd && date <= lastWeekEnd) break
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

  // Per-milestone scoring is for L3/L4/L5 only — L2's dimensions are curated in
  // the UI (not rendered from DB), so for L2 we estimate the layer % alone.
  const PER_DIM = new Set([3, 4, 5])
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
    3: `L3 — ROK (deadline ${layerInfo[3]?.deadline ?? '2027-09-01'})`,
    4: `L4 — MĚSÍC (${layerInfo[4]?.description ?? ''}, deadline ${layerInfo[4]?.deadline ?? ''})`,
    5: `L5 — TÝDEN (${layerInfo[5]?.description ?? ''}, deadline ${layerInfo[5]?.deadline ?? ''})`,
  }
  const grouped = [3, 4, 5].map(ln => {
    const its = items.filter(i => i.layer === ln)
    if (!its.length) return ''
    return `\n${layerHeader[ln]}:\n`
      + its.map(i => `  ${i.key}: ${i.name}${i.detail ? ` — ${i.detail}` : ''}`).join('\n')
  }).filter(Boolean).join('\n')

  const prompt = `Jsi Hikari — analytický mozek Matyáše (16, SPŠOA Bruntál). Teď NEMENTORUJEŠ — STŘÍZLIVĚ odhaduješ procento splnění u každého cascade milníku z tvrdých dat a deníkových feedbacků. Matyáš míří k location-independent příjmu a svobodě žít sen (Japonsko, výpravy, příroda, tvorba). Dnes je ${today}.

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
Pro KAŽDÝ milník odhadni realistické % splnění (0–100) vzhledem k jeho deadline a aktuálnímu stavu. Buď konzervativní a opřený o data — když pro milník nemáš signál, drž nízko. Týdenní (L5) a měsíční (L4) milníky hodnoť vůči jejich krátkému horizontu; roční (L3) vůči 1.9.2027. (Celkové % vrstev týden/měsíc/rok se spočítají jako průměr těchto milníků — nevracej je.) Dále odhadni jen CELKOVÉ % pro vrstvu „5 let" (věk 21, 2031) jako vážený obraz pokroku napříč dimenzemi.

Odpověz POUZE čistým JSON (žádný text navíc):
{
  "milestones": { "m0": 0, "m1": 0, "...": "0-100 pro všechny klíče výše" },
  "layer_5let": 0
}`

  // 5 — Gemini (low temperature → stable, data-grounded estimates)
  const t0 = Date.now()
  let parsed: { milestones?: Record<string, number>; layer_5let?: number }
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

  // 6 — write back (clamp 0–100, round). Per-milestone % → dimensions; layer %
  // for týden/měsíc/rok = mean of that layer's milestone %s (so the top number
  // summarizes the bars below it); 5 let = Gemini's holistic estimate.
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
      milestones = await calcMilestonePct(db, profileId, today, cascade)
    } catch (e) {
      milestones = { dims: 0, layers: 0, error: e instanceof Error ? e.message : String(e) }
    }
  }

  return {
    streaks,
    cascade,
    brief: brief ? 'generated' : { error: briefError },
    ...(milestones ? { milestones } : {}),
  }
}
