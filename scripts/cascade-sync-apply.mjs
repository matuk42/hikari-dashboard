// Jednorázově spustí NOVÝ full-refresh cascade sync pro L3/L4/L5 přes reálný GitHub
// fetch + service key write (ověří živou cestu a pročistí nánosy). node scripts/cascade-sync-apply.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url),'utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const REPO='matuk42/2nd-brain', BRANCH='master'

async function gh(path){
  const url=`https://api.github.com/repos/${REPO}/contents/${encodeURIComponent(path)}?ref=${BRANCH}`
  const res=await fetch(url,{headers:{Authorization:`Bearer ${env.GITHUB_TOKEN}`,Accept:'application/vnd.github.v3.raw'},cache:'no-store'})
  if(res.status===404)return null; if(!res.ok)throw new Error(`HTTP ${res.status} ${path}`)
  return new TextDecoder('utf-8').decode(await res.arrayBuffer())
}
const mdSection=(c,h)=>{const L=c.split('\n');const lv=(h.match(/^(#+)/)?.[1]??'#').length;const s=L.findIndex(l=>l.startsWith(h));if(s===-1)return'';let e=L.length;for(let i=s+1;i<L.length;i++){const m=L[i].match(/^(#+)\s/);if(m&&m[1].length<=lv){e=i;break}}return L.slice(s,e).join('\n')}
const mdTable=c=>{const L=c.split('\n').filter(l=>l.trim().startsWith('|'));if(L.length<3)return[];const H=L[0].split('|').slice(1,-1).map(h=>h.trim());const R=[];for(let i=2;i<L.length;i++){const cs=L[i].split('|').slice(1,-1).map(x=>x.trim());const r={};H.forEach((h,j)=>r[h]=cs[j]??'');if(Object.values(r).some(v=>v&&v!=='—'&&!/^[-\s*]+$/.test(v)))R.push(r)}return R}
const stripBold=s=>s.replace(/\*\*/g,'').trim()
const cleanDetail=s=>s.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g,'$1').replace(/\*\*/g,'').replace(/\s*\([^)]*\)\s*/g,' ').replace(/\s+/g,' ').replace(/[\s:–—-]+$/,'').trim()
function parseItem(line){const s=line.trim().replace(/^(?:\d+\.|[-•*])\s*/,'');if(!s)return null;const b=s.match(/^\*\*([^*]+)\*\*\s*(?:[—–-]\s*)?(.*)$/);if(b){let n=b[1].trim(),d=(b[2]??'').trim();if(!d&&/ — /.test(n)){const[f,...r]=n.split(' — ');n=f.trim();d=r.join(' — ').trim()}return{name:n,detail:d}}const[f,...r]=s.split(' — ');return{name:stripBold(f).trim(),detail:r.join(' — ').trim()}}
const itemLines=b=>b.split('\n').filter(l=>/^\s*(?:\d+\.|[-•*])\s+/.test(l))
const h3Block=(c,p)=>{const L=c.split('\n');const s=L.findIndex(l=>l.startsWith(p));if(s===-1)return'';let e=L.length;for(let i=s+1;i<L.length;i++){if(/^(#{1,3})\s/.test(L[i])){e=i;break}}return L.slice(s+1,e).join('\n')}

const ym=new Date().toISOString().slice(0,7)
const PID='30e0b97c-1190-4e03-8d7e-23efb063c2e6'

async function replace(layer, items){
  const {data:l}=await db.from('cascade_layers').select('id').eq('profile_id',PID).eq('tree','sen').eq('layer',layer).maybeSingle()
  if(!l){console.log(`L${layer}: layer row chybí`);return}
  await db.from('cascade_dimensions').delete().eq('layer_id',l.id)
  if(!items.length){console.log(`L${layer}: 0 items`);return}
  const rows=items.map((p,i)=>({layer_id:l.id,name:p.name,detail:p.detail||null,kind:p.kind??null,sort_order:i,progress_pct:0}))
  const {error}=await db.from('cascade_dimensions').insert(rows)
  console.log(`L${layer}: ${items.length} dims ${error?'ERR '+error.message:'✓'}`)
  for(const p of items)console.log(`     - ${p.name}`)
}

// L4 měsíc
const monthly=await gh(`wiki/reviews/monthly/${ym}.md`)
const l4=itemLines(mdSection(monthly,'### SEN — ')).map(parseItem).filter(i=>i?.name).map(i=>({name:i.name,detail:cleanDetail(i.detail)}))
await replace(4,l4)

// L3 rok
const sen=await gh('wiki/cile/cascade/sen.md')
const l3=mdTable(mdSection(sen,'## Roční cíl')).map(r=>{const n=stripBold(r['Dimenze']??'');const m=Object.entries(r).find(([k])=>/Mil[ní]/i.test(k))?.[1]??'';return{name:n,detail:cleanDetail(m)}}).filter(d=>d.name&&d.name!=='—'&&!/^\d+$/.test(d.name))
const prijem=await gh('wiki/cile/cascade/prijem.md')
if(prijem){const pr=mdTable(mdSection(prijem,'## Roční cíl'));const fm=pr.find(r=>r['Milník k 1.9.2027'])?.['Milník k 1.9.2027'];if(fm)l3.push({name:'Příjem',detail:cleanDetail(fm)})}
await replace(3,l3)

// L5 týden — najdi aktuální týdenní soubor (zkus pár týdnů zpět)
function isoWeek(d){const x=new Date(d);const dow=x.getDay()||7;x.setDate(x.getDate()+4-dow);const y=x.getFullYear();const ys=new Date(y,0,1);const wn=Math.ceil(((x-ys)/864e5+1)/7);return`${y}-W${String(wn).padStart(2,'0')}`}
let weekly=null,used=''
for(let i=-1;i<=6;i++){const d=new Date();d.setDate(d.getDate()-i*7);const p=`wiki/reviews/weekly/${isoWeek(d)}.md`;const md=await gh(p);if(md){weekly=md;used=p;break}}
console.log(`\nweekly soubor: ${used}`)
const prioHdr=weekly.split('\n').find(l=>/^## Priority\b/.test(l))
const sec=mdSection(weekly,prioHdr)
const groups=[['### Hlavní','main'],['### Vedlejší','side'],['### Bonus','bonus']]
const l5=[]
for(const[p,k]of groups){for(const ln of itemLines(h3Block(sec,p))){const it=parseItem(ln);if(it?.name)l5.push({name:it.name,detail:cleanDetail(it.detail),kind:k})}}
await replace(5,l5)
console.log('\nhotovo')
