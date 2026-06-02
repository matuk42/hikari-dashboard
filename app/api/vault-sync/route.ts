import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// ─── Config ───────────────────────────────────────────────────────────────────

const REPO   = 'matuk42/2nd-brain'
const BRANCH = 'master'

const STATIC_PATHS = {
  sen:    'wiki/cile/cascade/sen.md',
  prijem: 'wiki/cile/cascade/prijem.md',
  habits: 'wiki/cile/habits.md',
} as const

/** ISO 8601 week string, e.g. "2026-W23" */
function isoWeekStr(): string {
  const d = new Date()
  const dow = d.getDay() || 7           // Sun→7, Mon→1 … Sat→6
  d.setDate(d.getDate() + 4 - dow)     // advance to Thursday of current week
  const y = d.getFullYear()
  const yearStart = new Date(y, 0, 1)
  const wn = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${y}-W${String(wn).padStart(2, '0')}`
}

/** Current year-month string, e.g. "2026-06" */
function yearMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Vault uses longer names; dashboard uses shorter canonical ones.
// Without this map the sync would INSERT parallel duplicate habits instead of
// updating existing rows (habits has UNIQUE profile_id,name).
const HABIT_NAME_MAP: Record<string, string> = {
  'Anki tvorba (sentence mining)': 'Anki tvorba',
  'Spánek 22:00–06:15 pravidelně (víkend ±30 min)': 'Spánek 22:00–06:15',
  'Vit D3 1000 IU denně': 'Vit D3 1000 IU',
  'Zinek 1×/týden preventivně + 5 dní při škrábání': 'Zinek',
  'Probiotika (kefír / kysané zelí / bílý jogurt)': 'Probiotika',
  '2 L vody / den': '2 L vody',
  '2× ovoce + 0 sladké/slané': '2× ovoce + 0 sladké',
  'Větrat ložnici + vlhčit vzduch před spaním': 'Větrat ložnici',
  'Větrat ložnici + vlhčit vzduch': 'Větrat ložnici',
  'Omega-3 (sardinky 2×/tý NEBO doplněk)': 'Omega-3',
  'Omega-3 — sardinky 2×/týden NEBO rybí olej doplněk': 'Omega-3',
  'Posilování calisthenic před školou': 'Posilování calisthenics',
  'Studená sprcha ráno 30s': 'Studená sprcha 30s',
  'Kolo k 100km+': 'Kolo 100km+',
  'Japonská imerze (One Piece v autobusu, podcasty, pasivní poslech)': 'Japonská imerze',
  'Deník hlasový': 'Hlasový deník',
}

// ─── GitHub fetch ─────────────────────────────────────────────────────────────

async function ghFetch(path: string, token: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(path)}?ref=${BRANCH}`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3.raw',
    },
    cache: 'no-store',
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status} for ${path}`)
  return res.text()
}

// ─── Markdown utilities ───────────────────────────────────────────────────────

/** Extract the block starting at a header (inclusive) up to the next same-or-higher-level header. */
function mdSection(content: string, hdr: string): string {
  const lines  = content.split('\n')
  const level  = (hdr.match(/^(#+)/)?.[1] ?? '#').length
  const start  = lines.findIndex(l => l.startsWith(hdr))
  if (start === -1) return ''
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/)
    if (m && m[1].length <= level) { end = i; break }
  }
  return lines.slice(start, end).join('\n')
}

/** Parse a markdown table to an array of row-objects. */
function mdTable(content: string): Array<Record<string, string>> {
  const lines = content.split('\n').filter(l => l.trim().startsWith('|'))
  if (lines.length < 3) return []
  const headers = lines[0].split('|').slice(1, -1).map(h => h.trim())
  const rows: Array<Record<string, string>> = []
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i].split('|').slice(1, -1).map(c => c.trim())
    const row: Record<string, string> = {}
    headers.forEach((h, j) => { row[h] = cells[j] ?? '' })
    // Skip empty / separator rows
    if (Object.values(row).some(v => v && v !== '—' && !/^[-\s*]+$/.test(v))) {
      rows.push(row)
    }
  }
  return rows
}

/** H3 section names within a block, excluding noise headings. */
function h3Names(content: string): string[] {
  const skip = ['anti-cíl', 'citát', 'calculator', 'propojení', 'průměrný týden', 'měřitelnost']
  return content.split('\n')
    .filter(l => l.startsWith('### '))
    .map(l => l.replace(/^### /, '').trim())
    .filter(n => !skip.some(s => n.toLowerCase().includes(s)))
}

/** Parse "30.6." / "30.6.2026" / "2026-06-30" → ISO date or null. */
function parseDate(s: string): string | null {
  const str = s.trim()
  if (!str || str === '—') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  const m = str.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})?/)
  if (!m) return null
  const y = m[3] ?? '2026'
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function stripBold(s: string): string {
  return s.replace(/\*\*/g, '').trim()
}

/** Extract leading integer from streak strings like "45 dní s 5 skipped", "48 dní", "nový" → null */
function parseStreak(s: string): number | null {
  if (!s || s.toLowerCase().includes('nový')) return null
  const m = s.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

function normalizeHabitName(raw: string): string {
  return HABIT_NAME_MAP[raw] ?? raw
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

type HabitRow = {
  profile_id: string
  name: string
  category: 'active' | 'trial' | 'graduated'
  frequency: string | null
  mandatory: boolean
  end_date: string | null
  trial_end: string | null
  vault_serves: string[]
}

function parseHabits(md: string, profileId: string): { rows: HabitRow[]; streaks: Map<string, number> } {
  const rows: HabitRow[] = []
  const streaks = new Map<string, number>()

  function fromTable(sectionMd: string, cat: HabitRow['category'], parseStreakCol = false) {
    for (const row of mdTable(sectionMd)) {
      const raw = stripBold(row['Habit'] ?? '')
      if (!raw || raw.startsWith('_') || raw === '—') continue
      const name = normalizeHabitName(raw)
      const serves = row['Slouží dimenzi'] ?? row['Slouží'] ?? ''
      rows.push({
        profile_id: profileId,
        name,
        category: cat,
        frequency: row['Frekvence'] ?? null,
        mandatory: name.toLowerCase().includes('autoškola'),
        end_date:  parseDate(row['End-date'] ?? row['end-date'] ?? ''),
        trial_end: parseDate(row['Trial-end'] ?? ''),
        vault_serves: serves ? [serves] : [],
      })
      if (parseStreakCol) {
        const s = parseStreak(row['Aktuální streak'] ?? '')
        if (s !== null) streaks.set(name, s)
      }
    }
  }

  fromTable(mdSection(md, '## Aktivní (Active)'), 'active', true)
  fromTable(mdSection(md, '### Solo trials'), 'trial')

  // Balíček Imunita — has "Kód" column instead of "Habit" as first col
  for (const row of mdTable(mdSection(md, '### Balíček Imunita'))) {
    const raw = stripBold(row['Habit'] ?? '')
    if (!raw || raw.startsWith('_')) continue
    const name = normalizeHabitName(raw)
    rows.push({
      profile_id: profileId, name, category: 'trial',
      frequency: row['Frekvence'] ?? null, mandatory: false,
      end_date: '2026-06-30', trial_end: '2026-06-30',
      vault_serves: [row['Slouží'] ?? 'imunita'],
    })
  }

  // Balíček Fyzička
  for (const row of mdTable(mdSection(md, '### Balíček Fyzička'))) {
    const raw = stripBold(row['Habit'] ?? '')
    if (!raw || raw.startsWith('_')) continue
    const name = normalizeHabitName(raw)
    rows.push({
      profile_id: profileId, name, category: 'trial',
      frequency: row['Frekvence'] ?? null, mandatory: false,
      end_date: null, trial_end: null,
      vault_serves: [row['Slouží'] ?? 'fyzička'],
    })
  }

  fromTable(mdSection(md, '## Zautomatizované (Graduated)'), 'graduated')

  return { rows, streaks }
}

/** Dimensions from H3 headers (life dream section or 5-year section). */
function dimsFromH3(sectionMd: string): string[] {
  return h3Names(sectionMd)
}

/** Dimensions from table column "Dimenze". */
function dimsFromTable(sectionMd: string, col: string): string[] {
  return mdTable(sectionMd)
    .map(r => r[col] ?? '')
    .filter(n => n && n !== '—' && !/^\d+$/.test(n))
}

/** Numbered bullet items from a section. */
function numberedItems(sectionMd: string): string[] {
  return sectionMd.split('\n')
    .filter(l => /^\d+\./.test(l.trim()))
    .map(l => stripBold(l.replace(/^\d+\.\s*/, '').split(' — ')[0]))
    .filter(Boolean)
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupaClient = ReturnType<typeof createServerClient<any>>

async function upsertLayer(
  db: SupaClient,
  profileId: string,
  params: { tree: string; layer: number; title: string; description: string; deadline: string | null; sourceFile: string },
  errors: string[]
): Promise<string | null> {
  const { error } = await db.from('cascade_layers').upsert({
    profile_id:    profileId,
    tree:          params.tree,
    layer:         params.layer,
    title:         params.title,
    description:   params.description,
    deadline:      params.deadline,
    source_file:   params.sourceFile,
    last_synced_at: new Date().toISOString(),
  }, { onConflict: 'profile_id,tree,layer' })

  if (error) {
    errors.push(`cascade L${params.layer} (${params.tree}): ${error.message}`)
    return null
  }

  const { data } = await db.from('cascade_layers')
    .select('id')
    .eq('profile_id', profileId)
    .eq('tree', params.tree)
    .eq('layer', params.layer)
    .maybeSingle()

  return data?.id ?? null
}

async function insertNewDimensions(db: SupaClient, layerId: string, names: string[]): Promise<void> {
  if (!names.length) return
  const { data: existing } = await db
    .from('cascade_dimensions').select('name').eq('layer_id', layerId)
  const have = new Set((existing ?? []).map((r: { name: string }) => r.name))
  const fresh = names.filter(n => n && !have.has(n))
  if (fresh.length) {
    await db.from('cascade_dimensions').insert(
      fresh.map(name => ({ layer_id: layerId, name, progress_pct: 0 }))
    )
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST() {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'GITHUB_TOKEN not set' }, { status: 500 })
  }

  // Dynamic file paths — computed at request time so sync always reads the current week/month
  const FILES = {
    ...STATIC_PATHS,
    weekly:  `wiki/reviews/weekly/${isoWeekStr()}.md`,
    monthly: `wiki/reviews/monthly/${yearMonthStr()}.md`,
  }

  const cookieStore = await cookies()
  const db = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db
    .from('profiles').select('id').eq('auth_user_id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const pid     = profile.id as string
  const synced: string[] = []
  const errors: string[] = []

  // ── Fetch files ───────────────────────────────────────────────────────────

  const raw: Record<string, string | null> = {}
  for (const [key, path] of Object.entries(FILES)) {
    try {
      raw[key] = await ghFetch(path, token)
      if (raw[key] !== null) synced.push(path)
      else if (key !== 'monthly') errors.push(`Not found: ${path}`)
    } catch (e) {
      errors.push(`Fetch ${path}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── Sync habits ───────────────────────────────────────────────────────────

  if (raw.habits) {
    try {
      const { rows: habits, streaks: habitStreaks } = parseHabits(raw.habits, pid)

      for (const h of habits) {
        const { error } = await db.from('habits')
          .upsert(h, { onConflict: 'profile_id,name' })
        if (error) errors.push(`habits "${h.name}": ${error.message}`)
      }

      // Upsert streak numbers from vault into streaks_cache
      if (habitStreaks.size > 0) {
        const names = [...habitStreaks.keys()]
        const { data: dbHabits } = await db.from('habits')
          .select('id, name').eq('profile_id', pid).in('name', names)

        if (dbHabits) {
          const nameToId: Record<string, string> = {}
          for (const h of dbHabits) nameToId[h.name] = h.id

          const today = new Date().toISOString().slice(0, 10)
          for (const [name, streak] of habitStreaks) {
            const habitId = nameToId[name]
            if (!habitId) continue
            // Preserve historical best: read existing before overwriting
            const { data: existing } = await db.from('streaks_cache')
              .select('best_streak').eq('habit_id', habitId).maybeSingle()
            const bestStreak = Math.max(streak, existing?.best_streak ?? 0)
            const { error } = await db.from('streaks_cache').upsert({
              habit_id:            habitId,
              current_streak:      streak,
              best_streak:         bestStreak,
              last_completed_date: today,
              updated_at:          new Date().toISOString(),
            }, { onConflict: 'habit_id' })
            if (error) errors.push(`streaks_cache "${name}": ${error.message}`)
          }
        }
      }
    } catch (e) {
      errors.push(`Parse habits.md: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── Sync cascade ──────────────────────────────────────────────────────────

  if (raw.sen) {
    try {
      const sen = raw.sen

      // Layer 1 — Životní sen — chips from H3 headers
      const l1sec  = mdSection(sen, '## Životní sen (statický')
      const l1dims = dimsFromH3(l1sec)
      const l1id   = await upsertLayer(db, pid, {
        tree: 'sen', layer: 1, title: 'Životní sen', description: 'Věk 28+',
        deadline: null, sourceFile: FILES.sen,
      }, errors)
      if (l1id) await insertNewDimensions(db, l1id, l1dims)

      // Layer 2 — 5 let — H3 under "## 5letý cíl"
      const l2sec   = mdSection(sen, '## 5letý cíl')
      const l2dims  = dimsFromH3(l2sec).map(n => n.replace(/ ke 21$/, '').trim())
      // Add income dimension from prijem.md
      if (raw.prijem) {
        const pSec5 = mdSection(raw.prijem, '## 5letý cíl')
        const match = pSec5.match(/\*\*(\d+k[^\*]*)\*\*/)
        l2dims.push(match ? `Příjem · B1+B2 · ${match[1]}` : 'Příjem · B1+B2 stabilní')
      }
      const l2id = await upsertLayer(db, pid, {
        tree: 'sen', layer: 2, title: '5 let', description: 'Věk 21 · 2031',
        deadline: '2031-01-01', sourceFile: FILES.sen,
      }, errors)
      if (l2id) await insertNewDimensions(db, l2id, l2dims)

      // Layer 3 — Rok — table in "## Roční cíl"
      const l3sec  = mdSection(sen, '## Roční cíl')
      const l3dims = dimsFromTable(l3sec, 'Dimenze')
      // Add income milestone from prijem.md
      if (raw.prijem) {
        const pSec3 = mdSection(raw.prijem, '## Roční cíl')
        const pRows = mdTable(pSec3)
        const firstMilestone = pRows.find(r => r['Milník k 1.9.2027'])?.['Milník k 1.9.2027']
        if (firstMilestone) l3dims.push(stripBold(firstMilestone))
      }
      const l3id = await upsertLayer(db, pid, {
        tree: 'sen', layer: 3, title: 'Rok', description: '1. 9. 2027',
        deadline: '2027-09-01', sourceFile: FILES.sen,
      }, errors)
      if (l3id) await insertNewDimensions(db, l3id, l3dims)

      // Layer 4 — Měsíc — from monthly review (skip if not fetched)
      if (raw.monthly) {
        const monthlySec = mdSection(raw.monthly, '### SEN — ')
        const l4dims = numberedItems(monthlySec)
        const l4id = await upsertLayer(db, pid, {
          tree: 'sen', layer: 4, title: 'Měsíc', description: 'Červen 2026',
          deadline: '2026-06-30', sourceFile: FILES.monthly,
        }, errors)
        if (l4id) await insertNewDimensions(db, l4id, l4dims)
      }

      // Layer 5 — Týden — from weekly review
      if (raw.weekly) {
        const weeklyMd = raw.weekly
        // Find "## Priority na W??" section
        const prioLine = weeklyMd.split('\n').find(l => l.match(/^## Priority na W/)) ?? ''
        const prioSec  = prioLine ? mdSection(weeklyMd, prioLine) : ''
        const weekNum  = prioLine.match(/W(\d+)/)?.[1] ?? '23'
        const l5dims   = numberedItems(prioSec)
        const l5id = await upsertLayer(db, pid, {
          tree: 'sen', layer: 5, title: weekNum, description: 'Aktuální týden',
          deadline: '2026-06-08', sourceFile: FILES.weekly,
        }, errors)
        if (l5id) await insertNewDimensions(db, l5id, l5dims)
      }

    } catch (e) {
      errors.push(`Parse cascade: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({
    synced:    errors.length === 0,
    files:     synced,
    errors,
    timestamp: new Date().toISOString(),
  })
}
