# PROGRESS — kde jsme, co dál

> **Pro Claude:** Tohle je continuity log mezi chaty (NE projektová pravidla — ta jsou v `CLAUDE.md`).
> Na **začátku** session si ho přečti, ať navazuješ. Na **konci** session ho **aktualizuj**
> (datum, co se udělalo, co je dál). Drž ho stručný a pravdivý.

**Poslední aktualizace:** 2026-06-17 (session 4)

---

## ✅ VYŘEŠENO tuto session (17.6. session 4)

**1. Migrace 005 spuštěna** — `ai_daily_brief.hlavni` už není NOT NULL. Ranní cron může vložit řádek jen s nudge/reasoning bez pádu.

**0. Odškrtávání denních úkolů na home (klik → přeškrtne + zešedne).** Klik na hlavní/vedlejší/bonus úkol → `line-through` + opacity 0.5 (decentní, barva zůstává), optimisticky + revert při chybě. Stav v `ai_daily_brief.done_keys text[]` (klíče `hlavni-0`/`vedlejsi-1`/`bonus-0`) — **vyžaduje migraci 006**. Sloupec sync ani cron nepřepisují (disjunktní upsert) → přežije Sync. Endpoint `POST /api/hikari/task-toggle`. Home čte `done_keys` zvlášť (defenzivně — bez migrace degraduje na „nic přeškrtnuté", nerozbije úkoly). **Gemini čte včerejší splnění** — ranní cron `summarizeYesterdayTasks` → „Včera splněno: hlavní 2/3 …, nesplněné hlavní: X" do brief promptu.

**2. Cascade milníková % přes Gemini — POSTAVENO (on-demand).**
- **Co:** Gemini odhaduje % u jednotlivých milníků L3 (rok) / L4 (měsíc) / L5 (týden) + celkové layer-% pro L2 (5 let) a L3 (rok). Náhrada za hardcoded odhady.
- **Kde:** nová `calcMilestonePct` v `lib/hikari-brain.ts`. Běží **JEN přes tlačítko „Přepočítej Hikari"** (`runMorningCron(..., withMilestones=true)`), ranní cron 6:00 ji NESPOUŠTÍ (milníky se mění pomalu, je to těžší call). Rozhodnutí Matyáše: on-demand + kontext = dashboard data + poslední feedbacky.
- **Kontext pro Gemini (`gatherVaultState`, 17.6 upgrade):** místo „posledních 5 feedbacků" skládá **aktuální skutečný stav z hierarchie reviewů** vaultu, ohraničeně (~5–7 souborů): (1) **plán** aktuálního měsíce+týdne (cíle), (2) poslední **DOKONČENÁ** měsíční review (krok zpět přes plan-only — detekce přes marker „vyplnit na konci"), (3) dokončené **týdenní** reviews po konci toho měsíce, (4) denní **feedbacky** po konci posledního týdne. Rok potřebuje měsíce+týdny+dny = nadmnožina pro měsíc/týden → jedna skládačka obslouží vše. Plus habits/streaky/týden-měsíc %/HOPE/paměť. Prompt analytický (temp 0.3). Vrací `{milestones:{m0..mN}, layer_5let}`.
- **Sdíleno s denním briefem:** `gatherVaultState` běží v `runMorningCron` jednou a krmí i `callGemini` (ranní nudge/reasoning teď zná skutečný stav z reviewů). Cena: ranní cron 6:00 dělá ~5–7 GitHub fetchů denně (degraduje na '' bez tokenu/při chybě).
- **Zápis:** `cascade_dimensions.progress_pct` per milník (match přes klíč m→id). **Layer-% L3/L4/L5 = průměr milníkových %** (top-číslo sedí s bary pod ním), **L2 (5 let) = Gemini holisticky** (`layer_5let`). Clamp 0–100. Log do `ai_invocations` (purpose `cascade_milestones`).
- **DŮLEŽITÉ — týden/měsíc % UŽ NEJSOU z habitů** (rozhodnutí 17.6.): ranní cron přestal psát habit-% do L4/L5 `progress_pct` (přepisoval by Gemini). `calcCascadePct` zůstal, ale slouží jen jako **vstup do Gemini promptu** + napájí **živý štítek „habity tento týden/měsíc: X%"** na L4/L5 kartách (počítá se klientsky na `/cascade` přes sdílený `lib/cascade-pct.ts` — `isoMondayOf`/`elapsedDays`/`adherencePct`, stejná matika jako server). Takže top-% = milníky (Gemini, tlačítkem), habit-% = živý vedlejší signál.
- **Refaktor:** sdílený `geminiGenerate` (fetch+retry+UTF-8 decode) — používá ho brief i milníky (DRY).
- **Stránka (`cascade/page.tsx`):** čte `progress_pct` dimenzí → `VaultDimRow` ukazuje % + tenký bar (jen když >0; před prvním výpočtem je vše 0 → čistý seznam jako dřív). L2/L3 layer-% z DB když >0, jinak kurátovaný odhad. Notice text rozlišuje 3 stavy (Gemini milníky / jen habit % / odhad).
- Build + lint čisté (mé soubory; ostatní lint errory pre-existing).

