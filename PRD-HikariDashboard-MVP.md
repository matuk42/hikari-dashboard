# PRD — Hikari Dashboard MVP
**Verze:** 2.3 | **Datum:** 2026-06-22 | **Autor:** Matyáš + Claude

> **v2.3 changelog (2026-06-22, session 11):** Cascade % zreálněno. (1) **L3 (Rok) zdroj přesunut** — roční milníky žijí od 21.6. ve `wiki/reviews/yearly/<rok>.md` (`### Dimenze a milníky`), ne v `sen.md`; sync to teď čte (dřív byla L3 mrtvá, 0 milníků). (2) **L2 (5 let) je živá vrstva** jako L3–L5 — Gemini skóruje její dimenze, layer % = jejich průměr (konec holistického odhadu, co nesedělo s bary); sync full-refresh + filtr neměřitelných dimenzí. (3) **Týdenní/měsíční milníkové % znají časovou osu** — Gemini dostává % uplynulého období + zbývající dny; kadencové milníky (testy 5×/den) se hodnotí vůči celotýdennímu cíli (v pondělí ne 90 %), jednorázové vůči připravenosti. (4) **Rollup** — vyšší vrstvy (L2/L3) berou pokrok nižších jako důkaz trajektorie. **Otevřené pro reálná %:** chybí tvrdé datové vstupy, hlavně **zdroj aktuálního příjmu** — příjmové milníky se zatím odhadují naslepo (viz §6.3 + V2 backlog).

> **v2.2 changelog (2026-06-17, session 4):** Cascade % je AI-počítané — milníková % L3/L4/L5 + layer-% L2–L5 odhaduje **Gemini** (model `gemini-2.5-flash`, ne Claude) on-demand přes „Přepočítej Hikari", z kontextu složeného z **hierarchie vault reviewů** (`gatherVaultState`: plán měsíce/týdne + poslední dokončené reviews + denní feedbacky). Týden/měsíc % už **nejsou** z habitů (habit-% zůstává jen jako vstup + živý štítek). Denní úkoly na home jdou **odškrtnout** (klik → přeškrtne; `ai_daily_brief.done_keys`, migrace 006). Ranní brief dostává kontext aktuálního stavu z reviewů + odškrtnutých úkolů + **aktuálního času** (nehodnotí ráno nesplněné jako selhání). Pozn.: AI vrstva běží na **Gemini**, ne Claude (PRD §13 to ještě uvádí jako Claude — realita je Gemini).

> **v2.1 changelog:** Konflikt workflow (dashboard wins, voice flag), vault delivery přes Git, Hikari paměť hybrid plnění, plné Supabase schéma (6 domén), business modul fázovaně, single-user MVP s RLS, implementační pořadí W23–W27.

---

## 1. Vize produktu

Hikari Dashboard je osobní AI systém (Jarvis) pro Matyáše — 16 let, Česká republika. Není to jen app — je to operační mozek, který zná jeho cíle, habits, energii a navrhuje co dělat a kdy. Pracuje ze své vlastní databáze (Supabase), občas čte Obsidian vault jako archiv a kontext, a zobrazuje vše přes mobilní PWA + web.

**Hlavní princip:** Hikari ví o tobě víc než ty sám v danou chvíli — a používá to aby tě vedl ke snu.

---

## 2. Uživatel

| Parametr | Hodnota |
|----------|---------|
| Jméno | Matyáš |
| Věk | 16 |
| Primární zařízení | Telefon (PWA) |
| Sekundární | PC / laptop (web, jiný layout) |
| Jazyk app | Česky (s japonskými názvy kde to sedí) |
| Tech úroveň | Začátečník-středně pokročilý, učí se za pochodu |
| Přihlášení | Google login (1 klik, sync mobil ↔ PC) |

---

## 3. Architektura systému

