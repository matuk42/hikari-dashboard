// Backfill /kibou HOPE log z deníkových souborů ve vaultu.
// Parsuje frontmatter (mood, energy, hope, date) z každého ../2nd_brain/wiki/deník/*.md
// a vypíše SQL INSERT statements do stdout + scripts/backfill-hope.sql.
//
// Spustit: node scripts/backfill-hope.mjs
// Pak otevři scripts/backfill-hope.sql a paste do Supabase → SQL Editor → Run.
//
// SQL používá ON CONFLICT DO NOTHING, takže opakované spuštění je bezpečné
// (nepřepisuje existující záznamy — třeba dnešní z dashboardu).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const DIARY_DIR  = join(__dirname, '..', '..', '2nd_brain', 'wiki', 'deník')
const OUT_FILE   = join(__dirname, 'backfill-hope.sql')

function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  const fm = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/)
    if (kv) fm[kv[1]] = kv[2].trim()
  }
  return fm
}

const rows = []
for (const file of readdirSync(DIARY_DIR).sort()) {
  if (!file.endsWith('.md')) continue
  const md = readFileSync(join(DIARY_DIR, file), 'utf8')
  const fm = parseFrontmatter(md)
  if (!fm) continue
  const date = fm.date
  const mood = Number(fm.mood)
  const energy = Number(fm.energy)
  const hope = Number(fm.hope)
  if (!date || !Number.isFinite(mood) || !Number.isFinite(energy) || !Number.isFinite(hope)) continue
  rows.push({ date, mood, energy, hope })
}

const sql = [
  '-- Backfill HOPE/kibou z deníku 2nd_brain/wiki/deník/',
  '-- Bezpečné spustit opakovaně: ON CONFLICT DO NOTHING přeskočí existující řádky',
  `-- Zdroj: ${rows.length} dní (${rows[0]?.date} → ${rows.at(-1)?.date})`,
  '',
  'WITH p AS (SELECT id FROM profiles LIMIT 1)',
  'INSERT INTO hope_logs (profile_id, date, mood, energy, hope, note)',
  'SELECT p.id, v.date::date, v.mood, v.energy, v.hope, \'vault-backfill\'',
  'FROM p, (VALUES',
  rows.map((r, i) => `  ('${r.date}', ${r.mood}, ${r.energy}, ${r.hope})${i === rows.length - 1 ? '' : ','}`).join('\n'),
  ') AS v(date, mood, energy, hope)',
  'ON CONFLICT (profile_id, date) DO NOTHING;',
  '',
].join('\n')

writeFileSync(OUT_FILE, sql)
console.log(`✓ ${rows.length} řádků zapsáno do ${OUT_FILE}`)
console.log(`  Range: ${rows[0]?.date} → ${rows.at(-1)?.date}`)
