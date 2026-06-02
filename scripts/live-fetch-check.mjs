// Live test of the GitHub half of vault-sync: reads GITHUB_TOKEN from
// .env.local, fetches the real files from the private repo exactly like the
// route does, then runs the parser on the LIVE content. Verifies everything up
// to the Supabase write (token, repo/branch access, dynamic paths, parsing).
// Run from hikari-dashboard/: node scripts/live-fetch-check.mjs
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const TOKEN = env.match(/^GITHUB_TOKEN=(.+)$/m)?.[1]?.trim()
if (!TOKEN) { console.error('✗ GITHUB_TOKEN not found in .env.local'); process.exit(1) }

const REPO = 'matuk42/2nd-brain', BRANCH = 'master'

function isoWeekStr() {
  const d = new Date(); const dow = d.getDay() || 7
  d.setDate(d.getDate() + 4 - dow)
  const y = d.getFullYear(); const ys = new Date(y, 0, 1)
  const wn = Math.ceil(((d.getTime() - ys.getTime()) / 86400000 + 1) / 7)
  return `${y}-W${String(wn).padStart(2, '0')}`
}
function yearMonthStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

const FILES = {
  sen: 'wiki/cile/cascade/sen.md', prijem: 'wiki/cile/cascade/prijem.md',
  habits: 'wiki/cile/habits.md',
  weekly: `wiki/reviews/weekly/${isoWeekStr()}.md`,
  monthly: `wiki/reviews/monthly/${yearMonthStr()}.md`,
}

async function ghFetch(path) {
  const url = `https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(path)}?ref=${BRANCH}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github.v3.raw' }, cache: 'no-store' })
  return { status: res.status, text: res.ok ? await res.text() : null }
}

// ── parsers (verbatim from route) ──
function mdSection(c, hdr) { const ls = c.split('\n'); const lvl = (hdr.match(/^(#+)/)?.[1] ?? '#').length; const s = ls.findIndex(l => l.startsWith(hdr)); if (s === -1) return ''; let e = ls.length; for (let i = s + 1; i < ls.length; i++) { const m = ls[i].match(/^(#+)\s/); if (m && m[1].length <= lvl) { e = i; break } } return ls.slice(s, e).join('\n') }
function mdTable(c) { const ls = c.split('\n').filter(l => l.trim().startsWith('|')); if (ls.length < 3) return []; const h = ls[0].split('|').slice(1, -1).map(x => x.trim()); const rows = []; for (let i = 2; i < ls.length; i++) { const cells = ls[i].split('|').slice(1, -1).map(x => x.trim()); const r = {}; h.forEach((x, j) => r[x] = cells[j] ?? ''); if (Object.values(r).some(v => v && v !== '—' && !/^[-\s*]+$/.test(v))) rows.push(r) } return rows }
function stripBold(s) { return s.replace(/\*\*/g, '').trim() }
function numberedItems(s) { return s.split('\n').filter(l => /^\d+\./.test(l.trim())).map(l => stripBold(l.replace(/^\d+\.\s*/, '').split(' — ')[0])).filter(Boolean) }
function findHeaderLine(md, ps) { for (const p of ps) { const l = md.split('\n').find(x => x.startsWith(p)); if (l) return l } return '' }

console.log(`\nFetching ${REPO}@${BRANCH} (week=${isoWeekStr()}, month=${yearMonthStr()})\n`)
const raw = {}
let allOk = true
for (const [k, p] of Object.entries(FILES)) {
  const r = await ghFetch(p)
  raw[k] = r.text
  const ok = r.status === 200
  if (!ok && k !== 'monthly') allOk = false
  console.log(`  ${ok ? '✓' : '✗'} ${String(r.status).padEnd(3)} ${p}${r.text ? ` (${r.text.length} B)` : ''}`)
}

console.log('\n── Parser on live content ──')
if (raw.weekly) {
  const line = findHeaderLine(raw.weekly, ['### 3 hlavní priority', '## Priority na W', '## 3 priority'])
  console.log('  L5 priorities:', line ? numberedItems(mdSection(raw.weekly, line)) : '(NONE — header not found!)')
}
if (raw.monthly) console.log('  L4 month    :', numberedItems(mdSection(raw.monthly, '### SEN — ')))
if (raw.sen) console.log('  L3 dims     :', mdTable(mdSection(raw.sen, '## Roční cíl')).map(r => r['Dimenze']).filter(n => n && !/^\d+$/.test(n)).length, 'dimensions')
if (raw.habits) {
  const im = mdTable(mdSection(raw.habits, '### Balíček Imunita'))
  console.log('  Imunita pack:', im.map(r => (r['Kód'] ?? '').trim()).filter(Boolean).join(','))
}
console.log(`\n${allOk ? '✓ GitHub half OK — only the Supabase write stays unverified (needs your session)' : '✗ Some required files failed'}\n`)
process.exit(allOk ? 0 : 1)