```
┌─────────────────────────────────────────────────────────────┐
│  VAULT (2nd_brain/)              ←→  GIT (private repo)     │
│  autorský archiv                     verzování + delivery   │
│  hlasový deník, sen.md,              push při uložení nebo │
│  reflexe, raw-sources                manuálně před syncem   │
└──────────────────────────┬──────────────────────────────────┘
                           │ vault sync (Vercel cron Ne 22:00 + tlačítko)
                           │ čte: sen.md, prijem.md, habits.md,
                           │      M/W reviews, Memory.md, patterns-observed.md
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  SUPABASE (Postgres + Auth + Realtime)                      │
│  Hikari mozek — single user (Matyáš), Google OAuth          │
│                                                             │
│  A. profiles, user_context                                  │
│  B. habits, habit_logs, streaks_cache                       │
│  C. hope_logs, energy_blocks, hope_correlations             │
│  D. cascade_layers/dimensions/milestones/chips              │
│  E. hikari_memory, ai_invocations, ai_daily_brief,          │
│     conflict_flags                                          │
│  F. products, product_metrics, product_tasks,               │
│     ai_business_suggestions, time_log,                      │
│     revenue_trajectory  (schéma připravené, UI fázovaně)    │
└──────────────────────────┬──────────────────────────────────┘
                           │ Ranní cron 6:00 (Claude API)
                           │ + tlačítko "Přepočítej Hikari"
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  DASHBOARD (Next.js 15 PWA)                                 │
│  Home · /habits · /cascade · /kibou · /history · /calc      │
└──────────────────────────┬──────────────────────────────────┘
                           │ konflikt detected (voice ≠ dashboard)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  CLAUDE CODE CLI (Hikari mentor — Matyáš ↔ AI)              │
│  voice deník ingest, večerní konverzace, weekly review      │
│  čte Supabase přes API, flaguje konflikty, NEpřepíše        │
└─────────────────────────────────────────────────────────────┘
```

**Pravidla rozdělení dat:**
- **Supabase = mozek.** Čísla, stavy, výpočty, AI cache. Sem dashboard zapisuje, sem Hikari (AI) čte/píše.
- **Vault = autorský archiv.** Hlasový deník, reflexe, sen.md, raw-sources. Sem Matyáš píše rukou, Hikari sem zapisuje jen tabulky habits/HOPE do deníku a streak update do habits.md.
- **Klik v dashboardu = pravda. Voice deník = reflexe.** Konflikt → konverzace, ne tichá oprava (viz 3.5).
- **Cascade horní vrstvy (sen, 5let, rok) jsou primární ve vaultu** (sen.md, prijem.md). Supabase je drží jako snapshot pro UI.
- **Cascade nižší vrstvy (týden, den) jsou primární v Supabase.** Vault drží snapshot v M/W review souboru.

**Sync timing:**
- **Vault → Supabase:** Vercel cron neděle 22:00 (po zápisu W review) + manuální tlačítko "Sync s vaultem" kdykoli.
- **Supabase → Vault:** Při zápisu hlasového deníku (CLI Hikari doplní habits tabulku + HOPE řádek do frontmatteru) + při weekly review (append do habits.md history).
- **Vault delivery:** 2nd_brain je private Git repo. Server fetchne z GitHubu před každým syncem.

---

## 3.5 Konflikt workflow (dashboard vs. voice)

> **Odloženo na V3 (rozhodnutí 2026-06-23):** Konflikt nemá jak vzniknout, dokud hlasový deník přes CLI reálně nezapisuje habity/HOPE zpět do Supabase (zatím se neděje). Design níže zůstává platný, postaví se až bude živá smyčka voice → Supabase. Viz V3 backlog v §10.

**Problém:** Ráno v dashboardu klikneš "Anki ✅". Večer v hlasovém deníku řekneš "Anki dnes nevyšlo." Co platí?

**Rozhodnutí:** **Dashboard vyhrává.** Klik je akce v reálném čase, voice je reflexe. Hikari (CLI) konflikt **flagne** ve večerní konverzaci, ale nepřepíše tiše.

**Tok:**
1. 08:00 — klik v dashboardu → `INSERT habit_logs (status='done', source='dashboard')`
2. 22:00 — hlasový deník → CLI Hikari ingestuje
3. CLI Hikari čte Supabase přes API → vidí `done` pro dnešek
4. Voice obsah říká "nevyšlo" → CLI vytvoří `INSERT conflict_flags (resolution='pending')` + reference na `habit_logs.conflict_flag_id`
5. Ve večerní konverzaci (krok 10b workflow `zpracuj raw`):
   > *"Konflikt: v dashboardu jsi ráno Anki ✅, v deníku říkáš nevyšlo.  
   > A) trvá ✅ (špatná artikulace ve voice)  
   > B) přepíš na ❌ (klik byl omylem)  
   > C) ~ částečně (něco proběhlo, ne plně)"*
6. Matyášova odpověď → `UPDATE conflict_flags.resolution` + případně `UPDATE habit_logs.status`

**Dashboard nepřepíše nic samo.** Vault si zachová původní deníkový text "nevyšlo" + komentář od Hikari pod konfliktem.

---

## 3.6 Hikari paměť — hybrid plnění

**Tabulka:** `hikari_memory` (type, content, source, status, confidence)

**Plnění ze tří zdrojů:**

