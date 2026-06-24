# PROGRESS — kde jsme, co dál

> **Pro Claude:** Tohle je continuity log mezi chaty (NE projektová pravidla — ta jsou v `CLAUDE.md`).
> Na **začátku** session si ho přečti, ať navazuješ. Na **konci** session ho **aktualizuj**
> (datum, co se udělalo, co je dál). Drž ho stručný a pravdivý.

**Poslední aktualizace:** 2026-06-24 (session 13)

---

## ✅ VYŘEŠENO tuto session (24.6. session 13)

**Intraday HOPE check-iny → energetické oblouky dne + korelace aktivit — POSTAVENO.** (Nápad Matyáše: energie/nálada se mění v průběhu dne — ráno jinak, po škole jinak, večer. Chtěl zadávat きぼう vícekrát denně s časem a poznámkou + vidět HOPE jako křivku přes den + korelovat „les → +energie".)
- **Rozhodnutí Matyáše (24.6.):** (1) **každé uložení = check-in v čase** — žádné přepisování, denní číslo se dopočítá průměrem; (2) **jen volná poznámka** (žádné chip-y); (3) **postavit rovnou vše** (capture + křivka + korelace + učící se osa).
- **Migrace 010 `hope_checkins`** (⚠️ Matyáš musí spustit v Supabase před použitím): víc řádků/den, `ts timestamptz`, `mood/energy/hope`, `note`, `activity_tag` (plní cron). **NE** UNIQUE(profile_id,date) — to je celý smysl. Partial index na neotagované poznámky (fronta pro tag extrakci).
- **`hope_logs` zůstává denní ROLLUP** — `/kibou` po každém check-inu přepočítá průměr dne a upsertne do `hope_logs`. Takže 30d trend, průměry, energetická osa, detekce vzorů jedou **beze změny** (nesahal jsem na ně).
- **`/kibou` (`app/kibou/page.tsx`) přepsáno:** tlačítko „Zaznamenat teď" (append check-in + rollup), **křivka dne** (osa X = čas 6–22h, tečky v reálných časech, tooltip s poznámkou) + **day stepper** (‹ Dnes ›, listování minulými oblouky, budoucnost zamčená) + seznam check-inů (čas · poznámka) + sekce **„Co ti hýbe energií"** (korelace z `hope_correlations`, diverging bar ±energie). Graceful: před migrací prázdné stavy, nepadá.
- **`calcHopeCorrelations` (`lib/hikari-brain.ts`, krok 7 v `runMorningCron`):** hybrid jako detekce vzorů. (1) **Gemini** znormalizuje volné poznámky → 1 aktivitní tag (cache zpět na řádek; bez aktivity → sentinel `—`, neptá se znovu). (2) **Kód** spočítá delty mezi po sobě jdoucími check-iny v rámci dne, přiřadí pozdějšímu (jeho poznámka popisuje co se dělo) → agreguje per tag → upsert `hope_correlations` (existující tabulka od 001). Gemini volá JEN když jsou nové neotagované poznámky. MIN_SAMPLES=2. Log `ai_invocations` purpose `hope_correlations`.
- **`calcEnergyBlocks` upgrade — osa se UČÍ reálný tvar:** dřív čistě syntetický `BASE_CURVE` × denní škála. Teď bucketuje check-iny podle **Prague-lokálního (den, blok)** (`praguePartsOf` přes Intl, kvůli UTC serveru) — blok s ≥3 reálnými vzorky bere naměřený průměr (absolutní práh high≥6.5/mid≥4.0), jinak fallback na syntetiku. `realBlocks` v návratu. Degraduje na syntetiku-only před migrací (try/catch nad fetchem check-inů).
- **Ověřovák `scripts/check-checkins.mjs`** (check-iny + fronta tagů + dnešní oblouk + reálné vs syntetické bloky + korelace). NIC nezapisuje. Build + TS čisté.
- **Projeví se** až: spustit migraci 010 → zaznamenávat na `/kibou` během dne s poznámkami → křivka dne hned; korelace + učící se osa po ranním cronu (nebo „Přepočítej Hikari"). Korelace prázdné dokud nebude pár dní check-inů s poznámkami.
- **Zbývá (volitelné, příště):** korelace na home („dnes tě zvedlo X"); víc metrik v korelaci (teď řadím podle energie); přiřazení aktivity i ku check-inu PŘED ní (teď jen po). 

---

## ✅ VYŘEŠENO dříve (23.6. session 12)

**Auto-retire habits (PRD §7.2 / V2) — POSTAVENO.** Habit s uplynulým `end_date` se sám archivuje (= totéž co tlačítko smazat: `category='retired'`, logy + streaky zůstanou, jen zmizí ze všech zobrazení).
- **Kde:** nová `autoRetireHabits(db, pid, today)` v `lib/hikari-brain.ts`, zapojená jako **krok 0 v `runMorningCron`** (běží před streaky i před stavbou Gemini kontextu — vše po něm `retired` přirozeně filtruje, takže archivovaný habit hned vypadne ze streaků i briefu). Běží v ranním cronu 6:00 i na tlačítko „Přepočítej Hikari".
- **Podmínka:** `end_date < dnes` (end_date = poslední aktivní den → archiv až po jeho uplynutí). Zapisuje `category='retired'` + **`retired_on=dnes`** + `retired_reason='auto: end_date uplynul'` (sloupce existují od 001, žádná migrace).
- **Rozsah — JEN `end_date`, NE `trial_end`.** `trial_end` patřil ke zrušenému (18.6.) hodnocení balíčků; tiché archivování trialu by mohlo zahodit habit, který chceš povýšit. (Pozn.: habity balíčku Imunita mají v DB nastavené `end_date`, ne `trial_end` — takže je auto-retire zachytí.)
- **Dopad ověřen** (`scripts/check-autoretire.mjs`, suchý běh proti DB, nic nezapisuje): teď (23.6.) by se nearchivovalo nic; **1.7. se auto-archivují 4 Imunita habity** (Probiotika, 2 L vody, Větrat ložnici, Omega-3 — všechny `end_date` 30.6.). Autoškola `end_date` nastavené NEMÁ → sama se nearchivuje.
- **Háček vyřešen:** ruční `retireHabit` (`/habits`) historicky `retired_on` nevyplňoval (jen `category`). Auto-retire ho teď píše — víš, kdy a proč se co archivovalo.
- **CronResult** má nově pole `autoRetire: {retired, names, errors}`. Build + TS čisté.

**Cascade datová kotva — aktuální příjem (PRD §6.3 / V2 „datové kotvy") — POSTAVENO.** Gemini dřív skóroval příjmové milníky (L2/L3 „500 Kč/měs", „500 Kč/h", „30k/50k") **naslepo** — nic mu neřeklo, kolik Matyáš reálně vydělává (teď ~0, B1 nevybráno). Teď má tvrdou kotvu.
- **Migrace 009 `income_snapshots`** (⚠️ Matyáš musí spustit v Supabase před použitím): append-only snapshoty `{date, monthly_income_kc, hourly_rate_kc, total_earned_kc, note}`. Append, ne upsert → drží trajektorii v čase (využije i „Zlepšení za měsíc"). Vlastní tabulka, **NE** doména F (`revenue_trajectory` = byznys modul Fáze 2, per-produkt MRR).
- **Vstup = dashboard UI** (rozhodnutí Matyáše 23.6.): komponenta `IncomeAnchorCard` na `/cascade` (pod timeline). Zobrazí poslední snapshot (3 čísla + datum), tlačítko Zadat/Aktualizovat → formulář (měsíčně/hodinovka/celkem/pozn.) → INSERT nového snapshotu. Samostatná (vlastní fetch profilu), append-only.
- **Napojení na Gemini:** `calcMilestonePct` (on-demand „Přepočítej Hikari") fetchuje poslední snapshot a vkládá do promptu sekci „AKTUÁLNÍ PŘÍJEM" v TVRDÁ DATA. Když snapshot není → explicitní instrukce „NEODHADUJ příjem nahoru, drž příjmové milníky ~0" (Gemini si nevymyslí číslo).
- **Ověřovák `scripts/check-income.mjs`** (výpis snapshotů + co půjde do promptu). Build + TS čisté.
- **Projeví se** až: spustit migraci 009 → zadat příjem na `/cascade` → „Přepočítej Hikari" (Gemini přeskóruje příjmové milníky s reálným číslem). Dokud je vše 0, příjmové milníky zůstanou nízko (správně).
- **Zbývá z „datových kotev"** (volitelné, příště): fyzička čísla (shyby/běh/kolo) + JLPT/počet Anki karet jako další kotvy stejným způsobem; tvrdý clamp kadencových týdenních milníků; „potvrdit milník" UI.

---

## ✅ VYŘEŠENO dříve (22.6. session 11)

**Cascade audit + oprava nereálných % (A+B+C) — POSTAVENO.** (Matyáš si všiml: 5 let 45 %, v pondělí „autoškola testy 90 %", celý týden 64 % — „to je moc".)
- **A — L3 (Rok) byla MRTVÁ vrstva.** DB měla pro L3 **0 milníků**. Příčina: 21.6. jsi ve vaultu přesunul roční cíl ze `sen.md` (`## Roční cíl`, teď jen odkaz) do **`wiki/reviews/yearly/2027.md`** (`### Dimenze a milníky` + příjem `### Milníky`). Sync to nevěděl → `replaceDimensions` mazal a nic nevkládal → L3 % zaseklé na 18 (Gemini ho nepřepočítal, neměl co průměrovat). **Fix (`vault-sync/route.ts`):** nový `FILES.yearly` (`YEARLY_TARGET_YEAR='2027'` konstanta — **ruční bump po 1.9.2027**, nebo později auto-derive z deadlinu), L3 parse čte yearly soubor. Ověřeno dry-runem: vrací 11 dimenzí (10 + Příjem).
- **B — L2 (5 let) zařazena mezi živé Gemini-skórované vrstvy** (dřív jediná „mimo"). Sync přepnut z `insertNewDimensions` na **`replaceDimensions`** (konec 9 duplicit — 2× Příjem, junk „Otevřené dimenze") + **filtr neměřitelných H3** (`místo (branch`, `otevřené dimenze` přidány do `h3Names` skip). `lib/hikari-brain.ts`: **`PER_DIM={2,3,4,5}`** → Gemini skóruje i L2 dimenze, **layer % = průměr milníků** (konec holistického `layer_5let`, který nesedělo s bary ~8 %). `cascade/page.tsx`: **`VAULT_DIM_LAYERS={2,3,4,5}`** → L2 živě z DB. Kurátované L2 dimenze v `LAYERS` zůstávají jen jako pre-Gemini fallback. Ověřeno: L2 = 6 čistých dimenzí.
- **C — Týdenní/měsíční % zná ČASOVOU OSU.** `calcMilestonePct` prompt teď dostává den v týdnu + **% uplynulého týdne i měsíce** + zbývající dny. Instrukce: spočítat % REÁLNĚ k cíli kombinací (1) co je hotovo + (2) časové osy. **Kadencové milníky** (testy 5×/den) = cíl je celý týden (7×) → v pondělí NEMŮŽE být 90 %. **Jednorázové/připravenostní** (jízdy, počet karet) = připravenost vůči cíli, může být vysoká i brzy. Cíl: „v polovině" = opravdu ~50 %.
- **Rollup do vyšších vrstev:** prompt instruuje, že při skórování L2/L3 milníků má Gemini brát pokrok NIŽŠÍCH vrstev (L4/L5) jako důkaz trajektorie (rozhodnutí Matyáše).
- **Build + TS čisté.** Parsery ověřené dry-runem proti reálnému vaultu. Přidán `scripts/check-cascade-state.mjs` (živý stav cascade layerů + dimenzí + % + invokací). Žádná migrace.
- **Projeví se** až: **Sync s vaultem** (natáhne čisté L2/L3, vynuluje % na 0) → **Přepočítej Hikari** (Gemini přeskóruje s časovou osou). Pořadí důležité.
- **⚠️ KLÍČOVÝ insight Matyáše (22.6.):** cascade % budou reálná teprve s **víc a kvalitnějšími daty**. Hlavní mezera: **chybí zdroj aktuálního příjmu** (kolik teď reálně vydělává) → příjmové milníky (L2/L3 „Příjem · B1+B2", „500 Kč/měs") Gemini odhaduje **naslepo**. Bez tvrdých vstupů budou některé dimenze sedět a jiné ne. **Co dál pro cascade:** přidat strukturovaný vstup aktuálního příjmu + další tvrdá data (JLPT/karty počty, fyzička čísla z [[2027]] „měřitelnost") jako kotvy pro Gemini. Až pak bude % konzistentně reálné. (Dnešní stav: „reálnější než předtím", ne hotové.)
- **Nabídnuto, NEuděláno** (kandidáti na příště): tvrdý strop/clamp pro kadencové týdenní milníky (deterministická pojistka nad promptem, kdyby Gemini přestřelil); detaily L2 dimenzí (teď jen názvy bez popisku); `YEARLY_TARGET_YEAR` auto-derive z deadlinu; „potvrdit milník" UI (PRD: velké milníky autoškola/DofE potvrdí Matyáš ručně).

---

## ✅ VYŘEŠENO dříve (22.6. session 10)

**Auto-sync z vaultu — POSTAVENO, zřetězeno do ranního cronu (PRD V2 „Auto-sync z vaultu").**
- **Smysl:** odpadá ruční ťukání na „Sync s vaultem" — data z vaultu se natáhnou sama každé ráno před tím, než nad nimi Gemini přemýšlí.
- **Refactor (`app/api/vault-sync/route.ts`):** jádro syncu vytaženo do **`runVaultSync(db, pid, token)`** — auth-free, vrací `{synced, files, errors, timestamp}`. POST (tlačítko „Sync s vaultem") si nechal cookie-auth, vyřeší usera/profil a deleguje. Žádná změna chování tlačítka.
- **Zřetězení (rozhodnutí Matyáše 22.6.):** místo druhého samostatného cronu **ranní cron `/api/cron/morning` (denně 6:00 UTC) teď dělá obojí v jednom běhu, v zaručeném pořadí:** pro každý profil (1) `runVaultSync` → čerstvá data, (2) `runMorningCron` → Gemini brief nad nimi. Proč zřetězit a ne 2 crony: na **Vercel Hobby plánu se crony nespouští na přesnou minutu** (drift v rámci hodiny) → dva oddělené crony negarantují pořadí. Zřetězení běží za sebou v jednom procesu = 100% jistota, že sync doběhne před mozkem.
- **Odolnost:** sync failure (GitHub výpadek) se zaloguje ale **neblokuje brain** (degraduje na to, co už v Supabase je). Bez `GITHUB_TOKEN` se sync přeskočí (`skipped`), brain běží dál. Výsledek cronu je teď per profil `{ vaultSync:{...}, brain:{...} }`.
- **`/api/cron/vault-sync`** route existuje (service-key, projde profily, `CRON_SECRET` auth) ale **už NENÍ ve `vercel.json` schedule** — nechána jen jako ruční „sync všech profilů" přes curl. `vercel.json` má teď jediný cron (`/api/cron/morning` `0 6 * * *`).
- **Žádná migrace.** Build + TS čisté, obě cron routy ve výpisu.
- **Pozn. k času:** `0 6 * * *` = 6:00 UTC = 8:00 Praha (léto). DST: v zimě 7:00 Praha. Cron expression je UTC, nejde mít napevno lokální čas celý rok.

---

## ✅ VYŘEŠENO dříve (19.6. session 9)

**Speaking feedback na home („Hikari dnes" 3. blok) — POSTAVENO.** (Matyášův nápad z 16.+18.6.: *„těžké si pamatovat speaking úkoly přes den; vidět je vícekrát = lepší"*.)
- **Co:** karta „Hikari dnes" má nově **třetí blok „🗣 Řeč dnes"** (pod nudge + reasoning, v rozkliknutém stavu): (1) **filler slova k hlídání + počty** (chip-y, např. `jo ~55× · eh ~32× · jako ~22×`) a (2) **principy do běžné mluvy** (odrážky z „3 body ke zlepšení", např. „místo jo na konci věty → pauza"). 
- **Rozhodnutí Matyáše (obsah):** NE cvičení co vyžadují mluvit/nahrávat něco navíc („nahraj 5 vět") — JEN principy aplikovatelné rovnou v mluvě + slova co říká moc a jak často. Proto zdroj principů = **`### 3 body ke zlepšení`** (jsou to principy/pozorování, ne úkoly), NE `### 3 cvičení` (tam jsou i „nahraj" tasky). Slova = **`### Filler words`**.
- **Zdroj dat:** sekce **Řečnický feedback** v `logs/mentor-feedback/YYYY-MM-DD-feedback.md` — **ten samý včerejší soubor** (`isoDaysAgo(1)`), ze kterého už sync tahá denní úkoly. Žádný fetch navíc, žádný AI call. Časování: soubor ze dne D rozebírá mluvu z D a jeho principy jsou míněné „po příštím záznamu" → home je zobrazí D+1 = přesně den aplikace.
- **Parser (`parseSpeaking` + helpery v `app/api/vault-sync/route.ts`):** robustní na nekonzistentní formát — **filler sekce je někdy tabulka (18.6, 08.6), jindy próza (17/16/13)**. `parseFillers` zkusí `mdTable` (klíče filler/počet|odhad/trend), pak fallback regex na `` `token` (~N×) `` přes tabulku i prózu, pak poslední fallback = jen quoted tokeny bez počtu. Dedup, řazení podle počtu desc, cap 3. Filtruje tracked sprosté slovo `do p*****` a počet 0. Nadpis „Řečnický feedback" matchne H1 i H2 (liší se napříč soubory), pod-sekce H2–H4. `parsePrinciples` = číslovaný seznam z „3 body", strip bold/backtick, cap 3. Ověřeno dry-runem proti 5 reálným souborům (`/tmp/sp-check.mjs`).
- **Uložení:** `ai_daily_brief.speaking JSONB` (**migrace 008** — Matyáš spustil 19.6.). Tvar `{fillers:[{word,count,trend}], principles:[...]}`. Zapisuje se ve stejném upsert bloku jako denní úkoly (disjunktní sloupce) — blok přepsán tak, aby speaking prošlo i když denní priority chybí/jsou prázdné. Cron ani task-toggle do sloupce nesahají → přežije přepočet.
- **UI (`app/page.tsx`, `HikariBriefCard`):** nový prop `speaking`, třetí blok (border-top oddělovač). Filler chip = zlaté slovo + tlumený počet + trend (🆕/↑/↓). Principy = odrážky s tlumenou tečkou. Collapsed teaser: když není nudge ale je speaking, ukáže „🗣 hlídej: jo · eh · jako". Karta se zobrazí i když existuje jen speaking (gate `aiNudge ?? aiReasoning ?? speaking`).
- **Projeví se** až po deployi → reopen → **Sync s vaultem** (přeparsuje včerejší soubor do `speaking`). Do té doby sloupec prázdný → blok se nezobrazí (graceful). Build + TS čisté.
- **Drobnost (nedořešeno, edge-case):** v dnech BEZ počtů (17.6) parser ukáže STT-dvojník „dá se říč"/„dá se říct" jako 2 chip-y. Kosmetika, jen když feedback nemá čísla. Případně dedup přes normalizovaný prefix.

---

## ✅ VYŘEŠENO dříve (19.6. session 8)

**Automatická detekce vzorů → návrh pravidla do paměti (PRD priorita #1) — POSTAVENO.**
- **Smysl:** Hikari sám hledá vzory v datech („v úterý nižší HOPE", „kytara → +HOPE") a nabízí je jako `proposed` pravidlo do `hikari_memory`. Matyáš ✓ přijme (→ `active`, krmí budoucí AI) nebo ✕ zamítne (→ `rejected`). PRD §3.6 / §7.1 krok 3 (dřív „Gemini nad nimi jen reasonuje, nezapisuje").
- **Hybrid detekce (rozhodnutí Matyáše 19.6.):** **kód spočítá a OVĚŘÍ čísla** (`lib/pattern-detect.ts`, čisté funkce, žádné AI — průměry/delty per den-v-týdnu a done/not-done dny), **Gemini pak ty ověřené kandidáty posoudí SPOLU S vault kontextem** (`gatherVaultState`) — zahodí konfoundery, smysluplné přeformuluje do mentorského tónu. Čísla zůstávají z kódu (Gemini je nesmí měnit).
- **Proč hybrid a ne čistě AI:** dry-run (`scripts/check-patterns.mjs`) odhalil, že většina syrových kandidátů jsou **zmatené negativní korelace** („pití vody → −1,9 energie" = časový konfounder, ty habity přidány během low-energy období). Gemini s vault kontextem to má zahodit — proto se kandidáti NEdumpují přímo jako návrhy.
- **Dvě rodiny vzorů** (`detectAllPatterns`): (1) **den v týdnu × HOPE metrika** (energie/nálada/naděje, práh Δ≥1,0, n≥3, jeden nejsilnější metrik per den) → `source_ref=dow-{metric}-{0..6}`; (2) **habit → HOPE metrika** (done vs not-done dny, n≥4 na obou stranách, Δ≥1,0) → `source_ref=habit-{metric}-{habitId}`. Confidence = sample × effect, clamp 0–1. Cap 6 kandidátů/běh.
- **Napojení (`proposePatterns` v `lib/hikari-brain.ts`):** běží jako **krok 6 v `runMorningCron`** (cron 6:00 i tlačítko, sdílí `vaultState` s briefem). **Dedup:** kandidát, jehož `source_ref` už v `hikari_memory` (source='auto', JAKÝKOLI status) existuje, se přeskočí → **Gemini se na každý unikátní vzor zeptá právě jednou**. Levné: detekce zdarma, **Gemini call jen když je nový kandidát** (jinak 0 AI navíc). Zápis: keep → `proposed`, Gemini-zahozené → `archived` (aby se na ně už neptal). Bez `GEMINI_API_KEY` graceful fallback (ponechá vše s deterministickou frází). Log `ai_invocations` purpose `pattern_detection`.
- **Schvalovací UI na home (`app/page.tsx`):** sekce **„Hikari navrhuje pravidlo"** (komponenta `ProposalCard`, pod Hikari briefem, jen když existují proposed). Karta = typ (vzor/preference) + jistota % + text pravidla + ✓ Přijmout / ✕ Zamítnout. Optimistický update, revert při chybě. Endpoint **`POST /api/hikari/memory`** `{id, action}` → `active`+`approved_at` / `rejected`+`rejected_at` (jen vlastní profil, jen `proposed`).
- **Žádná migrace** — `hikari_memory` (source='auto', status='proposed') existuje od 001. Build + TypeScript čisté, `/api/hikari/memory` v route listu.
- **Stav dat (ověřeno proti DB `scripts/check-state.mjs`):** `pattern_detection` proběhlo (tlačítko, 9:11, ok=true). **Gemini všech 6 kandidátů zahodil do `archived`** — všechno byly zdánlivé negativní korelace („Probiotika/voda/Anki → −energie", „úterý → −HOPE") = konfoundery. Takže 0 návrhů na home je SPRÁVNĚ, ne bug — na 35 HOPE záznamech zatím není poctivý vzor. Ověřováky: `node scripts/check-patterns.mjs` (suchý běh detekce, nic nezapisuje) + `node scripts/check-state.mjs` (denní úkoly + paměť proposed/archived + invokace).
- **Pokrývá všechny 3 metriky** (mood/energy/hope), ne jen HOPE — per den i per habit vybere nejsilnější metriku (odšumění; jeden vzor = jeden den/habit, ne tři skoro stejné). Případné rozšíření „všechny metriky zvlášť" = zrušit ten výběr nejsilnější (2 řádky).

**OPRAVY tuto session (po postavení detekce):**
1. **Denní úkoly se nenačítaly — SKUTEČNÝ BUG, opraveno (`parseDailyPriorities` v `app/api/vault-sync/route.ts`).** Nový mentor-feedback soubor (`2026-06-18-feedback.md`) má nadpis **`## Priority na zítra` (H2)**, ale parser hledal natvrdo `startsWith('### Priority')` (jen H3) → vrátil `null` → home spadlo na hardcoded fallback (vypadalo jako „špatné úkoly"). Fix: regex `/^#{2,4}\s+Priority/i` matchuje **H2–H4** → staré `###` i nové `##` soubory fungují. Ověřeno stažením reálného souboru z GitHubu + replikou parseru: vytáhne 3 hlavní + 2 vedlejší + 2 bonus. **Po deployi → reopen → Sync s vaultem → úkoly naskočí.**
2. **Re-eval háček v detekci vzorů — opraveno.** Původní dedup (přes `source_ref`, JAKÝKOLI status) by AI-archivované vzory uvěznil napořád → i kdyby „úterý nižší HOPE" časem zesílil, nevrátil by se. Fix (`proposePatterns`): user-rozhodnuté (`proposed`/`active`/`rejected`) blokují ref napořád, ale **AI-`archived` se po 7 dnech znovu vyhodnotí** (stará archived řádka smazána před re-insertem, restart 7d hodin). Těch 6 z 19.6. se znovu posoudí ~26.6.
3. **Honest empty state pro denní úkoly (`app/page.tsx`).** Když po načtení nejsou úkoly z vaultu (prázdné), home místo matoucího hardcoded `FALLBACK_MAIN` ukáže pravdu: „Na dnešek nemáš ve vaultu úkoly. Napiš večerní feedback (### Priority na zítřek) a dej Sync." (`loaded` flag rozliší pre-load flash od reálně prázdného stavu; `FALLBACK_MAIN` zůstává jen pro pre-load.)

---

## ✅ VYŘEŠENO dříve (18.6. session 7)
*(Migrace 007 `rest` enum spuštěna v Supabase — rest days fungují živě, ověřeno proti DB.)*

**1. Rest days — 3-stavový cyklus habitu napříč celým systémem — POSTAVENO.**
- **Cyklus na `/habits`:** klik cykluje **prázdný → ✅ splněno → ✕ rest day → prázdný**. Rest = vyplněný kroužek (tlumená zlatá `0.32`) s **křížkem** místo fajfky + štítek `REST` vpravo. Odznačení (rest → prázdný) = smaže řádek v `habit_logs`. **`fail` status se už nezapisuje** — nesplněný den = prostě absence řádku.
- **Smysl:** habity typu „3× týdně" — ostatní dny označím jako rest. Rest **nenaruší streak ani ho nezvýší** — streak-walk ho přeskočí (číslo se zachová přes mezeru).
- **Streak jádro (`lib/streak-core.ts`):** `streakFromDates` má nový param `restDates[]` — rest dny se ve walku `continue`-ují (ani nelámou, ani nestaví). Mandatory/grace logika beze změny.
- **Obě rebuild cesty** (`lib/streak.ts` klient + `lib/hikari-brain.ts` cron) teď fetchují `.in('status', ['done','rest'])` a předávají rest dates do jádra. `done`/`rest` se grupují zvlášť.
- **`/habits` toggle:** optimistický 3-stav (dva disjunktní Set-y `done`/`rest` + LS klíče `hikari_habits_*` a `hikari_rest_*`). Streak delta: `+1` při vstupu do done, `−1` při odchodu z done, `0` jinak (rest se nepočítá). `totalCount` vyřazuje rest z denominátoru (rest den ≠ nesplněno).
- **`/history`:** **červená (`fail`) pryč** — fail i nezaškrtnuto = prázdná buňka. Rest day = **čárkovaný border** (`dashed`, zlatá `0.5`) + **tlumená zlatá výplň** (`0.13`, méně viditelná než splněno `0.90`). Platí v per-habit i „Vše" režimu (pure-rest den = dashed). Legenda per-habit: splněno / rest (čárkovaně) / nic. Detail panel: „Vše" ukazuje SPLNĚNO + REST sekce; per-habit text rozlišuje `✕ rest day (nezapočítá se)`.
- **Migrace 007** přidává `'rest'` do enumu `habit_status` (spuštěno v Supabase 18.6. — rest days fungují živě, ověřeno proti DB `scripts/check-rest.mjs`).
- **UI doladění `/history` (18.6.):** rest buňka má navíc **diagonální šrafování** (`REST_GRID`, šikmé čáry 45°) přes tlumenou výplň — jednoznačně odlišitelná. Výběr habitu přepnut z posuvných chipů na **„Vše" + rozbalovací tlačítko**: klik rozjede seznam habitů dolů přes kalendář (overlay, z-index 50, tap-outside zavře), klik na habit zavře instantně a tlačítko ukáže jméno vybraného habitu. „Vše" je samostatné tlačítko vedle.
- Build + TypeScript čisté, všechny routy ve výpisu.
- **Habity v dropdownu řazené A–Z** (`localeCompare(..,'cs')` v `loadHabitsLite`).
- **Retrospektivní doplnění habitů (18.6.):** v `/history` má detail vybraného dne tlačítko **„Upravit"** → rozbalí seznam všech aktivních habitů s 3-stavovým cyklem (nic → splněno → rest → nic), zapisuje do `habit_logs` pro to datum (upsert / delete u `none`). Pro dny bez internetu / zpětné doplnění. Optimistický update `logs` + month cache → heat-mapa se hned překreslí. Streaky se přepočítají přes `rebuildStreaksFromLogs` (debounce 1.5s; `loadHabitsLite` proto teď načítá i `mandatory`). Budoucí dny zamčené (nelze vybrat). Komponenta `EditRow` (fajfka/křížek jako na `/habits`).
- **Scrollbar skrytý globálně** (`globals.css`: `scrollbar-width:none` + `::-webkit-scrollbar{display:none}` na `*`) — hlavní stránka i vnitřní scrolly (dropdown). Scroll funguje dál.

**3. Archiv habitů + obnovení — POSTAVENO (`/habits`).**
- **Smazání habitu = archivace** (už dřív): `retireHabit` → `category='retired'`, habit + logy + streaky zůstanou v DB, jen se skryje ze všech zobrazení (`dbToHabits` filtruje retired, cron `.neq('category','retired')`).
- **Nově obnovení:** v **edit módu** (✎) nová sekce **„Archiv"** dole — seznam retired habitů (A–Z) + tlačítko **„↩ Obnovit"**. `unretireHabit` → `category='active'`. `loadRetiredHabits` načítá archiv (v hlavním load effectu + po každém CRUD přes `reloadHabits`). `handleRestoreHabit` → unretire + reload.
- **Háček:** archivace přepíše původní kategorii na `'retired'` → původní skupina se ztratí, obnovený habit jde do **Aktivní**. Balíčkové (`pack` kolona netknutá) se vrátí do svého balíčku. Skupinu lze po obnovení přepnout v editoru. (Lossless restore by chtěl uložit původní kategorii před archivací — zatím neřešeno, nestálo to za migraci.)

**Rozhodnutí 18.6.:** „Hodnotící zprávy balíčků" (Graduate/Retire návrhy na konci balíčku) **se nebudou dělat** — odstraněno z PRD checklistu.

**2. Service worker — auto-update bez ručního restartu — OPRAVENO.**
- **Problém:** Po deployi bylo nutné appku ručně úplně zavřít a otevřít (3× po sobě: rest v history, dropdown, řazení), jinak PWA servírovala starou verzi. Příčina: SW byl sice network-first, ale navigace `fetch(e.request)` respektovala HTTP cache prohlížeče → vracela starou HTML.
- **Fix (`public/sw.js`, CACHE `v3`→`v4`):** navigace (`mode==='navigate'`) teď fetchuje s `cache: 'no-store'` → HTML stránky vždy čerstvé ze sítě (offline fallback na runtime cache zůstává). `/history` přidán do PRECACHE. Ostatní requesty beze změny (network-first).
- **Fix (`app/sw-register.tsx`):** po deployi nový SW přes `skipWaiting`+`clients.claim` převezme řízení → `controllerchange` → stránka se **jednou sama přenačte**. Guard: jen při updatu (existoval controller), ne při prvním installu, ne víc než jednou. `reg.update()` na každém loadu aktivně kontroluje novou verzi.
- **Výsledek:** reopen appky po deployi = čerstvá verze sama; když appka zůstane otevřená přes deploy (a změní se `sw.js`, tj. bump CACHE) = auto-reload. Pozn.: auto-reload „za běhu" se spustí jen když se změní `sw.js` — u běžné code-only změny stačí reopen (no-store navigace zařídí čerstvost).

---

## ✅ VYŘEŠENO dříve (18.6. session 6)

**1. `/history` — kalendářní heat-mapa habits (V2) — POSTAVENO.**
- **Co:** Nová stránka `app/history/page.tsx` — měsíční kalendářní mřížka (Po–Ne, týdny v řádcích) s heat-mapou splněných habits. Navigace ‹ › mezi měsíci, budoucnost zamčená (nelze za aktuální měsíc).
- **Dva režimy** (chip selektor nahoře): **„Vše"** = intenzita zlaté podle počtu odškrtnutých habitů daný den (4 buckety dle `done/denom`, `denom = max(počet aktivních habitů, nejlepší den měsíce)` — vyřešení rostoucího habit setu). **Per-habit** = sémantické barvy: zlatá=splněno, červená=nesplněno (`fail`), tlumená zlatá=`partial`, šedá=žádný log.
- **Klik na den** → detail panel: režim „Vše" vypíše splněné/nesplněné habity toho dne; per-habit režim ukáže stav. **Měsíční souhrn** (odškrtnutí / aktivních dní / nejlepší den) jen v režimu „Vše". Legenda dle režimu.
- **Data:** čte `habit_logs` (`habit_id, date, status`) pro viditelný měsíc (`gte/lte` na `date`), habity přes `loadHabitsLite` (non-retired). **Per-month cache** (`useRef<Map>`) → navigace tam/zpět nerefetchuje. LS fast-path na `profile_id`. Skeleton během načítání. Luffy silueta opacity 0.05 (dle PRD pro /history).
- **Vstup:** ikonka kalendáře v hlavičce `/habits` (vedle edit tlačítka) → `Link href="/history"`. Z `/history` zpět odkazy na `/` (光) a `/habits`.
- Build + TypeScript čisté, `/history` ve route listu jako statická.

---

## ✅ VYŘEŠENO dříve (18.6. session 5)

**1. Živá energetická osa z きぼう dat — POSTAVENO.**
- **Co:** Home screen má živou osu energie (ne statické hardcoded hodnoty). Cron počítá `energy_blocks` z posledních 30 dní hope_logs → 56 řádků (7 dní × 8 bloků). UI čte bloky pro dnešní day_of_week a zobrazuje je s indikátorem aktuálního času.
- **Algoritmus (`calcEnergyBlocks` v `lib/hikari-brain.ts`):** Bázová cirkadiánní křivka (váhy 0.25–0.90 pro 8 bloků 6–22h) × (průměrná energie dne v týdnu / BASELINE 7.0). Práh: ≥0.65 → high, ≥0.40 → mid, <0.40 → low. Zápisuje DELETE + INSERT (56 řádků). Spouští se v každém `runMorningCron` jako krok 2b (levný, bez AI).
- **UI (`app/page.tsx`):** `currentHour` state (client-only, aktualizuje se každou minutu, začíná -1 aby nedošlo k hydration mismatch). Aktivní blok = `Math.floor((hour - 6) / 2)`. Minulé bloky: opacity 0.15, aktivní: opacity 1.0 + scaleY(1.28) + glow shadow + zlatý pulzní bod nad ním, budoucí: opacity 0.5. Fallback na statické hodnoty když energy_blocks prázdné (před prvním cronem). Status text rozlišuje live vs. fallback.
- **Migrace 006 potvrzena spuštěná** (done_keys sloupec — Matyáš potvrdil začátkem session 5).

**2. Gemini hallucination "dnes máš dvě jízdy" — OPRAVENO.**
- **Příčina:** Gemini viděl v týdenních prioritách (cascade L5) detail `"2× sezení"` a přeložil ho jako "dnes máš dvě jízdy" — zaměnil týdenní frekvenci s dnešním plánem.
- **Fix:** Přidána instrukce do Gemini promptu: týdenní priority popisují záměry pro CELÝ TÝDEN, ne pro konkrétní den. `"2× sezení"` = týdenní frekvence, NE dnešní počet. Nikdy nepřepisovat na dnešní plán.

**3. „Přepočítej Hikari" nyní načte stránku znovu.**
- **Příčina:** Data (brief, energy_blocks) se načítají jednou při mountu — po přepočítání byly v DB nová data, ale stránka je neviděla bez manuálního refreshe.
- **Fix:** Po úspěšném `/api/hikari/refresh` se udělá `window.location.reload()` (po 800ms, stejný pattern jako VaultSync).
- **Workflow:** Odškrtej úkoly → pak zmáčkni „Přepočítej Hikari" → stránka se načte čerstvě se správným briefem i energetickou osou.

**4. Hikari vždy čte včerejší feedback — OPRAVENO.**
- **Příčina:** V pondělí platí `lastWeekEnd = neděle (včera)`. Smyčka denních feedbacků měla podmínku `date <= lastWeekEnd` → v pondělí hned na prvním kroku (`neděle <= neděle`) vyskočila. Neděle (včerejší feedback) se přeskočila.
- **Fix:** Změna `<=` na `<` v `gatherVaultState` — den přesně na hranici prochází. Pondělí teď dostane neděli (včera) a zastaví se na sobotě. Ostatní dny nezměněny.

---

## ✅ VYŘEŠENO dříve (17.6. session 4)

**1. Migrace 005 spuštěna** — `ai_daily_brief.hlavni` už není NOT NULL. Ranní cron může vložit řádek jen s nudge/reasoning bez pádu.

**0. Odškrtávání denních úkolů na home (klik → přeškrtne + zešedne).** Klik na hlavní/vedlejší/bonus úkol → `line-through` + opacity 0.5 (decentní, barva zůstává), optimisticky + revert při chybě. Stav v `ai_daily_brief.done_keys text[]` (klíče `hlavni-0`/`vedlejsi-1`/`bonus-0`) — **vyžaduje migraci 006**. Sloupec sync ani cron nepřepisují (disjunktní upsert) → přežije Sync. Endpoint `POST /api/hikari/task-toggle`. Home čte `done_keys` zvlášť (defenzivně — bez migrace degraduje na „nic přeškrtnuté", nerozbije úkoly). **Gemini čte splnění** — `summarizeDayTasks` → „dnes zatím hlavní 2/3 | včera hlavní 3/3 …" do brief promptu. Čte se **živě**, takže mid-day „Přepočítej Hikari" zohlední dnešní odškrtání; ranní cron vidí dnešek 0/Y (jen plán) + včerejšek jako výsledek. AI to nečte samo průběžně (bezstavové) — jen v cronu 6:00 nebo na tlačítko. **Brief zná aktuální čas** (Praha, přes `Intl`+`Europe/Prague`, fáze ráno/odpoledne/večer/noc) + instrukci: ráno/dopoledne NEHODNOTÍ nesplněné dnešní habity/úkoly jako selhání (den běží), kritika dneška až večer — jinak se opírá o včerejšek/vzory. Řeší to, že cron běží 8:30 Praha s 0/19 habity.

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
- **Home** — streak hero (max), habity X/Y, HOPE dnes, **3 sekce DENNÍCH úkolů** (Hlavní + Vedlejší + Bonus) čtené z `ai_daily_brief` dnešního dne. Zdroj = denní mentor-feedback ve vaultu (ne týdenní cascade). **Úkoly jdou odškrtnout klikem** (přeškrtne+zešedne, stav v `done_keys`, viz migrace 006). Cascade karta ukazuje počet **týdenních** priorit zvlášť.
- **kibou** — slidery mood/energy/hope s vlastními PNG ikonkami (mood=kameny, energy=blesk, hope=All Might; všechny čtvercově paddované, transparentní pozadí). Multi-save během dne ✓ (UPSERT, ne INSERT). 30d graf.
- **Živá energetická osa** — home čte `energy_blocks` pro dnešní day_of_week (počítá ranní cron z 30d hope_logs, bázová křivka × scale). Aktivní blok: zlatý bod + scaleY + glow. Fallback na statické hodnoty před prvním cronem.
- **Cascade** — **layer-% L2–L5 = průměr milníkových %** od Gemini, on-demand přes „Přepočítej Hikari" (22.6. session 11: L2 už taky živá per-dim, ne holistická; L3 oživena z `yearly/2027.md`). Milníky L2–L5 se čtou živě z DB (z vaultu), ukazují % + bar (`VaultDimRow`, když >0), rolují se při syncu. **Týdenní/měsíční % zná časovou osu** (kadencové milníky v pondělí ne 90 %). L4/L5 mají navíc **živý štítek „habity X%"** (klient). Před prvním Gemini výpočtem = kurátovaný odhad. Jen L1 chips kurátované. ⚠️ Pro reálná % chybí tvrdé vstupy (hlavně aktuální příjem) — viz session 11.
- **AI brain / ranní cron** — `/api/cron/morning` (Vercel `0 6 * * *`) + on-demand `/api/hikari/refresh` (tlačítko „Přepočítej Hikari", běží s `withMilestones=true`). Kroky: (1) streaky, (2) `calcCascadePct` habit-% týden/měsíc — **už se NEzapisuje do layer %**, jen vstup + štítek, (3) `gatherVaultState` (skládačka reviewů z GitHubu) + `summarizeDayTasks` (dnes/včera odškrtnuté) + Praha čas, (4) Gemini `gemini-2.5-flash` brief → **`cascade_nudge` + `reasoning`** (denní úkoly NEgeneruje), (5) jen on-demand `calcMilestonePct` (cascade %). Upsert do `ai_daily_brief` (jen nudge/reasoning), log `ai_invocations`. Sdílený `geminiGenerate` (UTF-8/Windows gotcha: `cache: no-store` + ruční TextDecoder).
- **Denní úkoly z vaultu** — vault-sync čte `logs/mentor-feedback/(dnes−1)-feedback.md` → sekci `### Priority na zítřek` (= dnešek; soubor D = plán pro D+1). Parsuje `**Hlavní**`/`**Vedlejší**`/`**Bonus**` (`**Name** — detail`) → upsert `ai_daily_brief.{hlavni,vedlejsi,bonus}` pro dnešek (jen tyto sloupce; disjunktní s cronem). Píše Matyáš ručně + ladí s Claudem, Gemini do nich nesahá. Vyžaduje **migraci 005** (drop NOT NULL na `hlavni`).
- **Vault sync** — tlačítko na home (po úspěchu se home sám překreslí), dynamické cesty (aktuální týden/měsíc), cascade L1-L5 (**L3/L4/L5 = full replace** z vaultu, ne accumulate; L1/L2 insert-only), týdenní priority (Hlavní/Vedlejší/Bonus), denní priority z mentor-feedbacku, Memory.md bootstrap (16 H2 sekcí → hikari_memory). **Habity už NEsyncuje** (appka = pán; habits.md zůstává jako archiv, dashboard ho nečte). `ℹ️` info zprávy nehlásí chybu. **Weekly rollover ✓** — zkouší W+1, current, W-1, …, až 6 týdnů zpět.
- Google login, onboarding, PWA, CSP.

## 🧭 Co dál (priorita shora)
1. **Dotáhnout AI brain (cron jádro + denní úkoly + detekce vzorů hotové):**
   - ~~**Detekce vzorů**~~ ✅ HOTOVO 19.6. (session 8) — hybrid stat+Gemini, zápis `proposed` do `hikari_memory` + schvalovací UI na home. Možné dotažení: per-vzor re-evaluace když data zesílí (teď 1×/vzor), víc rodin vzorů (nemoc→nároky, víkend pauza), nebo přidat vzory do Gemini brief promptu jako aktivní pravidla.
   - ~~**Živá energetická osa**~~ ✅ HOTOVO 18.6. (session 5) — cron píše `energy_blocks`, home zobrazuje live s current-time indikátorem.
   - ~~**Cascade milníková % přes Gemini**~~ ✅ HOTOVO 17.6. + dotaženo 22.6. (session 11): L2 teď živá per-dim % jako L3-5, L3 oživena (yearly soubor), týden/měsíc % zná časovou osu. **Zbývá pro reálná %:** přidat tvrdé datové vstupy — hlavně **zdroj aktuálního příjmu** (příjmové milníky se teď odhadují naslepo), pak fyzička čísla / JLPT / počty karet. Možná i: tvrdý clamp kadencových týdenních milníků, „potvrdit milník" UI.
2. **Drobnosti:**
   - ~~Auto-sync cron~~ ✅ HOTOVO 22.6. (session 10) — zřetězeno do ranního cronu 6:00 (sync → brain), ne samostatný cron.
   - Energy obrázek v kibou — kdyby chtěl něco jiného než blesk.
3. **V2:** `/history` heat-mapa · **V3:** `/calculator`.

## ⚠️ Háčky / co vědět
- **Migrace 003 + 004 aplikované**. 004 = `kind`/`detail`/`sort_order` na `cascade_dimensions`. Bez ní sync běží přes fallback (insert bez nových sloupců) ale home pak nezobrazí Vedlejší/Bonus. Další migrace → říct Matyášovi ať spustí SQL v Supabase před deployem.
- **Migrace 006 aplikovaná** (`ALTER TABLE ai_daily_brief ADD COLUMN IF NOT EXISTS done_keys TEXT[] NOT NULL DEFAULT '{}'`) — spuštěna v Supabase (potvrzeno 18.6.). Odškrtávání denních úkolů na home funguje.
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
- `node scripts/check-rest.mjs` — všechny `rest` logy + 20 nejnovějších habit_logs + replika /history fetchu (ověří rest days proti DB).
- `node scripts/check-patterns.mjs` — suchý běh detekce vzorů proti reálné DB (kandidáti + ověřená čísla + co už je v paměti). NIC nezapisuje, žádné AI. (Node 24 nativně čte importovaný `.ts`.)
- `node scripts/check-state.mjs` — stav po session 8: denní úkoly (ai_daily_brief poslední 3 dny) + Hikari paměť (proposed/archived auto řádky) + posledních 6 ai_invocations. Diagnostika „proč nevidím úkoly / návrhy".
- `node scripts/check-autoretire.mjs` — suchý běh auto-retire: které habity by se TEĎ archivovaly (`end_date < dnes`) + nadcházející konce. NIC nezapisuje.
- `node scripts/check-income.mjs` — výpis posledních income_snapshots + co půjde do Gemini promptu. NIC nezapisuje. (Vyžaduje migraci 009.)

## 📌 Stav modulů vs PRD (W23–W27)
Hotovo: Habits (+ **rest days 3-stav**, **archiv/obnovení**), kibou, Cascade UI + **AI cascade % (milníky L3/L4/L5 + layer L2–L5 přes Gemini, on-demand)**, Vault sync (ruční) + denní úkoly z mentor-feedbacku + **odškrtávání úkolů na home**, login, onboarding, PWA (**SW auto-update**), Home s denními úkoly, **AI brain ranní cron (W26 jádro: streaky + Gemini nudge/reasoning s vault-state + čas + task-state kontextem)**, **živá energetická osa z きぼう dat**, **/history kalendářní heat-mapa (+ rest šrafování, dropdown výběr, retrospektivní doplnění, souhrn)**.
**Detekce vzorů → proposed memory + schvalovací UI** (hybrid stat+Gemini, session 8). **Auto-retire habits ✅ 23.6.** (session 12, krok 0 cronu). Chybí: /calculator. **Konflikt workflow (CLI ↔ Supabase) ZRUŠEN** (rozhodnutí 23.6.) — hlasové deníky jdou **vždy jen do vaultu**, nikdy zpět do Supabase; habit status žije jen v dashboardu (klik = pravda), deník je čistá reflexe → konflikt nemá jak vzniknout. Design ponechán v PRD §3.5 jen jako záznam zamítnuté varianty. (Auto-sync cron ✅ 22.6. — zřetězen do ranního cronu.) (Hodnotící zprávy balíčků — zrušeno 18.6.)
**Migrace:** 003–008 aplikované. **009 `income_snapshots` ČEKÁ na spuštění** v Supabase (kotva příjmu pro cascade %). 008 = `ai_daily_brief.speaking JSONB`.
