// Parser sanity check — runs the vault-sync pure parsers against the REAL local
// vault files (no Next/DB/GitHub) and prints what each cascade layer extracts.
// The vault's weekly/monthly markdown structure drifts over time; re-run this
// after format changes to confirm the sync still finds priorities/dimensions.
// Run from hikari-dashboard/: node scripts/parse-check.mjs
import { readFileSync } from 'fs'
import { join } from 'path'

const VAULT = join(process.cwd(), '..', '2nd_brain')
const read = p => { try { return readFileSync(join(VAULT, p), 'utf8') } catch { return null } }

// ── pure functions copied verbatim from app/api/vault-sync/route.ts ──
function mdSection(content, hdr) {
  const lines = content.split('\n')
  const level = (hdr.match(/^(#+)/)?.[1] ?? '#').length
  const start = lines.findIndex(l => l.startsWith(hdr))
  if (start === -1) return ''
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/)
    if (m && m[1].length <= level) { end = i; break }
  }
  return lines.slice(start, end).join('\n')
}
function mdTable(content) {
  const lines = content.split('\n').filter(l => l.trim().startsWith('|'))
  if (lines.length < 3) return []
  const headers = lines[0].split('|').slice(1, -1).map(h => h.trim())
  const rows = []
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i].split('|').slice(1, -1).map(c => c.trim())
    const row = {}
    headers.forEach((h, j) => { row[h] = cells[j] ?? '' })
    if (Object.values(row).some(v => v && v !== '—' && !/^[-\s*]+$/.test(v))) rows.push(row)
  }
  return rows
}
function h3Names(content) {
  const skip = ['anti-cíl', 'citát', 'calculator', 'propojení', 'průměrný týden', 'měřitelnost']
  return content.split('\n').filter(l => l.startsWith('### '))
    .map(l => l.replace(/^### /, '').trim())
    .filter(n => !skip.some(s => n.toLowerCase().includes(s)))
}
function stripBold(s) { return s.replace(/\*\*/g, '').trim() }
function numberedItems(sectionMd) {
  return sectionMd.split('\n').filter(l => /^\d+\./.test(l.trim()))
    .map(l => stripBold(l.replace(/^\d+\.\s*/, '').split(' — ')[0])).filter(Boolean)
}

const sen = read('wiki/cile/cascade/sen.md')
const weekly = read('wiki/reviews/weekly/2026-W23.md')
const monthly = read('wiki/reviews/monthly/2026-06.md')

console.log('\n=== L1 chips (current: H3 of "## Životní sen (statický") ===')
console.log(h3Names(mdSection(sen, '## Životní sen (statický')))

console.log('\n=== L3 dims (table "Dimenze" in "## Roční cíl") ===')
console.log(mdTable(mdSection(sen, '## Roční cíl')).map(r => r['Dimenze']).filter(n => n && !/^\d+$/.test(n)))

console.log('\n=== L4 monthly ("### SEN — ") ===')
console.log(numberedItems(mdSection(monthly, '### SEN — ')))

console.log('\n=== L5 weekly — CURRENT finder "## Priority na W" ===')
const oldLine = weekly.split('\n').find(l => l.match(/^## Priority na W/)) ?? '(NOT FOUND)'
console.log('header:', oldLine)
console.log('items :', numberedItems(oldLine.startsWith('##') ? mdSection(weekly, oldLine) : ''))

console.log('\n=== L5 weekly — FIXED finder (multi-format fallback) ===')
function findHeaderLine(md, prefixes) {
  for (const p of prefixes) { const line = md.split('\n').find(l => l.startsWith(p)); if (line) return line }
  return ''
}
const prioLine = findHeaderLine(weekly, ['### 3 hlavní priority', '## Priority na W', '## 3 priority'])
console.log('header:', prioLine || '(none)')
console.log('items :', prioLine ? numberedItems(mdSection(weekly, prioLine)) : [])
function weekLabelFromFile(md) {
  const wk = md.match(/^week:\s*\d{4}-(W\d+)/m)?.[1]
  const range = md.match(/—\s*W\d+\s*\(([^)]+)\)/)?.[1]
  return wk && range ? `${wk} · ${range}` : (wk ?? 'Týden')
}
console.log('label :', weekLabelFromFile(weekly))

// ── Habits parse (pack / pack_code) ──
const habits = read('wiki/cile/habits.md')
function parseStreak(s) { if (!s || s.toLowerCase().includes('nový')) return null; const m = s.match(/(\d+)/); return m ? parseInt(m[1], 10) : null }
console.log('\n=== Habits: Aktivní (with streak + raw "Slouží dimenzi") ===')
const stripWiki = s => s.replace(/\[\[([^\]|]+)\]\]/g, '$1')
for (const r of mdTable(mdSection(habits, '## Aktivní (Active)'))) {
  const name = stripBold(r['Habit'] ?? ''); if (!name || name.startsWith('_')) continue
  const serves = r['Slouží dimenzi'] ?? r['Slouží'] ?? ''
  console.log(`  ${name}  | streak=${parseStreak(r['Aktuální streak'] ?? '')}`)
  console.log(`      serves raw : "${serves}"`)
  console.log(`      serves strip: "${stripWiki(serves)}"`)
}
console.log('\n=== Habits: Balíček Imunita (pack_code A–J) ===')
for (const r of mdTable(mdSection(habits, '### Balíček Imunita'))) {
  const name = stripBold(r['Habit'] ?? ''); if (!name || name.startsWith('_')) continue
  console.log(`  [${(r['Kód'] ?? '').trim() || '?'}] ${name}`)
}
console.log('\n=== Habits: Balíček Fyzička ===')
for (const r of mdTable(mdSection(habits, '### Balíček Fyzička'))) {
  const name = stripBold(r['Habit'] ?? ''); if (!name || name.startsWith('_')) continue
  console.log(`  ${name}`)
}
console.log()