| Source | Co se importuje | Status při importu |
|--------|-----------------|---------------------|
| `vault:Memory.md` | 4 pilíře, identita, hodnoty, off-limits | `active` (Matyáš to napsal sám) |
| `vault:patterns-observed.md` | Vzory chování Hikari + Matyáše | `active` (validovaný vzor) |
| `vault:AI-context.md` | Aktuální stav projektů, speaking log | `active` ale s expirací |
| `auto` (AI cron detekce) | "Úterý vždy nízká energie", "kytara → +1.8 HOPE" | `proposed` — Matyáš schvaluje |
| `manual` (form v dashboardu) | Ručně přidané preference / výjimky | `active` |

**Workflow:**
- **Bootstrap:** první vault sync naparuje Memory.md + patterns-observed.md → `hikari_memory` jako active
- **Průběžně:** AI cron 6:00 detekuje nové vzory v habit_logs + hope_logs → `INSERT status='proposed'`
- **Schvalování:** v UI sekce "Hikari navrhuje pravidlo" zobrazí `proposed` paměť. Matyáš → approve / reject. Approved → `status='active'`, použije se v dalších AI invokacích.
- **Zpětný sync:** approved memory s `source='auto'` se při syncu **nepíše zpět** do patterns-observed.md (vault není zdroj). Sync je jednosměrný: vault → memory pro vault-originated zápisy.

---

## 4. Design systém

| Token | Hodnota |
|-------|---------|
| Background | `#080808` |
| Primary (gold) | `#F59E0B` |
| Text hlavní | `#FFFFFF` |
| Text sekundární | `#6B7280` |
| Radius | `12px` |
| Font | System / Geist |
| Režim | Pouze tmavý |
| Logo | Vektorový kanji 光 (jednoduchý, bez efektů — viz referenční obrázek) |

**Estetika:** Minimalistická, čistá, One Piece / HOPE nálada.

**Luffy silueta** — atmosférický prvek na každé stránce, vždy jinak umístěný:
- `/habits` — za hero číslem streaku (opacity 0.10)
- `/` Home — za časovou osou energie (opacity 0.06)
- `/cascade` — za životním snem, první vrstva (opacity 0.07)
- `/kibou` — za trend grafem (opacity 0.06)
- `/history` — za kalendářem (opacity 0.05)

---

## 5. Navigace

Žádný bottom navbar. Navigace funguje přes Home screen:

- **光 logo vlevo nahoře** → vždy otevře Home screen (`/`)
- **Home screen cards** → kliknutí otevře daný modul
- **Zpět** → šipka vlevo nahoře nebo swipe

```
Home (/)
├── /habits      — Habits tracker
├── /cascade     — Goal cascade
├── /kibou       — きぼう HOPE tracker
├── /history     — Kalendářní historie habits
└── /calculator  — Daily Calculator (placeholder)
```

---

## 6. Onboarding (první spuštění)

Zobrazí se pouze při prvním přihlášení. Hikari se zeptá na:

1. **Jméno / přezdívka** — jak tě Hikari oslovuje
2. **Škola** — kdy máš školu (dny v týdnu + čas) → aby věděl kdy jsi volný
3. **Spánek** — kdy vstáváš a chodíš spát → základ pro denní rozvrh

Hlavní priority (cascade) si Hikari vezme sám z Obsidian vaultu při prvním syncu.

Po onboardingu → Home screen s fallback stavem (viz sekce 6.1).

---

## 6. Moduly

---

### 6.1 Home Screen (`/`)

**Účel:** Denní přehled — co dělat dnes, kdy a v jakém pořadí.

**Obsah:**

| Sekce | Popis |
|-------|-------|
| Časová osa energie | Vizuální bloky dne: 🔴 nízká / 🟡 střední / 🟢 vysoká energie — vždy viditelná |
| Hlavní úkoly dne | AI navrhuje 3 hlavní priority (z cascade + habits + HOPE) |
| Vedlejší úkoly | 2–3 vedlejší věci na dnes |
| Bonus | 1 bonusová věc pokud zbyde čas |
| Streak hero | Největší aktivní streak — zlaté číslo |
| Habits dnes | X/Y splněno (kliknutí → `/habits`) |
| Cascade snapshot | Aktuální vrstva + % (kliknutí → `/cascade`) |
| Zlepšení za měsíc | Hikari vybere nejvýraznější zlepšení ze všeho (habits + HOPE + cascade + milníky) |
| Business stats | Placeholder (budoucnost) |
| Chat s Hikari | Placeholder (budoucnost) |