---

## ✅ VYŘEŠENO dříve (16.6. session 3)

**1. Anki streak ukazoval špatně (1 místo 3) — OPRAVENO.**
- Příčina byla architektonická, ne chybějící data. Logy v `habit_logs` byly správně (3denní run), ale klientská logika streak jen **lámala na 0** (`reconcileStreaks`) a inkrementovala `±1` (`bumpStreak`) — nikdy ho nepostavila zpět z logů. Cache se tím rozjela od reality.
- **Oprava:** sdílené čisté jádro `lib/streak-core.ts` (`streakFromDates`) používá cron i klient. Nový `rebuildStreaksFromLogs` (`lib/streak.ts`) přestaví streak z `habit_logs` při každém načtení `/habits` (self-healing, `best_streak` zachován přes max). `reconcileStreaks` + mrtvý `rebuildStreak` odstraněny. Cron (`hikari-brain.ts`) teď importuje jádro místo lokální kopie.
- DB jednorázově opravena (`scripts/streak-apply.mjs`): Anki=3 (best 46), Kytara=5. Dry-run (`scripts/streak-dryrun.mjs`) ukázal žádné regrese.

**2. Auto-commit/push hook — ZDOKUMENTOVÁN.**
- `.claude/settings.json` má PostToolUse hook: po každém Edit/Write `git add . && git commit "auto: save changes" && git push`. **Vše se commituje + pushuje + přes Vercel nasazuje automaticky** (GitHub → Vercel → Supabase). Zaneseno do `hikari-dashboard/CLAUDE.md` a sekce Háčky níž.

**3. Cascade milníky — teď ŽIVĚ Z VAULTU (dřív hardcoded) + UI fixy.**
- Příčina: `/cascade` vykreslovala milníky napevno z konstanty `LAYERS`, z DB brala jen layer-% a popisek. Synced `cascade_dimensions` se vůbec nečetly → L4/L5 ukazovaly stará data. Starý sync navíc dimenze jen **přidával** (nános duplikátů).
- **Sync (`vault-sync/route.ts`):** full-refresh dimenzí teď i pro L3 (rok) a L4 (měsíc) — `replaceDimensions` (smaže+vloží) + parsery `parseMonthlyMilestones` (číslované SEN milníky, jen `^\d+\.` řádky — ne pod-odrážky) a `parseYearlyDimensions` (tabulka Dimenze/Milník). `cleanDetail` strhne wikilinky/závorky. L5 už full-refresh měl. Rolování na nový měsíc/týden/rok automaticky.
- **Stránka (`cascade/page.tsx`):** čte `cascade_dimensions` z DB pro `VAULT_DIM_LAYERS={3,4,5}` → čistý seznam **jmen + oříznutý detail, BEZ per-milník %** (`VaultDimList`/`VaultDimRow`). L1 chips + L2 zůstávají kurátované v `LAYERS`.
- **UI fixy:** `minWidth:0` na wrapperu karty → dlouhé detaily se oříznou (…) místo roztažení karty; všechny karty stejně široké. **L5 rozděleno na Hlavní/Vedlejší/Bonus** (z `kind` v DB).
- DB pročištěna reálným syncem (`scripts/cascade-sync-apply.mjs`, ověřeno `scripts/cascade-check.mjs`): zmizely duplikáty (2× Příjem, 2× B1) a ošklivé „Fyzička (START po uzdravení):". Reálná route byla správně, chyba byla jen v jednorázovém skriptu (`itemLines` bral pod-odrážky) — opraveno.

---

