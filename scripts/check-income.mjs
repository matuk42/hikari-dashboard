// Diagnostika income_snapshots — vypíše poslední snapshoty příjmu (kotva cascade %).
// Ukáže i to, co půjde do Gemini promptu (poslední řádek). NIC nezapisuje.
// Spuštění: node scripts/check-income.mjs
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

const { data, error } = await db.from('income_snapshots')
  .select('date, monthly_income_kc, hourly_rate_kc, total_earned_kc, note, logged_at')
  .order('date', { ascending: false }).order('logged_at', { ascending: false })
  .limit(10)

console.log('=== income_snapshots (posledních 10) ===')
if (error) { console.log('CHYBA:', error.message); process.exit(1) }
if (!data?.length) { console.log('(žádný snapshot — příjem zatím nezadán, Gemini drží příjmové milníky na ~0)'); process.exit(0) }
for (const r of data) {
  console.log(`  ${r.date}  měsíčně ${r.monthly_income_kc} Kč/měs · hodinovka ${r.hourly_rate_kc} Kč/h · celkem ${r.total_earned_kc} Kč${r.note ? `  — ${r.note}` : ''}`)
}

const latest = data[0]
console.log('\n=== Co půjde do Gemini promptu (poslední snapshot) ===')
console.log(`  AKTUÁLNÍ PŘÍJEM: měsíčně ${latest.monthly_income_kc} Kč/měs · hodinovka ${latest.hourly_rate_kc} Kč/h · celkem vyděláno ${latest.total_earned_kc} Kč (zadáno ${latest.date}${latest.note ? `, pozn.: ${latest.note}` : ''})`)