**Úkoly — chování (aktualizováno 16.–17.6):**
- Denní úkoly (hlavní/vedlejší/bonus) **píše Matyáš** v `logs/mentor-feedback/` (soubor dne D = plán pro D+1), vault-sync je načte do `ai_daily_brief`. Gemini je už NEgeneruje (dělá jen mentorský nudge+reasoning).
- **Odškrtnutí klikem** (17.6): klik na úkol → přeškrtne + zešedne, stav v `ai_daily_brief.done_keys` (přežije sync). Gemini čte splnění (dnes/včera) jako signál do briefu.
- Úkoly seřazené podle priority (bez konkrétních časů). (`⚡ názor na změnu` = budoucí V2.)

**Časová osa — logika:**
- Počítá se z きぼう dat (30 dní) → detekce kdy je energie/soustředění nejvyšší
- Těžké úkoly (autoškola, kód) → přiřadit do 🟢 peak okna
- Lehké (kytara, pasivní imerze) → 🔴 nízká energie okna
- Pohyb/příroda → doplnit mezery

**Fallback (málo dat / první týden):**
- Spustí se onboarding průvodce
- Zobrazí cascade priority bez AI optimalizace
- Text pod časovou osou: "Hikari sbírá data — rozvrh se zpřesní za 7 dní"

---

### 6.2 Habits Tracker (`/habits`)

**Účel:** Denní odškrtávání habits, sledování streaku, správa lifecycle.

**Skupiny (v tomto pořadí):**
1. AKTIVNÍ — každodenní habits s streaky
2. TESTOVACÍ — Trial habits (max 2 solo + schválené balíčky)
3. BALÍČKY — Imunita (0/9), Fyzička (0/5) — collapsible
4. ZAUTOMATIZOVÁNO — graduated habits, jen měsíční check

**Hero číslo:**
- Automaticky největší aktivní streak ze všech habits
- Zlaté číslo, Luffy silueta za ním (opacity 0.10)

**Odškrtávání:**
- Kliknutí na habit → zaškrtne se vizuálně → uloží do Supabase
- Offline: uloží se lokálně → sync při připojení

**Streak logika:**
- Streak roste každý den kdy je habit splněn
- **1 rest day** odpuštěn — streak pokračuje
- Výjimka: habits s `mandatory: true` (autoškola testy) — bez grace day
- Streak padá na 0 pokud chybí 2+ dny

**Automatické akce:**
- Habit s `end_date` → Hikari automaticky archivuje po uplynutí data
- Balíčky Imunita/Fyzička → hodnotící den: Hikari zobrazí na Home screenu zprávu s návrhem Graduate/Retire per habit

**Správa habits (v dashboardu):**
- `+ Přidat habit` → formulář: název, skupina, měření, frekvence, cascade vazba, mandatory
- Přesunout habit: Trial → Active → Graduated
- Archivovat (Retired) s důvodem

**Supabase tabulky:** `habits` · `habit_logs` · `streaks_cache` — viz `supabase/migrations/001_init.sql` doména B.

---

### 6.3 Goal Cascade (`/cascade`)

**Účel:** Vizuální přehled 5-vrstvého cílového kaskády — od životního snu po aktuální týden.

**Layout:** Vertikální timeline, zlatá spojovací linie.

**5 vrstev:**

| Vrstva | Obsah | Progress bar |
|--------|-------|-------------|
| Životní sen | Text + klikatelné chips | Žádný (směr, ne cíl) |
| 5 let (věk 21, 2031) | Celkový % + collapsible dimenze | Ano |
| Rok (1.9.2027) | Celkový % + countdown dní | Ano |
| Měsíc | Aktuální měsíc + celkový % | Ano |
| Týden W22 | 3 priority + celkový % | Ano |

**Collapsible logika:**
- Zavřená vrstva: jen název + celkový progress bar — BEZ názvů sub-dimenzí
- Otevřená vrstva: všechny sub-dimenze každá se svým progress barem
- Countdown: malý, zlatý, pod názvem vrstvy

**Chips (Životní sen) — kliknutí otevře detail:**
- Propojené habits + aktuální progress
- Pár vět kontextu z vault souboru (sen.md)
- Doporučení Hikari: "Japonština N3 do 1.9.2027 — jsi na 23%, potřebuješ +15 karet/den"

