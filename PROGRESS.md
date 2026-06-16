# PROGRESS — kde jsme, co dál

> **Pro Claude:** Tohle je continuity log mezi chaty (NE projektová pravidla — ta jsou v `CLAUDE.md`).
> Na **začátku** session si ho přečti, ať navazuješ. Na **konci** session ho **aktualizuj**
> (datum, co se udělalo, co je dál). Drž ho stručný a pravdivý.

**Poslední aktualizace:** 2026-06-16 (večer, session 2)

---

## ⏳ ROZPRACOVÁNO — navázat příští session (tato spadla na API errory)

**1. Anki streak ukazuje 0 — NEDOŘEŠENO (bug k opravě).**
- Matyáš: „Anki procvičování" má reálně **3 dny streak**, ale appka ukazuje 0.
- Podezření na příčinu: ranní cron `recalcStreaks` (`lib/hikari-brain.ts`) přepisuje `current_streak` **jen z `habit_logs`**, a protože vault už streak baseline nesyncuje (tato session to vypnula), starý baseline (Anki 45) se ztratil. Pokud Anki nebylo odškrtáváno v appce (jen reálně děláno), `habit_logs` nemají `done` záznamy → streak 0. → **Není to nutně bug v logice, ale chybí data v `habit_logs`.**
- **Co udělat:** ověřit DB (mám service key v `.env.local` — napsat node skript: dotaz na `habits` Anki + `streaks_cache` + posledních ~10 `habit_logs`). Zjistit, jestli (a) existuje duplicitní Anki habit, (b) jsou done logy. Pak buď opravit logiku, nebo **jednorázově nastavit Anki `current_streak=3`** v `streaks_cache` (Matyáš to schválil — má 3 dny). Pozor: další cron run může přepsat zpět z logů, takže pokud chybí logy, doplnit i `habit_logs` za ty dny.

