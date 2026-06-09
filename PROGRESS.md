# PROGRESS — kde jsme, co dál

> **Pro Claude:** Tohle je continuity log mezi chaty (NE projektová pravidla — ta jsou v `CLAUDE.md`).
> Na **začátku** session si ho přečti, ať navazuješ. Na **konci** session ho **aktualizuj**
> (datum, co se udělalo, co je dál). Drž ho stručný a pravdivý.

**Poslední aktualizace:** 2026-06-09

---

## 🎯 Kde teď jsme
Dashboard reálně slouží svému účelu: **ráno na mobilu vidíš co dělat + odškrtáváš habity, bez notebooku a Obsidianu.** Celý řetězec `vault (Obsidian / Claude Code) → GitHub → Sync → Supabase → mobil` byl **živě ověřen** Matyášem 2026-06-02. 9.6. session: oprava sync na nový W24 formát + Memory.md bootstrap + kibou ikonky + multi-save fix + **graceful weekly rollover** (sync zkouší 6 týdnů zpět, fix UTC vs CEST week-flip na Vercel serveru).

## ✅ Funguje (ověřeno živě)
- **Habits** — živý seznam z DB (vault = zdroj pravdy), skupiny Aktivní/Testovací/Balíčky(Imunita,Fyzička)/Zautomatizováno. Odškrtnutí → zápis do Supabase, offline queue.
- **Streaky** — pravdivé „X dní v řadě": denní přepočet při otevření appky, grace day (1 den odpuštěn), autoškola = mandatory (bez grace). Vault baseline (Anki=45) zachován.
- **Home** — streak hero (max), habity X/Y, HOPE dnes, **3 sekce úkolů reálně z vaultu** (Hlavní + Vedlejší + Bonus, každý s detailem za pomlčkou).
- **kibou** — slidery mood/energy/hope s vlastními PNG ikonkami (mood=kameny, energy=blesk, hope=All Might; všechny čtvercově paddované, transparentní pozadí). Multi-save během dne ✓ (UPSERT, ne INSERT). 30d graf.
- **Cascade** — kurátované vrstvy + chipy s detailem, štítek „odhad" (viz rozhodnutí níže).
- **Vault sync** — tlačítko na home, dynamické cesty (aktuální týden/měsíc), parsuje habity+pack, cascade L1-L5 (L5 = full replace, ne accumulate), priority (Hlavní/Vedlejší/Bonus se sub-sekcemi a `**Name** — detail` formátem), Memory.md bootstrap (16 H2 sekcí → hikari_memory).
- Google login, onboarding, PWA, CSP.

## 🧭 Co dál (priorita shora)
1. **AI brain / ranní cron 6:00 (PRD W26)** — největší milník, udělá z dashboardu „Jarvise":
   - reálné cascade % (rozsvítí to, co je teď „odhad")
   - denní brief 3+2+1 úkolů (z cascade + habits + HOPE) → opravdu *denní* adaptivní úkoly
   - detekce vzorů ("úterý low energy", "les → +HOPE")
   - živá energetická osa z HOPE dat (teď statická)
2. **Drobnosti:**
   - Graceful rollover týdenního souboru — když chybí soubor aktuálního týdne, vrátit se k poslednímu existujícímu místo chyby + tiché staré.
   - Auto-sync cron (Ne 22:00) místo jen ručního tlačítka.
   - Energy obrázek v kibou — kdyby chtěl něco jiného než blesk.
3. **V2:** `/history` heat-mapa · **V3:** `/calculator`.

## ⚠️ Háčky / co vědět
- **Migrace 003 + 004 aplikované**. 004 = `kind`/`detail`/`sort_order` na `cascade_dimensions`. Bez ní sync běží přes fallback (insert bez nových sloupců) ale home pak nezobrazí Vedlejší/Bonus. Další migrace → říct Matyášovi ať spustí SQL v Supabase před deployem.
- **CSP je jen v kódu** (`next.config.ts`). Nesmí být druhá ve Vercel dashboardu (kombinovaly by se restriktivně).
- **Týdenní priority se aktualizují jen když existuje soubor daného týdne** (`wiki/reviews/weekly/2026-W##.md`) s hlavičkou `### 3 hlavní priority`. Chybí → sync hodí „Not found" a home drží minulý týden.
- **Streak přepočet je client-side líný** (běží při otevření appky), dokud nebude ranní cron.
- **Dashboard → vault zpětný zápis NENÍ a nemá být** v dashboardu — dělá ho Hikari přes Claude Code CLI při hlasovém deníku (Supabase = mozek, vault = archiv).
- **Pre-push hook** pouští `npm run build` — push se zablokuje když build spadne.
- Nikdy necommituj/nepushuj bez explicitní žádosti Matyáše.

## 🔑 Klíčová rozhodnutí
- **Cascade %** = kurátované odhady + štítek „odhad — Hikari spočítá s AI cronem", dokud nebude AI (W26). Sync plní DB tiše. **Až bude cron počítat reálné %, přepnout `/cascade` zpět na čtení z DB** (mapper `dbToLayers` byl odebrán — git-recover z commitu kolem cascade revertu).
- **Habits** = DB-driven, `ALL_HABITS` jen fallback (offline / prázdná DB / chybí 003).
- **Streaky** = vault baseline + ±1 na toggle + denní reconcile (gap≥3 zlom pro běžné, gap≥2 pro mandatory).

## 🔬 Ověřovací nástroje
- `node scripts/parse-check.mjs` — parser proti **lokálnímu** vaultu (po změně formátu vaultu).
- `node scripts/live-fetch-check.mjs` — **reálný** GitHub fetch tokenem + parse (ověří sync až po DB zápis).

## 📌 Stav modulů vs PRD (W23–W27)
Hotovo: Habits, kibou, Cascade UI, Vault sync (ruční), login, onboarding, PWA, Home (kromě AI částí).
Chybí: AI brain (W26), živá energetická osa, Hikari paměť, konflikt workflow, auto-sync cron, /history, /calculator.