**Progress výpočet (AI) — IMPLEMENTOVÁNO 17.6, zreálněno 22.6 (Gemini, on-demand):**
- Gemini (`calcMilestonePct`) odhaduje % u jednotlivých milníků **L2–L5**; layer-% **každé vrstvy = průměr jejích milníkových %** (top číslo vždy sedí s bary pod ním — od 22.6. i pro L2, dřív holisticky).
- **Časová osa (22.6):** prompt dostává den v týdnu + % uplynulého týdne/měsíce + zbývající dny. Kadencové milníky (testy 5×/den) se hodnotí vůči celotýdennímu cíli → v pondělí nízko, ne 90 %. Jednorázové/připravenostní (jízdy, počet karet) = připravenost vůči cíli. Vyšší vrstvy (L2/L3) = rollup pokroku nižších.
- Kontext = `gatherVaultState` (plán měsíce/týdne + poslední dokončené reviews + denní feedbacky) + habits/streaky/HOPE/paměť. Matyáš % nepřidává ručně.
- Zdroje milníků: L2 = `sen.md ## 5letý cíl`, L3 = `wiki/reviews/yearly/<rok>.md` (přesunuto 21.6.), L4 = měsíční review, L5 = týdenní priority. Vše full-refresh při syncu.
- Spouští se přes „Přepočítej Hikári" (ne v 6:00 cronu — milníky se mění pomalu).
- **⚠️ Omezení přesnosti:** bez tvrdých datových vstupů Gemini některé milníky odhaduje naslepo — hlavně **příjmové** (chybí zdroj aktuálního příjmu). Pro konzistentně reálná % je potřeba doplnit datové kotvy (viz V2 backlog).
- Velké milníky (autoškola, DofE) → Matyáš potvrdí v dashboardu (zatím přes odškrtání habits/úkolů; explicit confirm UI = budoucí).

**Supabase tabulky:** `cascade_layers` · `cascade_dimensions` · `cascade_milestones` · `cascade_chips` — viz `supabase/migrations/001_init.sql` doména D.

---

### 6.4 きぼう — HOPE Tracker (`/kibou`)

**Účel:** Denní sledování mood/energy/hope → výpočet kdy má Matyáš peak výkon → optimalizace rozvrhu.

**Zadávání (konec dne):**
- 3 slidery: **mood** / **energy** / **hope** (každý 1–10)
- Volitelná krátká poznámka (kontext pro Hikari — "dnes nemoc", "kytara šla skvěle")
- Uložit → Supabase

**Zobrazení:**
- Dnešní čísla (3 velká zlatá čísla)
- 30-denní trend graf (čárový, gold/dark) — přepínatelný: 30 dní / celý život
- Průměry: tento týden / tento měsíc / celkový průměr

**Korelace (AI výpočet):**
- Hikari analyzuje: kdy byl energy nejvyšší → co Matyáš dělal ten den (z habit_logs + poznámky)
- Výstup napájí Home screen časovou osu

**Supabase tabulky:** `hope_logs` · `energy_blocks` · `hope_correlations` — viz `supabase/migrations/001_init.sql` doména C.

---

### 6.5 Daily Calculator (`/calculator`)

**Stav:** Placeholder — prázdná stránka s textem "Brzy" a countdown.
**Aktivace:** Po 2+ měsících HOPE dat (cca září 2026).

---

### 6.6 Historie (`/history`)

**Přístup:** Tlačítko na `/habits` stránce.
**Obsah:** Mini kalendář s heat-mapou splněných habits (zelená/červená/šedá).
**Detail:** Per habit nebo celkový přehled.

---

## 7. Hikari jako AI (Jarvis logika)

**Hikari není jen dashboard — je to systém který přemýšlí.**

### 7.1 Tři vrstvy "myšlení"

