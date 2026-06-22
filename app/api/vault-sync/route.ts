import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// ─── Config ───────────────────────────────────────────────────────────────────

const REPO   = 'matuk42/2nd-brain'
const BRANCH = 'master'

const STATIC_PATHS = {
  sen:    'wiki/cile/cascade/sen.md',
  prijem: 'wiki/cile/cascade/prijem.md',
  memory: 'Memory.md',
} as const

// Yearly cascade (layer 3) target year. The academic-year goal date is 1.9.2027;
// the year-level milestones moved out of sen.md/prijem.md into their own review
// file on 2026-06-21 (wiki/reviews/yearly/<year>.md). Bump when the target rolls.
const YEARLY_TARGET_YEAR = '2027'

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

/** Tidy a milestone detail for display: drop wikilinks, bold, parenthetical notes,
 *  collapse whitespace, strip trailing punctuation. "" if nothing meaningful left. */
function cleanDetail(s: string): string {
  return s
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')  // [[a|b]] / [[a]] → a
    .replace(/\*\*/g, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')                   // drop (parenthetical) notes
    .replace(/\s+/g, ' ')
    .replace(/[\s:–—-]+$/, '')                          // trailing punctuation
    .trim()
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

/** Dimensions from H3 headers (life dream section or 5-year section). */
function dimsFromH3(sectionMd: string): string[] {
  return h3Names(sectionMd)
}

/** A cascade milestone: a name + optional detail (for the clean vault list). */
type DimItem = { name: string; detail: string }

/**
 * Monthly SEN milestones (layer 4) → {name, detail}. Reads the numbered "### SEN —"
 * list, splitting "**Name** — detail" via parsePriorityItem (same shape as weekly).
 */
function parseMonthlyMilestones(sectionMd: string): DimItem[] {
  return sectionMd.split('\n')
    .filter(l => /^\s*\d+\.\s/.test(l))
    .map(parsePriorityItem)
    .filter((i): i is { name: string; detail: string } => !!i?.name)
    .map(i => ({ name: i.name, detail: cleanDetail(i.detail) }))
}

/**
 * Yearly dimensions+milestones (layer 3) → {name, detail} from the
 * "### Dimenze a milníky" table (columns "Dimenze" + "Milník k 1.9.2027").
 */
function parseYearlyDimensions(sectionMd: string): DimItem[] {
  return mdTable(sectionMd)
    .map(r => {
      const name = stripBold(r['Dimenze'] ?? '')
      const milestone = Object.entries(r).find(([k]) => /Mil[ní]/i.test(k))?.[1] ?? ''
      return { name, detail: cleanDetail(milestone) }
    })
    .filter(d => d.name && d.name !== '—' && !/^\d+$/.test(d.name))
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
 * Heading wording varies (na zítra / zítřek / dnes / víkend …) AND heading level
 * varies (## vs ### — newer files use H2), so match a "Priority" heading at any
 * level H2–H4, then split by the three bold group markers.
 */
function parseDailyPriorities(md: string): { hlavni: DailyTask[]; vedlejsi: DailyTask[]; bonus: DailyTask[] } | null {
  const prioLine = md.split('\n').find(l => /^#{2,4}\s+Priority/i.test(l))
  if (!prioLine) return null
  const sec = mdSection(md, prioLine)
  return {
    hlavni:   dailyGroup(sec, '**Hlavní'),
    vedlejsi: dailyGroup(sec, '**Vedlejší'),
    bonus:    dailyGroup(sec, '**Bonus'),
  }
}

// ─── Speaking feedback (mentor-feedback "Řečnický feedback") ──────────────────
// Surfaced on the home "Hikari dnes" card as a third block: which filler words to
// avoid today (+ how often) and the in-the-moment principles to apply while
// speaking. Source = the SAME yesterday's feedback file the daily tasks come from.
// Two sub-sections are read: "Filler words" (table OR prose — format varies day to
// day) and "3 body ke zlepšení" (always a numbered list of principles).

type SpeakingFiller = { word: string; count: string | null; trend: string | null }
type Speaking = { fillers: SpeakingFiller[]; principles: string[] }

/** Strip backticks/bold and surrounding noise from a filler token. */
function cleanFillerWord(s: string): string {
  return s.replace(/[`*]/g, '').trim()
}

/** Keep a compact "~55×" form; "" if no usable number. */
function normCount(s: string): string | null {
  const m = s.match(/~?\s*(\d+)\s*[×x]/)
  return m ? `~${m[1]}×` : null
}

/** A short trend hint: 🆕 (new) / ↑ (rising) / ↓ (falling) from free text. */
function trendHint(s: string): string | null {
  const t = s.toLowerCase()
  if (/🆕|nový|novy|nov[áé]|watchlist/.test(t)) return '🆕'
  if (/roste|nárůst|narust|⚠/.test(t))          return '↑'
  if (/pokles|klesá|klesa|✅/.test(t))           return '↓'
  return null
}

/** A filler is noise if it's the tracked swear-word counter (separate metric) or
 *  has a zero count — neither is a "say it less" filler to surface. */
function isUsableFiller(word: string, count: string | null): boolean {
  if (!word) return false
  if (/do p\*+/i.test(word)) return false      // tracked swear, counted separately
  if (count === '~0×') return false
  return true
}

/** Parse the "Filler words" sub-section — works for both a markdown table and
 *  free prose. Returns the dominant fillers (most-said first, capped at 3). */
function parseFillers(sec: string): SpeakingFiller[] {
  const out: SpeakingFiller[] = []

  // ── Table form (e.g. | Filler | Počet | Trend | ) ──────────────────────────
  const rows = mdTable(sec)
  if (rows.length) {
    const findKey = (r: Record<string, string>, re: RegExp) => Object.keys(r).find(k => re.test(k))
    for (const r of rows) {
      const wk = findKey(r, /filler/i)
      const ck = findKey(r, /počet|pocet|odhad/i)
      const tk = findKey(r, /trend/i)
      const word  = cleanFillerWord(wk ? r[wk] : '')
      const count = normCount(ck ? r[ck] : '')
      if (!isUsableFiller(word, count)) continue
      out.push({ word, count, trend: tk ? trendHint(r[tk]) : null })
    }
  }

  // ── Prose form: `token` (~N×, …) anywhere in the section ───────────────────
  if (!out.length) {
    const re = /`([^`\n]+)`(?:\*\*)?[^`\n]{0,8}?\(?\s*~?\s*(\d+)\s*[×x]([^`\n)]*)/gu
    let m: RegExpExecArray | null
    while ((m = re.exec(sec))) {
      const word  = cleanFillerWord(m[1])
      const count = `~${m[2]}×`
      if (!isUsableFiller(word, count)) continue
      out.push({ word, count, trend: trendHint(m[3] ?? '') })
    }
  }

  // ── Last resort: quoted tokens with no counts at all ───────────────────────
  if (!out.length) {
    const re = /`([^`\n]+)`/gu
    let m: RegExpExecArray | null
    while ((m = re.exec(sec)) && out.length < 4) {
      const word = cleanFillerWord(m[1])
      if (!isUsableFiller(word, null)) continue
      out.push({ word, count: null, trend: null })
    }
  }

  // Dedup by word, prefer most-said (numeric count desc when known), cap 3.
  const seen = new Set<string>()
  const uniq = out.filter(f => (seen.has(f.word) ? false : (seen.add(f.word), true)))
  const num  = (c: string | null) => (c ? parseInt(c.replace(/\D/g, ''), 10) || 0 : -1)
  uniq.sort((a, b) => num(b.count) - num(a.count))
  return uniq.slice(0, 3)
}

/** Parse "3 body ke zlepšení" — numbered list of in-the-moment principles. */
function parsePrinciples(sec: string): string[] {
  return sec.split('\n')
    .filter(l => /^\s*\d+\.\s+/.test(l))
    .map(l => stripBold(l.replace(/^\s*\d+\.\s+/, '').replace(/`/g, '')).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3)
}

/**
 * Parse the speaking feedback from a mentor-feedback file. The heading wording is
 * stable ("Řečnický feedback") but its level varies (H1 in some files, H2 in
 * others) — and so do its sub-section levels — so match leniently. Returns null
 * when the section is absent or yields nothing usable.
 */
function parseSpeaking(md: string): Speaking | null {
  const hdr = md.split('\n').find(l => /^#{1,3}\s+Řečnick[ýy] feedback/i.test(l))
  if (!hdr) return null
  const sec = mdSection(md, hdr)

  const fillerHdr = sec.split('\n').find(l => /^#{2,4}\s+Filler/i.test(l))
  const fillers   = fillerHdr ? parseFillers(mdSection(sec, fillerHdr)) : []

  // Principles source: prefer "3 body ke zlepšení"; since 2026-06-20 some files
  // drop it and only carry "3 cvičení" (now phrased as in-the-moment principles,
  // not "record N sentences" tasks) — fall back to that so principles still show.
  const lines = sec.split('\n')
  const bodyHdr    = lines.find(l => /^#{2,4}\s+\d+\s+bod[ůy]?\s+ke\s+zlep/i.test(l))
                  ?? lines.find(l => /^#{2,4}\s+\d+\s+cvičen/i.test(l))
  const principles = bodyHdr ? parsePrinciples(mdSection(sec, bodyHdr)) : []

  if (!fillers.length && !principles.length) return null
  return { fillers, principles }
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
 * Replace ALL dimensions for a layer with the vault's current milestones (full
 * refresh). Used for layers that must always mirror the vault and roll over with
 * the period — week (L5), month (L4), year (L3). Without this the old insert-only
 * path let stale/previous-period milestones accumulate forever.
 * Falls back to a plain name-only insert if migration 004 (detail/kind/sort_order)
 * hasn't been applied, so a forgotten migration degrades gracefully.
 */
async function replaceDimensions(
  db: SupaClient,
  layerId: string,
  layer: number,
  items: Array<{ name: string; detail: string; kind?: PriorityKind | null }>,
  errors: string[]
): Promise<void> {
  const { error: delErr } = await db.from('cascade_dimensions').delete().eq('layer_id', layerId)
  if (delErr) {
    errors.push(`cascade_dimensions delete L${layer}: ${delErr.message}`)
    return
  }
  if (!items.length) return

  const full = items.map((p, i) => ({
    layer_id:     layerId,
    name:         p.name,
    detail:       p.detail || null,
    kind:         p.kind ?? null,
    sort_order:   i,
    progress_pct: 0,
  }))

  let { error } = await db.from('cascade_dimensions').insert(full)
  if (error) {
    // Migration 004 not applied → retry without new columns
    const basic = items.map(p => ({ layer_id: layerId, name: p.name, progress_pct: 0 }))
    ;({ error } = await db.from('cascade_dimensions').insert(basic))
  }
  if (error) errors.push(`cascade_dimensions insert L${layer}: ${error.message}`)
}

// ─── POST handler ─────────────────────────────────────────────────────────────

// Cookie-authenticated manual sync — the "Sync s vaultem" button on the home page.
// Resolves the logged-in user's profile, then delegates to runVaultSync.
export async function POST() {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'GITHUB_TOKEN not set' }, { status: 500 })
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

  const result = await runVaultSync(db, profile.id as string, token)
  return NextResponse.json(result)
}

/** Core vault → Supabase sync for one profile. Shared by the manual POST (cookie auth)
 *  and the Sunday-22:00 Vercel cron (service-role client). Auth-free: the caller resolves
 *  the Supabase client + profile id and supplies the GitHub token. */
export async function runVaultSync(
  db: SupaClient,
  pid: string,
  token: string,
): Promise<{ synced: boolean; files: string[]; errors: string[]; timestamp: string }> {
  // Dynamic file paths — computed at call time so sync always reads the current week/month.
  // `weekly` is resolved later with rollover: if the current week's plan file
  // doesn't exist yet (typical mid-week before Sunday review), we fall back to
  // the most recent existing weekly file. This keeps the dashboard usable instead
  // of erroring out with "Not found".
  const FILES = {
    ...STATIC_PATHS,
    weekly:  '',                                                  // resolved below
    monthly: `wiki/reviews/monthly/${yearMonthStr()}.md`,
    yearly:  `wiki/reviews/yearly/${YEARLY_TARGET_YEAR}.md`,      // L3 (Rok) source since 2026-06-21
  }

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

      // Layer 3 — Rok — table in "## Roční cíl" (full refresh, name + milník detail)
      const l3sec  = mdSection(sen, '## Roční cíl')
      const l3dims = parseYearlyDimensions(l3sec)
      // Add income milestone from prijem.md
      if (raw.prijem) {
        const pSec3 = mdSection(raw.prijem, '## Roční cíl')
        const pRows = mdTable(pSec3)
        const firstMilestone = pRows.find(r => r['Milník k 1.9.2027'])?.['Milník k 1.9.2027']
        if (firstMilestone) l3dims.push({ name: 'Příjem', detail: cleanDetail(firstMilestone) })
      }
      const l3id = await upsertLayer(db, pid, {
        tree: 'sen', layer: 3, title: 'Rok', description: '1. 9. 2027',
        deadline: '2027-09-01', sourceFile: FILES.sen,
      }, errors)
      if (l3id) await replaceDimensions(db, l3id, 3, l3dims, errors)

      // Layer 4 — Měsíc — from monthly review (full refresh, name + detail).
      // Rolls over automatically: FILES.monthly is the current month's file.
      if (raw.monthly) {
        const monthlySec = mdSection(raw.monthly, '### SEN — ')
        const l4dims = parseMonthlyMilestones(monthlySec)
        const l4id = await upsertLayer(db, pid, {
          tree: 'sen', layer: 4, title: 'Měsíc', description: monthLabel(),
          deadline: endOfMonthISO(), sourceFile: FILES.monthly,
        }, errors)
        if (l4id) await replaceDimensions(db, l4id, 4, l4dims, errors)
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
        if (l5id) await replaceDimensions(db, l5id, 5, l5items, errors)
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
        // Both daily tasks and speaking feedback come from the same file. Build one
        // upsert payload (disjoint columns) so each is written independently.
        const payload: Record<string, unknown> = { profile_id: pid, date: todayISO }

        const parsed = parseDailyPriorities(fb)
        if (!parsed) {
          errors.push(`ℹ️ Denní priority: '### Priority' sekce chybí v ${fbPath}`)
        } else if (!parsed.hlavni.length && !parsed.vedlejsi.length && !parsed.bonus.length) {
          errors.push(`ℹ️ Denní priority: sekce nalezena ale prázdná v ${fbPath}`)
        } else {
          payload.hlavni = parsed.hlavni
          payload.vedlejsi = parsed.vedlejsi
          payload.bonus = parsed.bonus
        }

        // Speaking feedback (migration 008: ai_daily_brief.speaking JSONB). Defensive:
        // if the column is missing the upsert below would fail, so only attach when
        // we actually parsed something and let the whole payload carry it.
        const speaking = parseSpeaking(fb)
        if (speaking) payload.speaking = speaking
        else errors.push(`ℹ️ Řečnický feedback: sekce chybí/prázdná v ${fbPath}`)

        if (payload.hlavni || payload.speaking) {
          const { error } = await db.from('ai_daily_brief').upsert(
            payload, { onConflict: 'profile_id,date' })
          if (error) errors.push(`daily brief upsert: ${error.message}`)
        }
      }
    } catch (e) {
      errors.push(`Fetch ${fbPath}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // "ℹ️" lines are informational (rollover used, daily plan missing) — not failures.
  // Only real errors flip `synced` to false, so an info note doesn't show as ⚠.
  const realErrors = errors.filter(e => !e.startsWith('ℹ️'))

  return {
    synced:    realErrors.length === 0,
    files:     synced,
    errors,
    timestamp: new Date().toISOString(),
  }
}
