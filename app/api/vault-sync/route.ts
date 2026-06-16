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
  memory: 'Memory.md',
} as const

/** ISO 8601 week string for a given date, e.g. "2026-W23" */
function isoWeekStrFromDate(input: Date): string {
  const d = new Date(input)
  const dow = d.getDay() || 7           // Sun→7, Mon→1 … Sat→6
  d.setDate(d.getDate() + 4 - dow)     // advance to Thursday of current week
  const y = d.getFullYear()
  const yearStart = new Date(y, 0, 1)
  const wn = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${y}-W${String(wn).padStart(2, '0')}`
}

/** ISO 8601 week string for today, e.g. "2026-W24" */
function isoWeekStr(): string {
  return isoWeekStrFromDate(new Date())
}

/** List of weekly file paths to try, most-recent first (next week → today → up to N weeks back).
 *  Next week (+7d) is tried first so a Sunday-written W## plan is picked up before the old week. */
function weeklyPathCandidates(weeksBack = 6): string[] {
  const out: string[] = []
  const today = new Date()
  // Try next ISO week first — covers Sunday-evening planning (author writes W+1 before week ends)
  const nextWeek = new Date(today)
  nextWeek.setDate(today.getDate() + 7)
  out.push(`wiki/reviews/weekly/${isoWeekStrFromDate(nextWeek)}.md`)
  // Current week and backwards
  for (let i = 0; i <= weeksBack; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i * 7)
    out.push(`wiki/reviews/weekly/${isoWeekStrFromDate(d)}.md`)
  }
  return out
}

/** Current year-month string, e.g. "2026-06" */
function yearMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const CZ_MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen',
  'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']

/** Human month label, e.g. "Červen 2026" */
function monthLabel(): string {
  const d = new Date()
  const m = CZ_MONTHS[d.getMonth()]
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${d.getFullYear()}`
}