**Vrstva 1 — Ranní cron (Vercel cron 6:00, Gemini) — reálný stav 17.6:**
1. ✅ Spočítej streaky → `UPDATE streaks_cache`
2. ✅ Vygeneruj denní mentor brief (`cascade_nudge` + `reasoning`; denní úkoly NE — ty z vaultu) → `ai_daily_brief`. Kontext: streaky, habits, HOPE, paměť, **vault-state** (`gatherVaultState`) + odškrtnuté úkoly + aktuální čas.
3. ⏳ Detekce patterns → `hikari_memory status='proposed'` — Gemini nad nimi reasonuje, ale zatím NEzapisuje (TODO).
4. ⏳ `energy_blocks` z HOPE 30d — zatím statické (TODO „živá energetická osa").
5. ✅ Loguj invokaci → `ai_invocations`.

**Cascade milníková % NENÍ v 6:00 cronu** — běží jen on-demand přes „Přepočítej Hikari" (`calcMilestonePct`, viz §6.3), protože milníky se mění pomalu a je to těžší call.

**Vrstva 2 — Reaktivní (klik / interakce, ~bez AI):**
- Klikneš habit ✅ → `INSERT habit_logs` + rebuild streak. Žádný AI call.
- Zadáš HOPE večer → `INSERT hope_logs`. Žádný AI call (korelace ráno).
- ⚡ "Jaký máš názor na změnu úkolu?" → 1× AI call ~2s, neukládá se.
- Schválíš `proposed` memory → `UPDATE hikari_memory status='active'`.

**Vrstva 3 — On-demand tlačítko "Přepočítej Hikari":**
- Re-run vrstvy 1 mimo cron rytmus. Cena: ~1 AI invokace.

### 7.2 Schopnosti

| Schopnost | Jak funguje | Kdy |
|-----------|-------------|-----|
| Návrh denních úkolů | Cascade + habits + HOPE + memory → 3+2+1 úkoly | Ranní cron 6:00 + tlačítko |
| Časová osa energie | HOPE korelace (30 dní) → bloky dne | Vypočítá cron, UI čte z `energy_blocks` |
| Názor na změnu úkolu | ⚡ ikonka → Hikari okomentuje | On-demand (1 AI call) |
| Progress výpočet | Habits + HOPE + milníky → % v cascade | Ranní cron |
| Sync z vaultu | Načte .md soubory přes Git → Supabase | Cron Ne 22:00 + manuál |
| Konflikt detection | CLI Hikari porovná voice vs. dashboard | Při ingestu hlasového deníku |
| Hodnocení balíčků | Trial end_date → návrh promote/extend/retire | Auto v den `trial_end` |
| Auto-retire habits | `end_date` uplynul → `retired_on = today` | Denně |
| Zlepšení za měsíc | Porovná metriky s minulým měsícem | Měsíční cron 1. den |
| Paměť | proposed/active workflow (3.6) | Průběžně |
| Chat | — | Placeholder V3 |

### 7.3 Co Hikari paměť ukládá

- **Výjimky:** `autoškola = mandatory`, žádný grace day
- **Preference:** "těžké věci ráno", "kytara večer", "les zvedá HOPE"
- **Vzory chování:** kdy Matyáš prokrastinuje, kdy je peak energy, který den v týdnu je slabší
- **Životní kontext:** nemoc → sníž nároky, víkend = legitimní pauza
- **Školní rozvrh:** kdy je volno, kdy praxe
- **Spánkový rytmus:** 22:00 → 06:15, víkend ±30 min

---

## 7.5 Business modul — fázované zapnutí

**Plný Jarvis pro byznys** (z [[prijem]]: *"já jen schvaluji, nastavuji, upravuji a řídím"*).
Schéma existuje od dne 1 (doména F v migraci 001). UI se zapíná postupně.

| Fáze | Trigger | Co aktivovat (UI) |
|------|---------|-------------------|
| **0 — Příprava** | Hned (W23) | Tabulky v DB, UI skryté |
| **1 — B1 v práci** | Když začneš stavět B1 (~Q3 2026) | Kanban (`product_tasks`) + hour tracker (`time_log`). Plus jednoduchá karta produktu (`products`). |
| **2 — První Kč** | První zaplatý zákazník (cíl Vánoce 2026) | MRR graf, customer count, churn % (`product_metrics`). Trajektorie ke 30k/50k (`revenue_trajectory`). |
| **3 — AI money mode** | 6+ měsíců dat (~Q2 2027) | `ai_business_suggestions` UI: pending návrhy s rationale + expected impact. Matyáš schvaluje / odmítá. Business cron 1×týdně. |

**Princip:** UI se odhalí postupně, schéma je hned. Žádné migrace později při růstu příjmu.

**Co AI v Fázi 3 navrhuje:**
- Co udělat dál pro produkt (next step podle MRR trajektorie + cascade vrstvy 4 milníků)
- Kde optimalizovat hodiny (time_log: kde čas neodpovídá výsledku)
- Kdy spustit B2 (signál: B1 stabilní + bandwidth)
- Cenové změny, marketingové experimenty, retention akce

**Limit:** AI vždy navrhuje, nikdy neprovádí. Schvaluješ → `status='approved'` → ty (ne AI) reálně realizuješ → `status='done'` + actual_impact_notes.

---

## 8. Autentifikace + Sync

| Parametr | Hodnota |
|----------|---------|
| Login | Google OAuth (1 kliknutí) |
| Single-user | Supabase Auth Providers → Google → restrict to single email (matypleva1@gmail.com) |
| Session | Uložená v Supabase auth.users + `profiles.auth_user_id` mirror |
| RLS | Enabled, permissive policy `authenticated_all`. V2 přepne na per-profile pokud multi-user. |
| Sync mobil ↔ PC | Real-time přes Supabase (websockets) |
| Vault delivery | Private Git repo (GitHub). Push z PC (manuál nebo `pre-commit`/`post-save` hook). Server fetch při syncu. |
| Vault sync cadence | Vercel cron neděle 22:00 + manuální tlačítko |
| Offline (habits) | Odškrtnuto v localStorage → sync při připojení (last-write-wins per timestamp) |
| Notifikace | Žádné (MVP) |

---

## 9. PWA + Platformy

| Platforma | Stav | Poznámka |
|-----------|------|----------|
| Telefon (PWA) | MVP | Mobile-first, přidat na plochu |
| PC / web | V3 | Stejný design, jiný layout (více sloupců) |
| App Store | Není v plánu | PWA stačí |

**PWA ikonka:** Vektorový kanji 光 na černém pozadí — jednoduchý, bez efektů.

---

## 10. MVP scope + implementační pořadí (W23–W27)

### ✅ MVP — musí být (W23–W27)
- [ ] Supabase migrace 001_init.sql aplikovaná (všech 6 domén)
- [ ] Google login (single-user, restricted email)
- [ ] Habits tracker — `/habits` — list aktivních + odškrtávání + streak hero
- [ ] きぼう — `/kibou` — 3 slidery + poznámka + 30-denní / celkový graf
- [ ] Cascade — `/cascade` — 5 vrstev (UI), collapsible, chips s detailem
- [ ] Vault sync (manuální tlačítko) — Git fetch + parser sen.md/prijem.md/habits.md/Memory.md/patterns-observed.md → Supabase
- [ ] Hikari paměť bootstrap z vaultu
- [ ] Home screen — cascade snapshot + habits dnes + streak hero (statická časová osa zatím)
- [ ] Onboarding (jméno, škola, spánek) — naběhne až je co onboardovat
- [ ] PWA (光 ikonka)

**Týdenní pořadí:**

| Týden | Datum | Cíl |
|-------|-------|-----|
| **W23** | 1.–7.6.  | Supabase projekt + 001_init.sql + Habits route s odškrtáváním (bez AI) |
| **W24** | 8.–14.6. | HOPE tracker + streaks_cache logic + grace day |
| **W25** | 15.–21.6. | Cascade UI + vault sync (manuál) + memory bootstrap |
| **W26** | 22.–28.6. | AI brain v1 (cron 6:00 generuje brief). *(Konflikt workflow CLI ↔ Supabase odsunut na V3 — viz §3.5.)* |
| **W27** | 29.6.–5.7. | Home screen + PWA polish + onboarding |

### 🔜 V2 — po MVP
- [ ] HOPE korelace → živá časová osa energie (UI nad existujícím `energy_blocks`)
- [x] Správa habits z dashboardu (CRUD v `/habits` — hotovo 16.6, appka = zdroj pravdy)
- [x] Auto-sync z vaultu — **hotovo 22.6**: zřetězeno do ranního cronu `/api/cron/morning` (6:00, sync → brain v jednom běhu), ne samostatný cron (Vercel Hobby negarantuje pořadí dvou cronů). `runVaultSync` vytaženo jako sdílená funkce.
- [ ] Auto-retire habits (denní cron checking end_date)
- [x] Historie kalendář (`/history`) — **hotovo 18.6**: měsíční heat-mapa, režim Vše/per-habit, klik na den → detail, čte `habit_logs`
- [x] Cascade progress AI výpočet — **hotovo 17.6, zreálněno 22.6**: Gemini počítá milníková % L2–L5 (layer = průměr milníků), L3 z `yearly/<rok>.md`, časová osa pro týden/měsíc (viz v2.3 changelog)
- [ ] **Cascade datové kotvy pro reálná %** (návazné na 22.6) — Gemini teď bez tvrdých vstupů odhaduje část milníků naslepo. Doplnit strukturované zdroje: **(1) aktuální příjem** (kolik Matyáš reálně vydělává — vstup pro příjmové milníky L2/L3/L4), (2) fyzička čísla (shyby/běh/kolo z [[2027]] „měřitelnost"), (3) JLPT úroveň / počet Anki karet. Bez nich budou některé dimenze sedět a jiné ne. Volitelně: tvrdý clamp kadencových týdenních milníků + „potvrdit milník" UI.
- [x] Odškrtávání denních úkolů na home (klik → přeškrtne, `done_keys`, migrace 006) — hotovo 17.6
- [ ] ⚡ Hikari názor na změnu úkolu
- [ ] Zlepšení za měsíc
- [x] Hikari memory schvalovací UI (proposed → active workflow) — **hotovo 19.6**: sekce „Hikari navrhuje pravidlo" na home, ✓/✕, `POST /api/hikari/memory`
- [x] Automatická detekce vzorů (zápis `hikari_memory` status='proposed') — **hotovo 19.6**: hybrid — `lib/pattern-detect.ts` ověří čísla (den-v-týdnu × HOPE, habit→HOPE), Gemini je posoudí s vault kontextem (zahodí konfoundery), zápis `proposed`/`archived`, běží v `runMorningCron` krok 6 s dedupem

### 🔮 V3 — budoucnost
- [ ] Chat s Hikari v dashboardu (lokální AI rozhraní místo Claude Code CLI pro běžné věci)
- [ ] Daily Calculator (po 2 měs. dat)
- [ ] PC web layout (jiný než mobil)
- [ ] **Business modul Fáze 1** (kanban + hour tracker) — až začne stavba B1
- [ ] **Business modul Fáze 2** (MRR/customers/churn) — až přijdou první Kč
- [ ] **Business modul Fáze 3** (AI návrhy money mode) — po 6+ měsících dat

---

## 11. Success metrics

| Metrika | Cíl |
|---------|-----|
| Matyáš otevře app každý den | ✅ denně |
| HOPE data zadána | 80%+ dní |
| Habits odškrtány v dashboardu | 100% přesun z Obsidianu |
| Cascade data aktuální | Týdenní sync |
| Home screen nahradí ranní brief | Do konce července 2026 |

---

## 12. Constraints a rizika

| Riziko | Mitigace |
|--------|----------|
| Supabase free tier | 500 MB / 50k req/měs — pro 1 uživatele stačí roky |
| AI tokeny | Výsledky cache v `ai_daily_brief` + `cascade_dimensions.progress_pct`. AI se nevolá při render. |
| Vault privacy na GitHub | Repo MUSÍ být private. Vault obsahuje hlasové deníky → před `git init` rozhodnout: (a) private GitHub (akceptovatelné pro MVP), (b) self-hosted Gitea (komplikované). |
| OneDrive × Git konflikt | `.git` složka pod OneDrive sync = lock files, broken commits. **Před `git init`** přesunout 2nd_brain mimo OneDrive **nebo** přidat `.git` do OneDrive exclude listu. |
| Vault sync komplexita | MVP: manuální tlačítko. V2: Vercel cron Ne 22:00 (kdy už není autorský konflikt s W review). |
| Konflikt voice ↔ dashboard | Dashboard wins, ale CLI Hikari flagne ve večerní konverzaci (3.5). Žádná tichá oprava. |
| Offline sync konflikty | Last-write-wins per timestamp v habit_logs. |
| MVP přílišná komplexita | AI brain striktně až W26. W23–W25 = pasivní data + ruční vstup. |
| Single-user RLS chyba | `authenticated_all` policy je permissive. Bezpečnost závisí na restrikci Google OAuth emailu v Supabase settings — **ověřit při setupu**. |

---

## 13. Stack

| Vrstva | Technologie |
|--------|-------------|
| Frontend | Next.js 15 + TypeScript + Tailwind CSS 4 |
| Charts | Recharts |
| Databáze | Supabase (PostgreSQL + realtime + auth) |
| Auth | Supabase Google OAuth, single-email restrict |
| Hosting | Vercel (auto-deploy z GitHub) |
| PWA | next-pwa nebo Next.js native manifest |
| AI výpočty | **Gemini API (`gemini-2.5-flash`)** — výsledky cache v Supabase, log v `ai_invocations`. (Původně plánován Claude/Sonnet; realita = Gemini, free-tier dostačuje na 1 brief/den + on-demand.) Sdílený `geminiGenerate` (retry 503/429, UTF-8 decode). AI se NIKDY nevolá při renderu. |
| Vault delivery | Private Git repo (GitHub) — push z PC, fetch ze serveru |
| Vault parser | Node.js script — čte .md soubory, parsuje frontmatter + tables + wikilinks, zapíše do Supabase |
| CLI Hikari ↔ Supabase | Claude Code CLI volá Supabase REST API přes service role key (server-side) |
| Offline | Service Worker + localStorage fallback (habits odškrtnutí) |
| Cron | Vercel cron jobs (`vercel.json` schedule) |

---

## 14. Reference — kde co najdeš

| Co | Kde |
|----|-----|
| Supabase migrace | `supabase/migrations/001_init.sql` |
| Tento PRD | `PRD-HikariDashboard-MVP.md` |
| Dashboard-specific Claude rules | `CLAUDE.md` (root projektu) |
| Vault pravidla (master) | `../2nd_brain/CLAUDE.md` |
| Cascade source of truth | `../2nd_brain/wiki/cile/cascade/sen.md` + `prijem.md` |
| Habits master | `../2nd_brain/wiki/cile/habits.md` |
| Hikari paměť bootstrap | `../2nd_brain/Memory.md` + `logs/hikari-self/patterns-observed.md` |

---

*PRD v2.1 — 2026-06-01. Aktualizovat při každé větší změně scope. Po implementaci W23–W27 přejít na v3.0.*
