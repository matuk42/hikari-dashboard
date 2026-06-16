// Ověří L3/L4 parsery proti lokálnímu vaultu (kontrola před sync). Nic nezapisuje.
// node scripts/cascade-check.mjs
import { readFileSync } from 'fs'
const VAULT = '../2nd_brain'
const r = p => readFileSync(new URL(`${VAULT}/${p}`, import.meta.url), 'utf8')

function mdSection(content, hdr) {
  const lines = content.split('\n')
  const level = (hdr.match(/^(#+)/)?.[1] ?? '#').length
  const start = lines.findIndex(l => l.startsWith(hdr))
  if (start === -1) return ''
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/); if (m && m[1].length <= level) { end = i; break }
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
    const row = {}; headers.forEach((h, j) => { row[h] = cells[j] ?? '' })
    if (Object.values(row).some(v => v && v !== '—' && !/^[-\s*]+$/.test(v))) rows.push(row)
  }
  return rows
}
const stripBold = s => s.replace(/\*\*/g, '').trim()
const cleanDetail = s => s
  .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1').replace(/\*\*/g, '')
  .replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').replace(/[\s:–—-]+$/, '').trim()
function parsePriorityItem(line) {
  const s = line.trim().replace(/^(?:\d+\.|[-•*])\s*/, ''); if (!s) return null
  const bold = s.match(/^\*\*([^*]+)\*\*\s*(?:[—–-]\s*)?(.*)$/)
  if (bold) {
    let name = bold[1].trim(); let detail = (bold[2] ?? '').trim()
    if (!detail && / — /.test(name)) { const [f, ...rest] = name.split(' — '); name = f.trim(); detail = rest.join(' — ').trim() }
    return { name, detail }
  }
  const [f, ...rest] = s.split(' — '); return { name: stripBold(f).trim(), detail: rest.join(' — ').trim() }
}
function parseMonthlyMilestones(sec) {
  return sec.split('\n').filter(l => /^\s*\d+\.\s/.test(l)).map(parsePriorityItem)
    .filter(i => i?.name).map(i => ({ name: i.name, detail: cleanDetail(i.detail) }))
}
function parseYearlyDimensions(sec) {
  return mdTable(sec).map(row => {
    const name = stripBold(row['Dimenze'] ?? '')
    const m = Object.entries(row).find(([k]) => /Mil[ní]/i.test(k))?.[1] ?? ''
    return { name, detail: cleanDetail(m) }
  }).filter(d => d.name && d.name !== '—' && !/^\d+$/.test(d.name))
}

const ym = new Date().toISOString().slice(0, 7)
console.log(`\n=== L4 Měsíc (monthly/${ym}.md → ### SEN —) ===`)
const monthly = r(`wiki/reviews/monthly/${ym}.md`)
for (const d of parseMonthlyMilestones(mdSection(monthly, '### SEN — ')))
  console.log(`  › ${d.name}${d.detail ? '  · ' + d.detail : ''}`)

console.log(`\n=== L3 Rok (sen.md → ## Roční cíl) ===`)
const sen = r('wiki/cile/cascade/sen.md')
for (const d of parseYearlyDimensions(mdSection(sen, '## Roční cíl')))
  console.log(`  › ${d.name}${d.detail ? '  · ' + d.detail.slice(0, 70) : ''}`)
