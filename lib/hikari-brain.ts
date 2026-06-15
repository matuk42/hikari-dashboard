import { createClient } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BriefItem { title: string; project: string; reason: string }

export interface BriefData {
  hlavni:       BriefItem[]
  vedlejsi:     BriefItem[]
  bonus:        BriefItem[]
  cascade_nudge: string
  reasoning:    string
}

export interface CronResult {
  streaks:  { updated: number; errors: string[] }
  cascade:  { week: number; month: number; errors: string[] }
  brief:    'generated' | { error: string | null }
}

// ─── Admin client (bypasses RLS — server-side only) ───────────────────────────

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ─── Streak recalculation ─────────────────────────────────────────────────────

function streakFromDates(
  doneDates: string[],   // all 'done' date strings for this habit (any order)
  mandatory: boolean,
  today: string          // "YYYY-MM-DD"
): { streak: number; best: number; lastDone: string | null } {
  const doneSet = new Set(doneDates)
  let streak    = 0
  let best      = 0
  let graceUsed = false
  const lastDone: string | null = [...doneDates].sort().reverse()[0] ?? null

  // Walk backwards starting from today (today may or may not be done)
  for (let i = 0; i <= 400; i++) {
    const d = new Date(`${today}T12:00:00Z`)
    d.setDate(d.getDate() - i)
    const s = d.toISOString().slice(0, 10)
    const isDone = doneSet.has(s)

    if (i === 0) {
      // Today: if done, count it; if not, don't break (day still in progress)
      if (isDone) { streak++; best = Math.max(best, streak); graceUsed = false }
      continue
    }

    if (isDone) {
      streak++
      best = Math.max(best, streak)
      graceUsed = false
    } else if (!mandatory && !graceUsed && streak > 0) {
      graceUsed = true  // one rest day forgiven
    } else {
      break
    }
  }

  return { streak, best, lastDone }
}

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

// ─── Cascade % from habits ────────────────────────────────────────────────────

function isoMonday(today: string): string {
  const d = new Date(`${today}T12:00:00Z`)
  const dow = d.getDay() || 7           // Sun→7 Mon→1 … Sat→6
  d.setDate(d.getDate() - (dow - 1))    // rewind to Monday
  return d.toISOString().slice(0, 10)
}

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
    .lt('date', today)        // exclude today (still in progress)
    .eq('status', 'done')

  if (lErr) {
    errors.push(`habit_logs cascade: ${lErr.message}`)
    return { week: 0, month: 0, errors }
  }

  const n          = ids.length
  const weekStart  = isoMonday(today)
  const weekLogs   = (logs ?? []).filter(l => (l.date as string) >= weekStart)

  const d = new Date(`${today}T12:00:00Z`)
  const dayOfWeek  = d.getDay() === 0 ? 7 : d.getDay()
  const weekDays   = Math.max(1, dayOfWeek - 1)   // completed days before today in this week
  const monthDay   = parseInt(today.slice(8), 10)
  const monthDays  = Math.max(1, monthDay - 1)    // completed days before today in this month

  const week  = Math.min(100, Math.round((weekLogs.length  / (n * weekDays))  * 100))
  const month = Math.min(100, Math.round(((logs ?? []).length / (n * monthDays)) * 100))

  return { week, month, errors }
}

// ─── Gemini brief ─────────────────────────────────────────────────────────────

const CZ_DAYS = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota']

interface BriefCtx {
  today:           string
  weekPct:         number
  streaks:         Array<{ name: string; streak: number }>
  weekPriorities:  Array<{ name: string; detail: string | null; kind: string | null }>
  hopeYest:        { mood: number; energy: number; hope: number } | null
  memory:          string[]
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

  const memStr = ctx.memory.slice(0, 3).join('\n') || '(prázdné)'

  const prompt = `Jsi Hikari — Matyášův AI mentor (16 let, SPŠOA Bruntál, cíl: location-free příjem před koncem SŠ). Tón: přímý, konkrétní, bez omlouvání — jako Luffy, který nikdy nevzdává. Vždy česky.

Datum: ${dayName} ${ctx.today}
Splnění habits tento týden: ${ctx.weekPct}%
Top streaky: ${topStreaks}
HOPE včera: ${hopeStr}

Týdenní priority:
${prios}

Vzory z Hikari paměti:
${memStr}

Vytvoř ranní brief — konkrétní akce na DNES, ne obecné rady. Odpověz POUZE čistým JSON bez markdown bloků:
{"hlavni":[{"title":"...","project":"...","reason":"..."}],"vedlejsi":[{"title":"...","project":"...","reason":"..."}],"bonus":[{"title":"...","project":"...","reason":"..."}],"cascade_nudge":"...","reasoning":"..."}
Hlavní max 3, vedlejší max 2, bonus max 2.`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        contents:         [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
      }),
    }
  )

  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`)

  const json = await res.json() as {
    candidates?: Array<{ content: { parts: Array<{ text: string }> } }>
  }
  const raw   = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const clean = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  return JSON.parse(clean) as BriefData
}

// ─── Main cron orchestrator ───────────────────────────────────────────────────

export async function runMorningCron(
  db: ReturnType<typeof createAdminClient>,
  profileId: string,
  today: string,
  trigger: 'cron' | 'button' = 'cron'
): Promise<CronResult> {

  // 1 — Streaks
  const streaks = await recalcStreaks(db, profileId, today)

  // 2 — Cascade % (L5=week, L4=month from habit logs)
  const cascade = await calcCascadePct(db, profileId, today)

  const { data: layers } = await db.from('cascade_layers')
    .select('id, layer')
    .eq('profile_id', profileId).eq('tree', 'sen').in('layer', [4, 5])

  for (const layer of layers ?? []) {
    const pct = (layer.layer as number) === 5 ? cascade.week : cascade.month
    await db.from('cascade_layers')
      .update({ progress_pct: pct, updated_at: new Date().toISOString() })
      .eq('id', layer.id as string)
  }

  // 3 — Build Gemini context
  const [profileHabits, streakRows, weekDimRow, hopeRow, memRows] = await Promise.all([
    db.from('habits').select('id, name').eq('profile_id', profileId).neq('category', 'retired'),
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
    })
  } catch (e) {
    briefError = e instanceof Error ? e.message : String(e)
  }

  const durationMs = Date.now() - t0

  // Log AI invocation
  const { data: invoc } = await db.from('ai_invocations').insert({
    profile_id:  profileId,
    trigger:     'cron',
    purpose:     'daily_brief',
    model:       'gemini-1.5-flash-latest',
    duration_ms: durationMs,
    success:     !!brief,
    error:       briefError,
  }).select('id').maybeSingle()

  // Cache brief
  if (brief) {
    await db.from('ai_daily_brief').upsert({
      profile_id:    profileId,
      date:          today,
      hlavni:        brief.hlavni,
      vedlejsi:      brief.vedlejsi,
      bonus:         brief.bonus,
      cascade_nudge: brief.cascade_nudge,
      reasoning:     brief.reasoning,
      invocation_id: invoc?.id ?? null,
      generated_at:  new Date().toISOString(),
    }, { onConflict: 'profile_id,date' })
  }

  return {
    streaks,
    cascade,
    brief: brief ? 'generated' : { error: briefError },
  }
}
