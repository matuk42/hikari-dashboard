# PROGRESS — kde jsme, co dál

> **Pro Claude:** Tohle je continuity log mezi chaty (NE projektová pravidla — ta jsou v `CLAUDE.md`).
> Na **začátku** session si ho přečti, ať navazuješ. Na **konci** session ho **aktualizuj**
> (datum, co se udělalo, co je dál). Drž ho stručný a pravdivý.

**Poslední aktualizace:** 2026-06-16

---

## 🎯 Kde teď jsme
Dashboard reálně slouží svému účelu: **ráno na mobilu vidíš co dělat + odškrtáváš habity, bez notebooku a Obsidianu.** Celý řetězec `vault (Obsidian / Claude Code) → GitHub → Sync → Supabase → mobil` byl **živě ověřen** Matyášem 2026-06-02. **AI brain / ranní cron (PRD W26) je postavený** — `/api/cron/morning` (Vercel `0 6 * * *`) přepočítá streaky, cascade % (L4/L5 z habitů) a vygeneruje denní Gemini brief → cache do `ai_daily_brief`. Home zobrazuje brief (nudge + reasoning), cascade už čte reálná % z DB. Tlačítko „Přepočítej Hikari" re-runne stejný cron on-demand (`/api/hikari/refresh`). **16.6. večer: denní úkoly (hlavní/vedlejší/bonus) přepnuty na vault** — místo týdenní cascade je teď home čte z denního mentor-feedbacku (viz níže), Gemini je už negeneruje.

Dřívější milníky: 9.6. session — (a) oprava sync na nový W24 formát + Memory.md bootstrap + kibou ikonky + multi-save fix + **graceful weekly rollover**. (b) **večerní iterace**: PNG ikonky i na home HOPE kartě; bugfix `parseStreak` v vault-sync (regex `/(\d+)/` bral den z "8.6." → falešný streak 8 na Anki — teď striktně `"N dní"` + restart-markery detekuje jako reset=0); ručně smazán starý duplicit habit "Spánek 22:00–06:15" v DB + odebrán z `ALL_HABITS` fallback (re-seedoval se po každém delete); **HOPE backfill** 30 dní z deníkového frontmatteru — `scripts/backfill-hope.mjs` → `backfill-hope.sql` (Matyáš spustil v Supabase).

