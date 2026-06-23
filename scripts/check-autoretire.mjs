// Suchý běh auto-retire — ukáže, které habity by se TEĎ archivovaly (end_date < dnes,
// ještě nejsou retired). NIC nezapisuje. Stejná podmínka jako autoRetireHabits v cronu.
// Spuštění: node scripts/check-autoretire.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const today = new Date()
const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
console.log('Dnešní lokální datum:', todayISO)

// Co by auto-retire archivoval TEĎ (end_date < dnes, ne retired)
const { data: due, error } = await db.from('habits')
  .select('id, name, category, end_date, mandatory')
  .neq('category', 'retired')
  .not('end_date', 'is', null)
  .lt('end_date', todayISO)

console.log('\n=== Archivovalo by se TEĎ (end_date < dnes) ===')
if (error) console.log('CHYBA:', error)
else if (!due?.length) console.log('(nic — žádný habit nemá uplynulé end_date)')
else for (const h of due) console.log(`  ✕ ${h.name}  (end_date ${h.end_date}, ${h.category}${h.mandatory ? ', mandatory' : ''})`)

// Budoucí konce — pro přehled (ne mandatory filtr, jen výpis)
const { data: future } = await db.from('habits')
  .select('name, end_date, category')
  .neq('category', 'retired')
  .not('end_date', 'is', null)
  .gte('end_date', todayISO)
  .order('end_date', { ascending: true })

console.log('\n=== Nadcházející konce (end_date >= dnes) ===')
if (!future?.length) console.log('(žádné nastavené budoucí end_date)')
else for (const h of future) console.log(`  → ${h.name}  (do ${h.end_date}, ${h.category})`)
