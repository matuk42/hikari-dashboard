import { readFileSync } from 'fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => { const i=l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()] }))
const token = env.GITHUB_TOKEN || env.VAULT_GITHUB_TOKEN || env.GH_TOKEN
const repo = 'matuk42/2nd-brain'
const path = process.argv[2] || 'logs/mentor-feedback/2026-06-18-feedback.md'
const res = await fetch(`https://api.github.com/repos/${repo}/contents/${encodeURIComponent(path)}?ref=master`,
  { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3.raw' }, cache: 'no-store' })
if (!res.ok) { console.log('HTTP', res.status, (await res.text()).slice(0,200)); process.exit(1) }
const md = new TextDecoder('utf-8').decode(await res.arrayBuffer())
const lines = md.split('\n')
const idx = lines.findIndex(l => /^#{1,4}\s+Priorit/i.test(l))
console.log('Priority heading:', JSON.stringify(lines[idx]))
console.log('--- section (40 řádků) ---')
console.log(lines.slice(idx, idx+40).join('\n'))
