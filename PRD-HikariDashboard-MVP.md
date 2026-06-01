# PRD — Hikari Dashboard MVP
**Verze:** 1.0 | **Datum:** 2026-06-01 | **Autor:** Matyáš + Claude

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
| Sekundární | PC / laptop (web) |
| Jazyk app | Česky (s japonskými názvy kde to sedí) |
| Tech úroveň | Začátečník-středně pokročilý, učí se za pochodu |

---

## 3. Architektura systému

```
┌─────────────────────────────────┐
│        HIKARI DASHBOARD         │
│    Next.js 15 + TypeScript      │
│    Tailwind CSS · PWA           │
├─────────────────────────────────┤
│          SUPABASE               │  ← Hikari's brain (operační data)
│  habits · HOPE · cascade ·      │
│  tasks · correlations · memory  │
├─────────────────────────────────┤
│        OBSIDIAN VAULT           │  ← archiv + kontext (čte se občas)
│  2nd_brain/ sen.md prijem.md    │
│  weekly/monthly reviews         │
└─────────────────────────────────┘
         ↕ Vercel (hosting)
```

**Pravidlo:** Supabase = kde Hikari píše, čte a počítá. Obsidian = kde Matyáš píše pro sebe. Hikari občas Obsidian načte a přenese relevantní data do Supabase.

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
| Logo | Vektorový kanji 光 (jednoduchý, bez efektů) |

**Estetika:** Minimalistická, čistá, One Piece / HOPE nálada. Luffy silueta jako atmosférický prvek (ne dekorace).

---

## 5. Navigace

Žádný bottom navbar. Navigace funguje přes Home screen:

- **光 logo vlevo nahoře** → vždy otevře Home screen
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

## 6. Moduly

---

### 6.1 Home Screen (`/`)

**Účel:** Ranní přehled — co dělat dnes, kdy a v jakém pořadí.

**Obsah:**

| Sekce | Popis |
|-------|-------|
| Hlavní úkoly dne | AI navrhuje 3 hlavní priority (z cascade + habits) |
| Vedlejší úkoly | 2–3 vedlejší věci na dnes |
| Bonus | 1 bonusová věc pokud zbyde čas |
| Optimální rozvrh | Kdy co dělat — podle HOPE korelací (ráno těžké věci pokud tehdy peak, atd.) |
| Streak hero | Největší aktivní streak — zlaté číslo |
| Habits dnes | X/Y splněno (kliknutí → `/habits`) |
| Cascade snapshot | Aktuální vrstva + % (kliknutí → `/cascade`) |
| Zlepšení za měsíc | Automaticky generované za posledních 30 dní |
| Business stats | Placeholder (budoucnost) |
| Chat s Hikari | Placeholder (budoucnost) |

**AI chování:**
- Hikari navrhuje úkoly automaticky na základě cascade dat + habits + HOPE dat
- Uživatel může úkoly upravit → Hikari řekne svůj názor na změnu
- Optimální rozvrh se počítá z HOPE korelací (kdy má Matyáš nejvyšší energii/soustředění)

**Rozvrh logika:**
- Data z きぼう trackeru (30 dní) → detekce kdy je energie/soustředění nejvyšší
- Těžké úkoly (autoškola, kód) → přiřadit do peak okna
- Lehké (kytara, pasivní imerze) → nízká energie okna
- Pohyb/příroda → doplnit mezery

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
- Kliknutí na habit v dashboardu → zaškrtne se vizuálně → uloží do Supabase
- Datum + habit ID + user ID

**Streak logika:**
- Streak roste každý den kdy je habit splněn
- **1 rest day** je odpuštěn (streak pokračuje)
- Výjimka: habits s `mandatory: true` (např. autoškola testy) — bez grace day
- Streak padá na 0 pokud chybí 2+ dny

**Správa habits (v dashboardu):**
- Tlačítko `+ Přidat habit` → formulář: název, skupina, měření, frekvence, cascade vazba
- Přesunout habit mezi skupinami (Trial → Active → Graduated)
- Archivovat (Retired) s důvodem

**Historie:**
- Tlačítko v habits → otevře `/history`
- Mini kalendář (zelené = splněno, červené = nesplněno, šedé = rest day)
- Per habit nebo celkový přehled

**Supabase tabulky:**
```sql
habits (id, name, group, measurement, frequency, mandatory, cascade_ref, active)
habit_logs (id, habit_id, date, completed, note)
```

---

### 6.3 Goal Cascade (`/cascade`)

**Účel:** Vizuální přehled 5-vrstvého cílového kaskády — od životního snu po aktuální týden.

**Layout:** Vertikální timeline, zlatá spojovací linie.

**5 vrstev:**

| Vrstva | Obsah | Progress bar |
|--------|-------|-------------|
| Životní sen | "Žiju v rytmu mezi módy světa" — statický text, chips | Žádný (směr, ne cíl) |
| 5 let (věk 21, 2031) | Celkový % + collapsible dimenze | Ano — splnění milníků |
| Rok (1.9.2027) | Celkový % + countdown (dní zbývá) | Ano — splnění dimenzí |
| Měsíc | Aktuální měsíc + celkový % | Ano — splnění měsíčních cílů |
| Týden | W22 + 3 priority + celkový % | Ano — splnění týdenních priorit |

**Collapsible logika:**
- Zavřená vrstva: jen název + celkový progress bar (BEZ názvů sub-dimenzí)
- Otevřená vrstva: zobrazí se všechny sub-dimenze každá se svým progress barem
- Countdown: malý, pod názvem vrstvy, zlatý text, nezdobný