## 🎯 Kde teď jsme
Dashboard reálně slouží svému účelu: **ráno na mobilu vidíš co dělat + odškrtáváš habity, bez notebooku a Obsidianu.** Celý řetězec `vault (Obsidian / Claude Code) → GitHub → Sync → Supabase → mobil` byl **živě ověřen** Matyášem 2026-06-02. **AI brain / ranní cron (PRD W26) je postavený** — `/api/cron/morning` (Vercel `0 6 * * *`) přepočítá streaky, cascade % (L4/L5 z habitů) a vygeneruje denní Gemini brief → cache do `ai_daily_brief`. Home zobrazuje brief (nudge + reasoning), cascade už čte reálná % z DB. Tlačítko „Přepočítej Hikari" re-runne stejný cron on-demand (`/api/hikari/refresh`). **16.6. večer: denní úkoly (hlavní/vedlejší/bonus) přepnuty na vault** — místo týdenní cascade je teď home čte z denního mentor-feedbacku (viz níže), Gemini je už negeneruje.

Dřívější milníky: 9.6. session — (a) oprava sync na nový W24 formát + Memory.md bootstrap + kibou ikonky + multi-save fix + **graceful weekly rollover**. (b) **večerní iterace**: PNG ikonky i na home HOPE kartě; bugfix `parseStreak` v vault-sync (regex `/(\d+)/` bral den z "8.6." → falešný streak 8 na Anki — teď striktně `"N dní"` + restart-markery detekuje jako reset=0); ručně smazán starý duplicit habit "Spánek 22:00–06:15" v DB + odebrán z `ALL_HABITS` fallback (re-seedoval se po každém delete); **HOPE backfill** 30 dní z deníkového frontmatteru — `scripts/backfill-hope.mjs` → `backfill-hope.sql` (Matyáš spustil v Supabase).

