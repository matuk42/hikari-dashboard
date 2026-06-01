# PRD — Hikari Dashboard MVP
**Verze:** 2.1 | **Datum:** 2026-06-01 | **Autor:** Matyáš + Claude

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

**Úkoly — AI chování:**
- Hikari navrhuje úkoly automaticky na základě cascade + habits + HOPE dat
- Uživatel může úkol upravit → vedle úkolu se zobrazí ⚡ ikonka → kliknutím zobrazíš Hikariho názor na změnu
- Úkoly jsou seřazeny podle priority (bez konkrétních časů)

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

**Supabase tabulky:**
```sql
habits (id, name, group, measurement, frequency, mandatory, end_date, cascade_ref, active)
habit_logs (id, habit_id, date, completed, synced_offline)
```

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

**Progress výpočet (AI):**
- Hikari počítá z: habits (které dimenze pokrývají) + HOPE dat + splněných milníků
- Matyáš nepřidává % ručně — Hikari odhaduje sám
- Velké milníky (autoškola složena, DofE bronz) → Matyáš potvrdí v dashboardu

**Supabase tabulky:**
```sql
cascade_layers (id, layer, title, progress_pct, deadline, updated_at)
cascade_dimensions (id, layer_id, name, progress_pct, completed)
cascade_milestones (id, layer_id, name, completed, completed_date)
```

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

**Supabase tabulky:**
```sql
hope_logs (id, date, mood, energy, hope, note)
hope_correlations (id, activity_type, avg_hope_after, sample_size, updated_at)
```

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

| Schopnost | Jak funguje | Kdy |
|-----------|-------------|-----|
| Návrh denních úkolů | Cascade + habits + HOPE → 3+2+1 úkoly | Každé ráno |
| Časová osa energie | HOPE korelace (30 dní) → bloky dne | Real-time |
| Názor na změnu úkolu | ⚡ ikonka → Hikari okomentuje | Na požádání |
| Progress výpočet | Habits + HOPE + milníky → % v cascade | Týdenně |
| Sync z Obsidianu | Načte review soubory → Supabase | Auto neděle + manuálně |
| Hodnocení balíčků | 30.6. / 3.7. → zpráva na Home screenu | Automaticky |
| Auto-retire habits | end_date uplynul → archivace | Automaticky |
| Zlepšení za měsíc | Porovná všechny metriky s minulým měsícem | Měsíčně |
| Paměť | Preference, výjimky, vzory → Supabase | Průběžně |
| Chat | — | Placeholder V3 |

**Hikari paměť ukládá:**
- Výjimky (autoškola = mandatory)
- Preference (těžké věci ráno, kytara večer)
- Vzory chování (kdy Matyáš nejvíc prokrastinuje)
- Životní kontext (nemoc → sníž nároky)
- Školní rozvrh (kdy je volno)
- Spánkový rytmus

---

## 8. Autentifikace + Sync

| Parametr | Hodnota |
|----------|---------|
| Login | Google OAuth (1 kliknutí) |
| Session | Uložená v Supabase auth |
| Sync | Mobil ↔ PC — real-time přes Supabase |
| Offline | Habits odškrtnuty lokálně → sync při připojení |
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

## 10. MVP scope

### ✅ MVP — musí být
- [ ] Google login
- [ ] Onboarding (jméno, škola, spánek)
- [ ] Home screen — cascade snapshot + habits dnes + streak hero + časová osa (statická)
- [ ] Habits tracker — skupiny, odškrtávání (online + offline), streak hero, grace day
- [ ] Cascade — 5 vrstev, collapsible, chips s detailem
- [ ] きぼう — 3 slidery + poznámka, uložení, 30-denní / celkový graf
- [ ] Supabase: habits_logs + hope_logs + cascade_layers
- [ ] PWA (光 ikonka)
- [ ] Sync tlačítko (manuální vault sync)

### 🔜 V2 — po MVP
- [ ] AI návrh denních úkolů (Hikari brain)
- [ ] HOPE korelace → živá časová osa energie
- [ ] Správa habits z dashboardu (přidat/přesunout/archivovat/end_date)
- [ ] Auto-sync z Obsidianu (cron neděle)
- [ ] Auto-retire habits
- [ ] Hodnotící zprávy balíčků
- [ ] Historie kalendář (`/history`)
- [ ] Cascade progress AI výpočet
- [ ] ⚡ Hikari názor na změnu úkolu
- [ ] Zlepšení za měsíc

### 🔮 V3 — budoucnost
- [ ] Chat s Hikari v dashboardu
- [ ] Daily Calculator (po 2 měs. dat)
- [ ] PC web layout (jiný než mobil)
- [ ] Business stats sekce
- [ ] Hikari paměť (plná, dlouhodobá)

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
| AI tokeny | Výpočty se cachují v Supabase, AI se nevolá při každém načtení |
| Obsidian sync komplexita | Začít manuálním triggerem, auto-cron přidat v V2 |
| Offline sync konflikty | Last-write-wins s timestampem |
| MVP přílišná komplexita | AI logika striktně až V2 |

---

## 13. Stack

| Vrstva | Technologie |
|--------|-------------|
| Frontend | Next.js 15 + TypeScript + Tailwind CSS |
| Databáze | Supabase (PostgreSQL + realtime + auth) |
| Auth | Supabase Google OAuth |
| Hosting | Vercel (auto-deploy z GitHub) |
| PWA | next-pwa |
| AI výpočty | Claude API (Sonnet) — výsledky se cachují v Supabase |
| Vault sync | Node.js script — čte .md soubory, parsuje, zapíše do Supabase |
| Offline | Service Worker + localStorage fallback |

---

*PRD v2.0 — 2026-06-01. Aktualizovat při každé větší změně scope.*