## ✅ Funguje (ověřeno živě)
- **Habits** — živý seznam z DB (vault = zdroj pravdy), skupiny Aktivní/Testovací/Balíčky(Imunita,Fyzička)/Zautomatizováno. Odškrtnutí → zápis do Supabase, offline queue.
- **Streaky** — pravdivé „X dní v řadě": denní přepočet při otevření appky, grace day (1 den odpuštěn), autoškola = mandatory (bez grace). Vault baseline (Anki=45) zachován.
- **Home** — streak hero (max), habity X/Y, HOPE dnes, **3 sekce úkolů reálně z vaultu** (Hlavní + Vedlejší + Bonus, každý s detailem za pomlčkou).
- **kibou** — slidery mood/energy/hope s vlastními PNG ikonkami (mood=kameny, energy=blesk, hope=All Might; všechny čtvercově paddované, transparentní pozadí). Multi-save během dne ✓ (UPSERT, ne INSERT). 30d graf.
- **Cascade** — týden (L5) a měsíc (L4) **počítá Hikari z habitů** (reálná % z DB, štítek „počítá Hikari"); rok a 5 let zatím kurátovaný „odhad".
- **AI brain / ranní cron** — `/api/cron/morning` (Vercel `0 6 * * *`) + on-demand `/api/hikari/refresh` (tlačítko „Přepočítej Hikari"). Krok 1 streaky, krok 2 cascade % (L4/L5), krok 3 kontext z DB (habits, streaky, týdenní priority, poslední HOPE, Hikari paměť), krok 4 Gemini `gemini-2.5-flash` brief (JSON: hlavní/vedlejší/bonus + cascade_nudge + reasoning) → cache `ai_daily_brief`, log do `ai_invocations`. UTF-8/Windows fetch gotcha ošetřen (`cache: no-store` + ruční TextDecoder). Home zatím zobrazuje **nudge + reasoning** (3+2+1 úkoly z briefu se ještě nerenderují — viz Co dál).
- **Vault sync** — tlačítko na home, dynamické cesty (aktuální týden/měsíc), parsuje habity+pack, cascade L1-L5 (L5 = full replace, ne accumulate), priority (Hlavní/Vedlejší/Bonus se sub-sekcemi a `**Name** — detail` formátem), Memory.md bootstrap (16 H2 sekcí → hikari_memory). **Weekly rollover ✓** — zkouší W+1, current, W-1, …, až 6 týdnů zpět. W+1 se zkouší první — pokud je nedělní W## plán napsaný dopředu, sync ho načte správně.
- Google login, onboarding, PWA, CSP.

## 🧭 Co dál (priorita shora)
1. **Dotáhnout AI brain (cron jádro hotové):**
   - **Denní brief 3+2+1 úkolů na home** — Gemini je generuje (hlavní/vedlejší/bonus v `ai_daily_brief`), ale home je zatím nerenderuje (ukazuje jen nudge + reasoning; úkoly na home jsou pořád z vault sync). Napojit brief.hlavni/vedlejsi/bonus do home.
   - **Detekce vzorů** ("úterý low energy", "les → +HOPE") — Gemini nad nimi reasonuje z paměti, ale není automatický pattern-detection zápis do DB.
   - **Živá energetická osa** z HOPE dat (teď statická — cron nepíše `energy_blocks`).
   - **Rok/5 let reálná %** (zatím „odhad").
2. **Drobnosti:**
   - Auto-sync cron (Ne 22:00) místo jen ručního tlačítka.
   - Energy obrázek v kibou — kdyby chtěl něco jiného než blesk.
3. **V2:** `/history` heat-mapa · **V3:** `/calculator`.

## ⚠️ Háčky / co vědět
- **Migrace 003 + 004 aplikované**. 004 = `kind`/`detail`/`sort_order` na `cascade_dimensions`. Bez ní sync běží přes fallback (insert bez nových sloupců) ale home pak nezobrazí Vedlejší/Bonus. Další migrace → říct Matyášovi ať spustí SQL v Supabase před deployem.
- **CSP je jen v kódu** (`next.config.ts`). Nesmí být druhá ve Vercel dashboardu (kombinovaly by se restriktivně).
- **Týdenní priority** — Vercel server běží UTC, kolem půlnoci CEST se může lišit ISO týden o 1 oproti autorovi. Proto **rollover** zkouší 6 týdnů zpět — sync nepadne když ti chybí soubor aktuálního týdne, použije poslední existující. Layer 5 description (`weekLabelFromFile`) odráží skutečně načtený týden.
- **Streak přepočet je client-side líný** (běží při otevření appky), dokud nebude ranní cron.
- **Dashboard → vault zpětný zápis NENÍ a nemá být** v dashboardu — dělá ho Hikari přes Claude Code CLI při hlasovém deníku (Supabase = mozek, vault = archiv).
- **Pre-push hook** pouští `npm run build` — push se zablokuje když build spadne.
- Nikdy necommituj/nepushuj bez explicitní žádosti Matyáše.

## 🔑 Klíčová rozhodnutí
- **Cascade %** — ✅ vyřešeno: cron počítá týden (L5) a měsíc (L4) z habitů, `/cascade` je čte z DB pro tyto vrstvy (`REAL_PCT_LAYERS`) se štítkem „počítá Hikari". Rok a 5 let zůstávají kurátovaný „odhad", dokud nebude goal-based výpočet.
- **Habits** = DB-driven, `ALL_HABITS` jen fallback (offline / prázdná DB / chybí 003).
- **Streaky** = vault baseline + ±1 na toggle + denní reconcile (gap≥3 zlom pro běžné, gap≥2 pro mandatory).

## 🔬 Ověřovací nástroje
- `node scripts/parse-check.mjs` — parser proti **lokálnímu** vaultu (po změně formátu vaultu).
- `node scripts/live-fetch-check.mjs` — **reálný** GitHub fetch tokenem + parse (ověří sync až po DB zápis).

## 📌 Stav modulů vs PRD (W23–W27)
Hotovo: Habits, kibou, Cascade UI + reálná % týden/měsíc, Vault sync (ruční), login, onboarding, PWA, Home, **AI brain ranní cron (W26 jádro: streaky + cascade % + Gemini brief)**.
Chybí: 3+2+1 brief úkoly na home, automatická detekce vzorů, živá energetická osa, konflikt workflow (CLI ↔ Supabase), auto-sync cron (Ne 22:00), /history, /calculator.
