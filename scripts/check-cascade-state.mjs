// Aktuální stav cascade v DB — layery + dimenze (milníky) + %.
// node scripts/check-cascade-state.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const today = new Date().toISOString().slice(0, 10)
const dow = ['ne','po','ut','st','ct','pa','so'][new Date(today+'T12:00:00Z').getUTCDay()]
console.log('today:', today, '('+dow+')\n')

const { data: profiles } = await db.from('profiles').select('id')
const pid = profiles?.[0]?.id

const { data: layers } = await db.from('cascade_layers')
  .select('id, layer, progress_pct, description, deadline, updated_at')
  .eq('profile_id', pid).eq('tree', 'sen').order('layer')

for (const l of layers ?? []) {
  console.log(`L${l.layer}  ${l.progress_pct ?? '–'}%  "${l.description ?? ''}"  deadline=${l.deadline ?? '–'}  upd=${(l.updated_at??'').slice(0,16)}`)
  const { data: dims } = await db.from('cascade_dimensions')
    .select('name, detail, kind, sort_order, progress_pct, updated_at')
    .eq('layer_id', l.id).order('sort_order')
  for (const d of dims ?? []) {
    console.log(`      ${String(d.progress_pct ?? 0).padStart(3)}%  [${d.kind ?? '–'}] ${d.name}${d.detail ? '  · '+d.detail.slice(0,40) : ''}`)
  }
}

// last cascade invocation
const { data: inv } = await db.from('ai_invocations')
  .select('purpose, success, error, created_at, duration_ms')
  .eq('profile_id', pid).eq('purpose', 'cascade_milestones')
  .order('created_at', { ascending: false }).limit(3)
console.log('\n=== cascade_milestones invokace (3) ===')
for (const i of inv ?? []) console.log(`  ${(i.created_at??'').slice(0,16)}  ok=${i.success}  ${i.duration_ms}ms  ${i.error ?? ''}`)