**2. Auto-commit/push hook — zdokumentovat (NEDOKONČENO).**
- Matyáš upozornil, že **vše se celou dobu automaticky pushuje** (commity „auto: save changes") — existuje auto hook.
- **Úkol:** najít mechanismus (běžel background grep na „auto: save changes" v ps1/sh/bat/js/json + `.git/hooks` — nedoběhlo) a pak **přepsat instrukce „nikdy necommituj/nepushuj"** v: `hikari-dashboard/CLAUDE.md`, `Hikari_all/CLAUDE.md`, `2nd_brain/CLAUDE.md`, `PROGRESS.md` (sekce Háčky níž), případně `AGENTS.md` — přidat info, že existuje auto-commit/push hook a co dělá. NEměnit vault obsahové soubory (deník, raw-sources).

---

## 🎯 Kde teď jsme
Dashboard reálně slouží svému účelu: **ráno na mobilu vidíš co dělat + odškrtáváš habity, bez notebooku a Obsidianu.** Celý řetězec `vault (Obsidian / Claude Code) → GitHub → Sync → Supabase → mobil` byl **živě ověřen** Matyášem 2026-06-02. **AI brain / ranní cron (PRD W26) je postavený** — `/api/cron/morning` (Vercel `0 6 * * *`) přepočítá streaky, cascade % (L4/L5 z habitů) a vygeneruje denní Gemini brief → cache do `ai_daily_brief`. Home zobrazuje brief (nudge + reasoning), cascade už čte reálná % z DB. Tlačítko „Přepočítej Hikari" re-runne stejný cron on-demand (`/api/hikari/refresh`). **16.6. večer: denní úkoly (hlavní/vedlejší/bonus) přepnuty na vault** — místo týdenní cascade je teď home čte z denního mentor-feedbacku (viz níže), Gemini je už negeneruje.

Dřívější milníky: 9.6. session — (a) oprava sync na nový W24 formát + Memory.md bootstrap + kibou ikonky + multi-save fix + **graceful weekly rollover**. (b) **večerní iterace**: PNG ikonky i na home HOPE kartě; bugfix `parseStreak` v vault-sync (regex `/(\d+)/` bral den z "8.6." → falešný streak 8 na Anki — teď striktně `"N dní"` + restart-markery detekuje jako reset=0); ručně smazán starý duplicit habit "Spánek 22:00–06:15" v DB + odebrán z `ALL_HABITS` fallback (re-seedoval se po každém delete); **HOPE backfill** 30 dní z deníkového frontmatteru — `scripts/backfill-hope.mjs` → `backfill-hope.sql` (Matyáš spustil v Supabase).

## ✅ Funguje (ověřeno živě)
- **Habits** — živý seznam z DB, **appka = zdroj pravdy**. Skupiny Aktivní/Testovací/Balíčky(Imunita,Fyzička)/Zautomatizováno. Odškrtnutí → zápis do Supabase, offline queue. **CRUD přímo v appce** (16.6.): edit režim (✎ v headeru) → přidat/upravit/odebrat habit přes modal (`HabitEditor`). Odebrání = soft-delete `category='retired'` (logy/streaky zůstanou). Prázdná DB = empty state. `ALL_HABITS`/`seedHabits` odstraněny.
- **Streaky** — pravdivé „X dní v řadě": denní přepočet při otevření appky, grace day (1 den odpuštěn), autoškola = mandatory (bez grace). Vault baseline (Anki=45) zachován.
- **Home** — streak hero (max), habity X/Y, HOPE dnes, **3 sekce DENNÍCH úkolů** (Hlavní + Vedlejší + Bonus) čtené z `ai_daily_brief` dnešního dne. Zdroj = denní mentor-feedback ve vaultu (ne týdenní cascade). Cascade karta ukazuje počet **týdenních** priorit zvlášť.
- **kibou** — slidery mood/energy/hope s vlastními PNG ikonkami (mood=kameny, energy=blesk, hope=All Might; všechny čtvercově paddované, transparentní pozadí). Multi-save během dne ✓ (UPSERT, ne INSERT). 30d graf.
- **Cascade** — týden (L5) a měsíc (L4) **počítá Hikari z habitů** (reálná % z DB, štítek „počítá Hikari"); rok a 5 let zatím kurátovaný „odhad".
- **AI brain / ranní cron** — `/api/cron/morning` (Vercel `0 6 * * *`) + on-demand `/api/hikari/refresh` (tlačítko „Přepočítej Hikari"). Krok 1 streaky, krok 2 cascade % (L4/L5), krok 3 kontext z DB (habits, streaky, týdenní priority, poslední HOPE, Hikari paměť), krok 4 Gemini `gemini-2.5-flash` → **jen `cascade_nudge` + `reasoning`** (denní úkoly už NEgeneruje) → upsert do `ai_daily_brief` (jen tyto 2 sloupce), log do `ai_invocations`. UTF-8/Windows fetch gotcha ošetřen (`cache: no-store` + ruční TextDecoder).
- **Denní úkoly z vaultu** — vault-sync čte `logs/mentor-feedback/(dnes−1)-feedback.md` → sekci `### Priority na zítřek` (= dnešek; soubor D = plán pro D+1). Parsuje `**Hlavní**`/`**Vedlejší**`/`**Bonus**` (`**Name** — detail`) → upsert `ai_daily_brief.{hlavni,vedlejsi,bonus}` pro dnešek (jen tyto sloupce; disjunktní s cronem). Píše Matyáš ručně + ladí s Claudem, Gemini do nich nesahá. Vyžaduje **migraci 005** (drop NOT NULL na `hlavni`).
- **Vault sync** — tlačítko na home (po úspěchu se home sám překreslí), dynamické cesty (aktuální týden/měsíc), cascade L1-L5 (L5 = full replace, ne accumulate), týdenní priority (Hlavní/Vedlejší/Bonus), denní priority z mentor-feedbacku, Memory.md bootstrap (16 H2 sekcí → hikari_memory). **Habity už NEsyncuje** (appka = pán; habits.md zůstává jako archiv, dashboard ho nečte). `ℹ️` info zprávy nehlásí chybu. **Weekly rollover ✓** — zkouší W+1, current, W-1, …, až 6 týdnů zpět.
- Google login, onboarding, PWA, CSP.

## 🧭 Co dál (priorita shora)
1. **Dotáhnout AI brain (cron jádro + denní úkoly hotové):**
   - **Detekce vzorů** ("úterý low energy", "les → +HOPE") — Gemini nad nimi reasonuje z paměti, ale není automatický pattern-detection zápis do DB.
   - **Živá energetická osa** z HOPE dat (teď statická — cron nepíše `energy_blocks`).
   - **Rok/5 let reálná %** (zatím „odhad").
2. **Drobnosti:**
   - Auto-sync cron (Ne 22:00) místo jen ručního tlačítka.
   - Energy obrázek v kibou — kdyby chtěl něco jiného než blesk.
3. **V2:** `/history` heat-mapa · **V3:** `/calculator`.

## ⚠️ Háčky / co vědět
- **Migrace 003 + 004 aplikované**. 004 = `kind`/`detail`/`sort_order` na `cascade_dimensions`. Bez ní sync běží přes fallback (insert bez nových sloupců) ale home pak nezobrazí Vedlejší/Bonus. Další migrace → říct Matyášovi ať spustí SQL v Supabase před deployem.
- **Migrace 005 — SPUSTIT v Supabase** (`ALTER TABLE ai_daily_brief ALTER COLUMN hlavni DROP NOT NULL`). Bez ní cron (který už nepíše úkoly) selže na NOT NULL při insertu řádku jen s nudge/reasoning. Po migraci ťuknout **Sync s vaultem** → načte dnešní denní úkoly.
- **CSP je jen v kódu** (`next.config.ts`). Nesmí být druhá ve Vercel dashboardu (kombinovaly by se restriktivně).
- **Týdenní priority** — Vercel server běží UTC, kolem půlnoci CEST se může lišit ISO týden o 1 oproti autorovi. Proto **rollover** zkouší 6 týdnů zpět — sync nepadne když ti chybí soubor aktuálního týdne, použije poslední existující. Layer 5 description (`weekLabelFromFile`) odráží skutečně načtený týden.
- **Streak přepočet je client-side líný** (běží při otevření appky), dokud nebude ranní cron.
- **Dashboard → vault zpětný zápis NENÍ a nemá být** v dashboardu — dělá ho Hikari přes Claude Code CLI při hlasovém deníku (Supabase = mozek, vault = archiv).
- **Pre-push hook** pouští `npm run build` — push se zablokuje když build spadne.
- Nikdy necommituj/nepushuj bez explicitní žádosti Matyáše.

## 🔑 Klíčová rozhodnutí
- **Denní úkoly = vault, ne Gemini.** Hlavní/vedlejší/bonus na home jsou DENNÍ, píše je Matyáš v `logs/mentor-feedback/` (generuje s plným kontextem, ladí s Claudem). Gemini dělá jen mentorský nudge+reasoning. Soubor D = priority pro D+1 → dnešek čte z včerejšího souboru. Týdenní priority zůstávají v `/cascade` (cascade L5).
- **Cascade %** — ✅ vyřešeno: cron počítá týden (L5) a měsíc (L4) z habitů, `/cascade` je čte z DB pro tyto vrstvy (`REAL_PCT_LAYERS`) se štítkem „počítá Hikari". Rok a 5 let zůstávají kurátovaný „odhad", dokud nebude goal-based výpočet.
- **Habits = appka je zdroj pravdy** (16.6.). CRUD přímo v appce, vault-sync habity nečte. `habits.md` zůstává jako ruční archiv, ale rozejde se s appkou (záměr). Streaky historicky uložené v `streaks_cache` zůstávají; dál je počítá cron z logů. Případný export app→vault by šel přidat později.
- **Streaky** = vault baseline + ±1 na toggle + denní reconcile (gap≥3 zlom pro běžné, gap≥2 pro mandatory).

## 🔬 Ověřovací nástroje
- `node scripts/parse-check.mjs` — parser proti **lokálnímu** vaultu (po změně formátu vaultu).
- `node scripts/live-fetch-check.mjs` — **reálný** GitHub fetch tokenem + parse (ověří sync až po DB zápis).

## 📌 Stav modulů vs PRD (W23–W27)
Hotovo: Habits, kibou, Cascade UI + reálná % týden/měsíc, Vault sync (ruční) + denní úkoly z mentor-feedbacku, login, onboarding, PWA, Home s denními úkoly, **AI brain ranní cron (W26 jádro: streaky + cascade % + Gemini nudge/reasoning)**.
Chybí: automatická detekce vzorů, živá energetická osa, konflikt workflow (CLI ↔ Supabase), auto-sync cron (Ne 22:00), /history, /calculator.