## ✅ Funguje (ověřeno živě)
- **Habits** — živý seznam z DB, **appka = zdroj pravdy**. Skupiny Aktivní/Testovací/Balíčky(Imunita,Fyzička)/Zautomatizováno. Odškrtnutí → zápis do Supabase, offline queue. **CRUD přímo v appce** (16.6.): edit režim (✎ v headeru) → přidat/upravit/odebrat habit přes modal (`HabitEditor`). Odebrání = soft-delete `category='retired'` (logy/streaky zůstanou). Prázdná DB = empty state. `ALL_HABITS`/`seedHabits` odstraněny.
- **Streaky** — pravdivé „X dní v řadě": **přestavba z `habit_logs` při otevření `/habits`** (`rebuildStreaksFromLogs`, self-healing) i v ranním cronu — oba sdílí `lib/streak-core.ts`. `bumpStreak` jen okamžité ±1 na toggle. Grace day (1 den odpuštěn), autoškola = mandatory (bez grace). `best_streak` (Anki=46) zachován přes max().
- **Home** — streak hero (max), habity X/Y, HOPE dnes, **3 sekce DENNÍCH úkolů** (Hlavní + Vedlejší + Bonus) čtené z `ai_daily_brief` dnešního dne. Zdroj = denní mentor-feedback ve vaultu (ne týdenní cascade). Cascade karta ukazuje počet **týdenních** priorit zvlášť.
- **kibou** — slidery mood/energy/hope s vlastními PNG ikonkami (mood=kameny, energy=blesk, hope=All Might; všechny čtvercově paddované, transparentní pozadí). Multi-save během dne ✓ (UPSERT, ne INSERT). 30d graf.
- **Cascade** — **layer-% L2–L5 odhaduje Gemini** on-demand přes „Přepočítej Hikari" (17.6. session 4): L3/L4/L5 = průměr milníkových %, L2 = holisticky. Milníky L3/L4/L5 ukazují % + bar (`VaultDimRow`, když >0), čtou se živě z DB (z vaultu), rolují se při syncu. L4/L5 navíc mají **živý štítek „habity X%"** (klientský výpočet z odškrtávání). Před prvním Gemini výpočtem = kurátovaný odhad. L1 chips + L2 dimenze kurátované.
- **AI brain / ranní cron** — `/api/cron/morning` (Vercel `0 6 * * *`) + on-demand `/api/hikari/refresh` (tlačítko „Přepočítej Hikari"). Krok 1 streaky, krok 2 cascade % (L4/L5), krok 3 kontext z DB (habits, streaky, týdenní priority, poslední HOPE, Hikari paměť), krok 4 Gemini `gemini-2.5-flash` → **jen `cascade_nudge` + `reasoning`** (denní úkoly už NEgeneruje) → upsert do `ai_daily_brief` (jen tyto 2 sloupce), log do `ai_invocations`. UTF-8/Windows fetch gotcha ošetřen (`cache: no-store` + ruční TextDecoder).
- **Denní úkoly z vaultu** — vault-sync čte `logs/mentor-feedback/(dnes−1)-feedback.md` → sekci `### Priority na zítřek` (= dnešek; soubor D = plán pro D+1). Parsuje `**Hlavní**`/`**Vedlejší**`/`**Bonus**` (`**Name** — detail`) → upsert `ai_daily_brief.{hlavni,vedlejsi,bonus}` pro dnešek (jen tyto sloupce; disjunktní s cronem). Píše Matyáš ručně + ladí s Claudem, Gemini do nich nesahá. Vyžaduje **migraci 005** (drop NOT NULL na `hlavni`).
- **Vault sync** — tlačítko na home (po úspěchu se home sám překreslí), dynamické cesty (aktuální týden/měsíc), cascade L1-L5 (**L3/L4/L5 = full replace** z vaultu, ne accumulate; L1/L2 insert-only), týdenní priority (Hlavní/Vedlejší/Bonus), denní priority z mentor-feedbacku, Memory.md bootstrap (16 H2 sekcí → hikari_memory). **Habity už NEsyncuje** (appka = pán; habits.md zůstává jako archiv, dashboard ho nečte). `ℹ️` info zprávy nehlásí chybu. **Weekly rollover ✓** — zkouší W+1, current, W-1, …, až 6 týdnů zpět.
- Google login, onboarding, PWA, CSP.

## 🧭 Co dál (priorita shora)
1. **Dotáhnout AI brain (cron jádro + denní úkoly hotové):**
   - **Detekce vzorů** ("úterý low energy", "les → +HOPE") — Gemini nad nimi reasonuje z paměti, ale není automatický pattern-detection zápis do DB.
   - **Živá energetická osa** z HOPE dat (teď statická — cron nepíše `energy_blocks`).
   - ~~**Cascade milníková % přes Gemini**~~ ✅ HOTOVO 17.6. (on-demand tlačítkem, viz session 4). Možné dotažení: rozšířit kontext o deníky (teď jen feedbacky), nebo přidat L2 per-dim % (teď L2 jen layer-%, dimenze kurátované v UI).
2. **Drobnosti:**
   - Auto-sync cron (Ne 22:00) místo jen ručního tlačítka.
   - Energy obrázek v kibou — kdyby chtěl něco jiného než blesk.
3. **V2:** `/history` heat-mapa · **V3:** `/calculator`.

## ⚠️ Háčky / co vědět
- **Migrace 003 + 004 aplikované**. 004 = `kind`/`detail`/`sort_order` na `cascade_dimensions`. Bez ní sync běží přes fallback (insert bez nových sloupců) ale home pak nezobrazí Vedlejší/Bonus. Další migrace → říct Matyášovi ať spustí SQL v Supabase před deployem.
- **Migrace 006 — SPUSTIT v Supabase** (`ALTER TABLE ai_daily_brief ADD COLUMN IF NOT EXISTS done_keys TEXT[] NOT NULL DEFAULT '{}'`). Bez ní odškrtávání denních úkolů na home tiše nefunguje (klik se vrátí zpět). Vše ostatní funguje dál.
- **Migrace 003 + 004 + 005 aplikované.** 005 = `ALTER TABLE ai_daily_brief ALTER COLUMN hlavni DROP NOT NULL` (spuštěno 17.6.) — cron teď může vložit řádek jen s nudge/reasoning. Po ní ťuknout **Sync s vaultem** → načte dnešní denní úkoly.
- **CSP je jen v kódu** (`next.config.ts`). Nesmí být druhá ve Vercel dashboardu (kombinovaly by se restriktivně).
- **Týdenní priority** — Vercel server běží UTC, kolem půlnoci CEST se může lišit ISO týden o 1 oproti autorovi. Proto **rollover** zkouší 6 týdnů zpět — sync nepadne když ti chybí soubor aktuálního týdne, použije poslední existující. Layer 5 description (`weekLabelFromFile`) odráží skutečně načtený týden.
- **Streak se přestaví z `habit_logs` při otevření `/habits`** (`rebuildStreaksFromLogs`, self-healing) + v ranním cronu — oba sdílí `lib/streak-core.ts`. `bumpStreak` dělá jen okamžité `±1` při toggle, autoritativní hodnota je rebuild.
- **Dashboard → vault zpětný zápis NENÍ a nemá být** v dashboardu — dělá ho Hikari přes Claude Code CLI při hlasovém deníku (Supabase = mozek, vault = archiv).
- **Pre-push hook** pouští `npm run build` — push se zablokuje když build spadne.
- **Auto-commit/push hook (`.claude/settings.json`)** — po každém Edit/Write se automaticky `git add . && commit "auto: save changes" && push`. Vše tedituješ = jde rovnou do produkce přes Vercel (GitHub → Vercel → Supabase). Necommituj ručně.

## 🔑 Klíčová rozhodnutí
- **Denní úkoly = vault, ne Gemini.** Hlavní/vedlejší/bonus na home jsou DENNÍ, píše je Matyáš v `logs/mentor-feedback/` (generuje s plným kontextem, ladí s Claudem). Gemini dělá jen mentorský nudge+reasoning. Soubor D = priority pro D+1 → dnešek čte z včerejšího souboru. Týdenní priority zůstávají v `/cascade` (cascade L5).
- **Cascade %** — ✅ vyřešeno (17.6.): **všechna layer-% L2–L5 + milníková % L3/L4/L5 odhaduje Gemini** on-demand (tlačítko). L3/L4/L5 layer = průměr milníků, L2 holisticky. **Týden/měsíc UŽ NEJSOU z habitů** — habit-% je teď jen vstup pro Gemini + živý štítek „habity X%". Rozhodnutí: konzistence (top-% sedí s bary) > denní čerstvost top-čísla. `REAL_PCT_LAYERS` odstraněn, gating sjednocen na „použij DB když >0".
- **Cascade milníky = z vaultu, ne hardcoded** (16.6. session 3). `/cascade` čte `cascade_dimensions` z DB pro L3/L4/L5 (`VAULT_DIM_LAYERS`) → čistý seznam jmen+detail **bez per-milník %** (to bude počítat Gemini, viz Co dál). Sync je full-refreshuje (`replaceDimensions` pro L3/L4/L5, parsery `parseMonthlyMilestones`/`parseYearlyDimensions`/weekly priority) → rolování na nový měsíc/týden/rok automaticky. L1 chips + L2 (5 let) zůstávají kurátované v `LAYERS` (L2 se nastaví jednorázově přes chat). Ověřovák: `scripts/cascade-check.mjs`.
- **Habits = appka je zdroj pravdy** (16.6.). CRUD přímo v appce, vault-sync habity nečte. `habits.md` zůstává jako ruční archiv, ale rozejde se s appkou (záměr). Streaky historicky uložené v `streaks_cache` zůstávají; dál je počítá cron z logů. Případný export app→vault by šel přidat později.
- **Streaky** = vault baseline + ±1 na toggle + denní reconcile (gap≥3 zlom pro běžné, gap≥2 pro mandatory).

## 🔬 Ověřovací nástroje
- `node scripts/parse-check.mjs` — parser proti **lokálnímu** vaultu (po změně formátu vaultu).
- `node scripts/live-fetch-check.mjs` — **reálný** GitHub fetch tokenem + parse (ověří sync až po DB zápis).
- `node scripts/cascade-check.mjs` — L3/L4 cascade parsery proti lokálnímu vaultu (jméno+detail milníků).
- `node scripts/cascade-sync-apply.mjs` — jednorázově spustí reálný full-refresh cascade L3/L4/L5 (GitHub fetch + service key) — pro pročištění/re-apply mimo appku.
- `node scripts/streak-dryrun.mjs` — porovná `current_streak` v cache vs. přepočet z logů (nic nezapisuje).
- `node scripts/streak-apply.mjs` — jednorázově přepočítá streaky z logů a zapíše do `streaks_cache` (best zachová).
- `node scripts/check-anki.mjs` — diagnostika konkrétního habitu (Anki): habits + streaks_cache + posledních ~15 logů.

## 📌 Stav modulů vs PRD (W23–W27)
Hotovo: Habits, kibou, Cascade UI + reálná % týden/měsíc, Vault sync (ruční) + denní úkoly z mentor-feedbacku, login, onboarding, PWA, Home s denními úkoly, **AI brain ranní cron (W26 jádro: streaky + cascade % + Gemini nudge/reasoning)**.
Chybí: automatická detekce vzorů, živá energetická osa, konflikt workflow (CLI ↔ Supabase), auto-sync cron (Ne 22:00), /history, /calculator.