**Data flow:**
- Hikari občas načte Obsidian review soubory (`wiki/reviews/weekly/`, `wiki/reviews/monthly/`)
- Extrahuje priority + splněné milníky → uloží do Supabase
- Dashboard čte ze Supabase (rychle, bez spotřeby tokenů při každém načtení)

**Supabase tabulky:**
```sql
cascade_layers (id, layer, title, progress_pct, deadline, updated_at)
cascade_dimensions (id, layer_id, name, progress_pct, completed)
```

---

### 6.4 きぼう — HOPE Tracker (`/kibou`)

**Účel:** Denní sledování mood/energy/hope → výpočet kdy má Matyáš peak výkon → optimalizace denního rozvrhu.

**Zadávání (konec dne):**
- 3 slidery: **mood** / **energy** / **hope** (každý 1–10)
- Uložit tlačítko → Supabase

**Zobrazení:**
- Dnešní čísla (3 velká čísla, zlatá)
- 30-denní trend graf (čárový, gold/dark)
- Průměry za týden / měsíc

**Korelace (AI výpočet):**
- Hikari analyzuje: kdy byl energy nejvyšší → co Matyáš dělal ten den (z habit_logs)
- Výstup: "Tvůj peak energy je obvykle ráno v úterý–čtvrtek. V tyto dny dej těžké úkoly na 8–11h."
- Toto napájí Home screen rozvrh

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

**Stav:** Otevírá se z Habits tlačítkem.
**Obsah:** Mini kalendář s heat-mapou splněných habits.

---

## 7. Hikari jako AI (Jarvis logika)

**Hikari není jen dashboard — je to systém který přemýšlí.**

| Schopnost | Jak funguje |
|-----------|-------------|
| Návrh denních úkolů | Čte cascade priority + habits + HOPE → navrhuje 3+2+1 úkoly |
| Optimální rozvrh | HOPE korelace → přiřadí typ úkolu ke správnému času |
| Názor na změnu | Pokud Matyáš změní navržený úkol → Hikari okomentuje ("Autoškola je deadline 30.6., doporučuji nepřesouvat") |
| Sync z Obsidianu | Občas načte weekly/monthly review → aktualizuje Supabase data |
| Paměť | Ukládá Matyášovy preference, vzory, výjimky do Supabase (ne do Obsidianu) |
| Chat | Placeholder — budoucí verze |

---

## 8. PWA + Platformy

| Platforma | Stav | Poznámka |
|-----------|------|----------|
| Telefon (PWA) | MVP | Mobile-first, přidat na plochu |
| PC / web | Budoucnost | Stejný design, jiný layout (více sloupců) |
| App Store | Není v plánu | PWA stačí |

**PWA ikonka:** Vektorový kanji 光 na černém pozadí — jednoduchý, bez efektů.

---

## 9. MVP scope (co je v první verzi)

### ✅ MVP — musí být
- [ ] Home screen se statickými úkoly (ruční zadání) + Cascade snapshot + Habits dnes
- [ ] Habits tracker — skupiny, odškrtávání, streak hero, grace day
- [ ] Cascade — 5 vrstev, collapsible, hardcoded data
- [ ] きぼう — 3 slidery, uložení, 30-denní graf
- [ ] Supabase připojení pro habits_logs + hope_logs
- [ ] PWA (光 ikonka, add to homescreen)

### 🔜 V2 — po MVP
- [ ] AI návrh denních úkolů (Hikari brain)
- [ ] HOPE korelace + optimální rozvrh
- [ ] Správa habits z dashboardu (přidat/přesunout/archivovat)
- [ ] Sync z Obsidianu (načtení review souborů → Supabase)
- [ ] Historie kalendář (`/history`)

### 🔮 V3 — budoucnost
- [ ] Chat s Hikari v dashboardu
- [ ] Daily Calculator (po 2 měs. dat)
- [ ] PC web layout
- [ ] Business stats sekce
- [ ] Hikari paměť (dlouhodobá, ne session)

---

## 10. Success metrics

| Metrika | Cíl |
|---------|-----|
| Matyáš otevře app každý den | ✅ denně |
| HOPE data zadána | 80%+ dní |
| Habits odškrtány v dashboardu (ne Obsidian) | 100% přesun |
| Cascade data aktuální | Týdenní sync |
| Home screen nahradí ranní brief v Obsidianu | Do konce července 2026 |

---

## 11. Constraints a rizika

| Riziko | Mitigace |
|--------|----------|
| Supabase free tier limity | 500 MB storage, 50k req/měsíc — pro jednoho uživatele stačí roky |
| AI výpočty spotřebují tokeny | Data se ukládají do Supabase, AI počítá jen při updatu (ne při každém načtení) |
| Obsidian sync komplexita | Občasný manuální trigger, ne real-time |
| Přílišná komplexita MVP | Drž se MVP scope — AI logika až V2 |

---

## 12. Stack

| Vrstva | Technologie |
|--------|-------------|
| Frontend | Next.js 15 + TypeScript + Tailwind CSS |
| Databáze | Supabase (PostgreSQL + realtime + auth) |
| Hosting | Vercel (auto-deploy z GitHub) |
| PWA | next-pwa |
| AI výpočty | Claude API (Sonnet) — volá se jen pro výpočty, výsledky se cachují v Supabase |
| Vault sync | Node.js script — čte .md soubory, parsuje, zapíše do Supabase |

---

*PRD vytvořen 2026-06-01. Aktualizovat při každé větší změně scope.*