/** ISO date for the last day of the current month */
function endOfMonthISO(): string {
  const d = new Date()
  const e = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`
}

/** ISO date for Sunday (end) of the current ISO week */
function endOfWeekISO(): string {
  const d = new Date()
  const dow = d.getDay() || 7
  d.setDate(d.getDate() + (7 - dow))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** First header line present from a priority list of prefixes, '' if none */
function findHeaderLine(md: string, prefixes: string[]): string {
  for (const p of prefixes) {
    const line = md.split('\n').find(l => l.startsWith(p))
    if (line) return line
  }
  return ''
}

/** Week label from the weekly file, e.g. "W23 · 1.–7.6.2026" (fallback "Týden") */
function weekLabelFromFile(md: string): string {
  const wk    = md.match(/^week:\s*\d{4}-(W\d+)/m)?.[1]
  const range = md.match(/—\s*W\d+\s*\(([^)]+)\)/)?.[1]
  if (wk && range) return `${wk} · ${range}`
  return wk ?? 'Týden'
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
  // Decode bytes explicitly as UTF-8. res.text() under Next.js on Windows falls
  // back to the system codepage (CP1250) and mangles Czech diacritics
  // ("Životní sen" → "ŽivotnĂ­ sen") straight into the DB.
  const buf = await res.arrayBuffer()
  return new TextDecoder('utf-8').decode(buf)
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

function stripBold(s: string): string {
  return s.replace(/\*\*/g, '').trim()
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

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

// ─── Weekly priorities (sub-sections under "## Priority W##") ────────────────

type PriorityKind = 'main' | 'side' | 'bonus'
type PriorityItem = { name: string; detail: string; kind: PriorityKind }

/** Parse "**Name** — detail" or fallback "Name — detail" (with leading "- " / "1. " stripped). */
function parsePriorityItem(line: string): { name: string; detail: string } | null {
  const s = line.trim().replace(/^(?:\d+\.|[-•*])\s*/, '')
  if (!s) return null

  // Preferred shape: **Name** — detail (W24+)
  const bold = s.match(/^\*\*([^*]+)\*\*\s*(?:[—–-]\s*)?(.*)$/)
  if (bold) {
    let name   = bold[1].trim()
    let detail = (bold[2] ?? '').trim()
    // W23 quirk: whole phrase was bolded, e.g. **Autoškola — 350 otázek** (tail)
    if (!detail && / — /.test(name)) {
      const [first, ...rest] = name.split(' — ')
      name   = first.trim()
      detail = rest.join(' — ').trim()
    }
    return { name, detail }
  }

  // Plain shape: Name — detail
  const [first, ...rest] = s.split(' — ')
  return { name: stripBold(first).trim(), detail: rest.join(' — ').trim() }
}

/** Slice a block from "### Heading" up to the next H3+ heading (or end). */
function h3Block(content: string, headingPrefix: string): string {
  const lines = content.split('\n')
  const start = lines.findIndex(l => l.startsWith(headingPrefix))
  if (start === -1) return ''
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^(#{1,3})\s/.test(lines[i])) { end = i; break }
  }
  return lines.slice(start + 1, end).join('\n')
}

// ─── Memory.md sections (hikari_memory bootstrap) ────────────────────────────

type MemorySection = { name: string; content: string }

/**
 * Split Memory.md into H2 sections. Returns one entry per `## Heading` with the
 * body trimmed of horizontal rules (`---`) and empty lines.
 * Skips the H1 "# Memory.md — Matyáš" preamble (it's a doc title, not content).
 */
function parseMemorySections(md: string): MemorySection[] {
  const lines = md.split('\n')
  const sections: MemorySection[] = []

  const h2Indices: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (/^## /.test(lines[i])) h2Indices.push(i)
  }
  h2Indices.push(lines.length) // sentinel

  for (let k = 0; k < h2Indices.length - 1; k++) {
    const headIdx = h2Indices[k]
    const endIdx  = h2Indices[k + 1]
    const name    = lines[headIdx].replace(/^##\s+/, '').trim()
    if (!name) continue
    const body = lines.slice(headIdx + 1, endIdx)
      .filter(l => l.trim() !== '---')
      .join('\n')
      .trim()
    if (!body) continue
    sections.push({ name, content: body })
  }
  return sections
}

/** Collect all item lines (numbered + bullet) inside a block. */
function itemLines(block: string): string[] {
  return block.split('\n').filter(l => /^\s*(?:\d+\.|[-•*])\s+/.test(l))
}

/**
 * Parse weekly priorities from the weekly review file.
 * Recognised shapes (in order):
 *   1. "## Priority W##"  → "### Hlavní" + "### Vedlejší" + "### Bonus"  (W24+)
 *   2. "### 3 hlavní priority"  → flat numbered list, all main          (W23)
 *   3. "## Priority na W##" or "## 3 priority"  → flat list, all main   (legacy)
 */
function parseWeeklyPriorities(md: string): PriorityItem[] {
  // ── New format: ## Priority W## with sub-sections ─────────────────────────
  const prioHeader = md.split('\n').find(l => /^## Priority\b/.test(l))
  if (prioHeader) {
    const prioSec = mdSection(md, prioHeader)
    const result: PriorityItem[] = []
    const groups: Array<{ prefix: string; kind: PriorityKind }> = [
      { prefix: '### Hlavní',   kind: 'main'  },
      { prefix: '### Vedlejší', kind: 'side'  },
      { prefix: '### Bonus',    kind: 'bonus' },
    ]
    let hasAnyGroup = false
    for (const g of groups) {
      const block = h3Block(prioSec, g.prefix)
      if (!block) continue
      hasAnyGroup = true
      for (const line of itemLines(block)) {
        const item = parsePriorityItem(line)
        if (item?.name) result.push({ ...item, kind: g.kind })
      }
    }
    if (hasAnyGroup) return result
    // Header present but no Hlavní/Vedlejší/Bonus — treat whole section as main.
    return itemLines(prioSec)
      .map(parsePriorityItem)
      .filter((i): i is { name: string; detail: string } => !!i?.name)
      .map(i => ({ ...i, kind: 'main' as const }))
  }

  // ── Legacy: ### 3 hlavní priority / ## 3 priority ─────────────────────────
  const legacy = findHeaderLine(md, ['### 3 hlavní priority', '## 3 priority'])
  if (legacy) {
    return itemLines(mdSection(md, legacy))
      .map(parsePriorityItem)
      .filter((i): i is { name: string; detail: string } => !!i?.name)
      .map(i => ({ ...i, kind: 'main' as const }))
  }

  return []
}

// ─── Daily priorities (mentor-feedback "### Priority na zítřek") ──────────────

type DailyTask = { title: string; detail: string }

/** ISO date N days before today, e.g. yesterday = isoDaysAgo(1). */
function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Collect items under a "**Hlavní**" / "**Vedlejší**" / "**Bonus**" bold marker,
 * stopping at the next such marker. Items are bullet or numbered lines parsed via
 * parsePriorityItem ("**Name** — detail" or plain "Name — detail").
 */
function dailyGroup(prioSec: string, marker: string): DailyTask[] {
  const lines = prioSec.split('\n')
  const start = lines.findIndex(l => l.trim().startsWith(marker))
  if (start === -1) return []
  const items: DailyTask[] = []
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\*\*(Hlavní|Vedlejší|Bonus)/.test(lines[i])) break  // next group
    if (/^\s*(?:\d+\.|[-•*])\s+/.test(lines[i])) {
      const it = parsePriorityItem(lines[i])
      if (it?.name) items.push({ title: it.name, detail: stripBold(it.detail) })
    }
  }
  return items
}

/**
 * Parse the daily priorities section from a mentor-feedback file.
 * Heading wording varies (na zítra / zítřek / dnes / víkend …) so we match any
 * "### Priority" line, then split by the three bold group markers.
 */
function parseDailyPriorities(md: string): { hlavni: DailyTask[]; vedlejsi: DailyTask[]; bonus: DailyTask[] } | null {
  const prioLine = md.split('\n').find(l => l.startsWith('### Priority'))
  if (!prioLine) return null
  const sec = mdSection(md, prioLine)
  return {
    hlavni:   dailyGroup(sec, '**Hlavní'),
    vedlejsi: dailyGroup(sec, '**Vedlejší'),
    bonus:    dailyGroup(sec, '**Bonus'),
  }
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

/**
 * Replace all vault-sourced Memory.md entries in hikari_memory with fresh ones.
 * Manual / auto entries (different `source`) are preserved. Each H2 section in
 * Memory.md becomes one row with type='context', status='active' — Matyáš wrote
 * the file by hand, so it's authoritative.
 */
async function syncMemoryBootstrap(
  db: SupaClient,
  profileId: string,
  sections: MemorySection[],
  errors: string[]
): Promise<void> {
  const SOURCE = 'vault:Memory.md'

  const { error: delErr } = await db.from('hikari_memory')
    .delete().eq('profile_id', profileId).eq('source', SOURCE)
  if (delErr) {
    errors.push(`hikari_memory delete ${SOURCE}: ${delErr.message}`)
    return
  }
  if (!sections.length) return

  const rows = sections.map(s => ({
    profile_id: profileId,
    type:       'context',
    content:    s.content,
    source:     SOURCE,
    source_ref: s.name,
    status:     'active',
    confidence: 1.0,
    approved_at: new Date().toISOString(),
  }))

  const { error } = await db.from('hikari_memory').insert(rows)
  if (error) errors.push(`hikari_memory insert ${SOURCE}: ${error.message}`)
}

/**
 * Replace ALL dimensions for a layer with the given priorities (full refresh).
 * Used for weekly layer 5 — without this, dims from previous weeks accumulate.
 * Falls back to a plain insert without kind/detail/sort_order if migration 004
 * hasn't been applied yet, so a forgotten migration degrades gracefully.
 */
async function replaceWeeklyDimensions(
  db: SupaClient,
  layerId: string,
  items: PriorityItem[],
  errors: string[]
): Promise<void> {
  const { error: delErr } = await db.from('cascade_dimensions').delete().eq('layer_id', layerId)
  if (delErr) {
    errors.push(`cascade_dimensions delete L5: ${delErr.message}`)
    return
  }
  if (!items.length) return

  const full = items.map((p, i) => ({
    layer_id:     layerId,
    name:         p.name,
    detail:       p.detail || null,
    kind:         p.kind,
    sort_order:   i,
    progress_pct: 0,
  }))

  let { error } = await db.from('cascade_dimensions').insert(full)
  if (error) {
    // Migration 004 not applied → retry without new columns
    const basic = items.map(p => ({ layer_id: layerId, name: p.name, progress_pct: 0 }))
    ;({ error } = await db.from('cascade_dimensions').insert(basic))
  }
  if (error) errors.push(`cascade_dimensions insert L5: ${error.message}`)
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST() {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'GITHUB_TOKEN not set' }, { status: 500 })
  }

  // Dynamic file paths — computed at request time so sync always reads the current week/month.
  // `weekly` is resolved later with rollover: if the current week's plan file
  // doesn't exist yet (typical mid-week before Sunday review), we fall back to
  // the most recent existing weekly file. This keeps the dashboard usable instead
  // of erroring out with "Not found".
  const FILES = {
    ...STATIC_PATHS,
    weekly:  '',                                                  // resolved below
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
    if (key === 'weekly') continue   // handled below with rollover
    try {
      raw[key] = await ghFetch(path, token)
      if (raw[key] !== null) synced.push(path)
      else if (key !== 'monthly') errors.push(`Not found: ${path}`)
    } catch (e) {
      errors.push(`Fetch ${path}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Weekly with graceful rollover — try today's week, then 1 week back, …, up to 6.
  // Without this, an empty current-week file forced the sync to error out and the
  // dashboard kept stale W## priorities forever (no auto-fallback to W##-1).
  {
    const candidates = weeklyPathCandidates(6)
    const triedNotFound: string[] = []
    for (const path of candidates) {
      try {
        const md = await ghFetch(path, token)
        if (md !== null) {
          raw.weekly = md
          FILES.weekly = path           // remember which one actually loaded — drives L5 source_file
          synced.push(path)
          if (triedNotFound.length) {
            // Soft note: tell caller we rolled over (UI shows in error list with prefix "ℹ️")
            errors.push(`ℹ️ Rollover: použit ${path} (chybí novější: ${triedNotFound.join(', ')})`)
          }
          break
        }
        triedNotFound.push(path)
      } catch (e) {
        errors.push(`Fetch ${path}: ${e instanceof Error ? e.message : String(e)}`)
        break                            // network error → stop trying
      }
    }
    if (!raw.weekly) {
      errors.push(`Not found: weekly plan (zkoušeno ${candidates.length} týdnů zpět)`)
    }
  }

  // Habits are NOT synced from the vault anymore — the app is the source of truth
  // (add/edit/remove in /habits writes straight to Supabase). habits.md stays in
  // the vault as a hand-written archive but the dashboard no longer reads it, and
  // streaks_cache is left untouched here (the morning cron recomputes from logs).

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
          tree: 'sen', layer: 4, title: 'Měsíc', description: monthLabel(),
          deadline: endOfMonthISO(), sourceFile: FILES.monthly,
        }, errors)
        if (l4id) await insertNewDimensions(db, l4id, l4dims)
      }

      // Layer 5 — Týden — priorities (Hlavní + Vedlejší + Bonus) from weekly file.
      // Full refresh: previous week's dimensions are deleted, current week's
      // inserted. Without this, every sync grew the list (W23 + W24 + …).
      if (raw.weekly) {
        const weeklyMd = raw.weekly
        const l5items  = parseWeeklyPriorities(weeklyMd)
        const l5id = await upsertLayer(db, pid, {
          tree: 'sen', layer: 5, title: 'Týden', description: weekLabelFromFile(weeklyMd),
          deadline: endOfWeekISO(), sourceFile: FILES.weekly,
        }, errors)
        if (l5id) await replaceWeeklyDimensions(db, l5id, l5items, errors)
      }

    } catch (e) {
      errors.push(`Parse cascade: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── Sync Hikari memory bootstrap (Memory.md) ──────────────────────────────

  if (raw.memory) {
    try {
      const sections = parseMemorySections(raw.memory)
      await syncMemoryBootstrap(db, pid, sections, errors)
    } catch (e) {
      errors.push(`Parse Memory.md: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── Sync today's daily priorities (from yesterday's mentor-feedback) ───────
  // A feedback file dated D holds "### Priority na zítřek" = the plan for D+1.
  // So today's tasks live in yesterday's file. Written/edited by Matyáš (Gemini
  // does NOT generate these) → stored in ai_daily_brief.{hlavni,vedlejsi,bonus}
  // for today; the morning cron only fills cascade_nudge + reasoning.
  {
    const todayISO = isoDaysAgo(0)
    const fbPath   = `logs/mentor-feedback/${isoDaysAgo(1)}-feedback.md`
    try {
      const fb = await ghFetch(fbPath, token)
      if (!fb) {
        errors.push(`ℹ️ Denní priority: chybí ${fbPath} (dnešní úkoly nenačteny)`)
      } else {
        synced.push(fbPath)
        const parsed = parseDailyPriorities(fb)
        if (!parsed) {
          errors.push(`ℹ️ Denní priority: '### Priority' sekce chybí v ${fbPath}`)
        } else if (!parsed.hlavni.length && !parsed.vedlejsi.length && !parsed.bonus.length) {
          errors.push(`ℹ️ Denní priority: sekce nalezena ale prázdná v ${fbPath}`)
        } else {
          const { error } = await db.from('ai_daily_brief').upsert({
            profile_id: pid,
            date:       todayISO,
            hlavni:     parsed.hlavni,
            vedlejsi:   parsed.vedlejsi,
            bonus:      parsed.bonus,
          }, { onConflict: 'profile_id,date' })
          if (error) errors.push(`daily priorities upsert: ${error.message}`)
        }
      }
    } catch (e) {
      errors.push(`Fetch ${fbPath}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // "ℹ️" lines are informational (rollover used, daily plan missing) — not failures.
  // Only real errors flip `synced` to false, so an info note doesn't show as ⚠.
  const realErrors = errors.filter(e => !e.startsWith('ℹ️'))

  return NextResponse.json({
    synced:    realErrors.length === 0,
    files:     synced,
    errors,
    timestamp: new Date().toISOString(),
  })
}
