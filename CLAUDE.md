# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Kdo je Matyáš
16 let, SPŠOA Bruntál, Lichnov. Cíl: location-independent freelance příjem do konce střední školy. Životní energie = HOPE. Čtyři pilíře: příroda · jeden blízký člověk · svoboda cestovat · nezávislost.

## Co je tento projekt
Hikari Dashboard — osobní AI systém (Jarvis) pro Matyáše. Čte data ze Supabase (mozek) a z Obsidian vaultu (archiv), zobrazuje je přes mobilní PWA. Tři simultánní role: habits tracker, cascade goal viewer, HOPE/energy tracker. Zároveň slouží jako učení Claude Code v praxi.

Celý PRD: `PRD-HikariDashboard-MVP.md`.

---

## Příkazy

```bash
npm run dev      # dev server na localhost:3000
npm run build    # produkční build (TypeScript + Next.js)
npm run lint     # ESLint (next core-web-vitals + TypeScript)
```

Žádné testy zatím nejsou nakonfigurované.

---

## Tech stack

| Vrstva | Technologie |
|--------|-------------|
| Framework | Next.js 16 (App Router, TypeScript, React 19) |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss` — žádný `tailwind.config.js`) |
| DB / Auth | Supabase — `@supabase/supabase-js` + `@supabase/ssr` |
| Charts | Recharts |
| AI | Claude API (Sonnet 4.6) — výsledky cachované v Supabase, nikdy volané při renderu |
| Hosting | Vercel + Vercel cron |
| PWA | Next.js native manifest + Service Worker |

**Import alias:** `@/*` → kořen projektu (ne `./src/*`). App Router stránky žijí v `app/`.

---

## Architektura systému

```
VAULT (../2nd_brain/)  ←→  GitHub private repo
  sen.md, habits.md, Memory.md, patterns-observed.md
        │
        │ vault sync (Vercel cron Ne 22:00 + manuální tlačítko)
        ▼
SUPABASE — 6 domén:
  A. profiles, user_context
  B. habits, habit_logs, streaks_cache
  C. hope_logs, energy_blocks, hope_correlations
  D. cascade_layers/dimensions/milestones/chips
  E. hikari_memory, ai_invocations, ai_daily_brief, conflict_flags
  F. products, product_metrics, product_tasks, time_log, revenue_trajectory (schéma hotové, UI fázovaně)
        │
        │ Vercel cron 6:00 (Claude API, ~30s)
        ▼
DASHBOARD (Next.js PWA)
  / · /habits · /cascade · /kibou · /history · /calculator
        │
        │ konflikt voice ≠ dashboard → flag
        ▼
CLAUDE CODE CLI (hlasový deník ingest, večerní konverzace)
```

**Pravidla vlastnictví dat:**
- **Supabase = mozek.** Čísla, stavy, AI cache. Dashboard zapisuje sem.
- **Vault = autorský archiv.** Reflexe, hlasový deník, sen.md. Matyáš píše rukou; Hikari sem zapisuje jen habits tabulku + HOPE řádky.
- **Klik v dashboardu = pravda.** Voice deník = reflexe. Konflikt → CLI flagne, nepřepíše tiše.
- **Cascade horní vrstvy** (sen, 5 let, rok) — primárně ve vaultu, Supabase drží snapshot.
- **Cascade nižší vrstvy** (týden, den) — primárně v Supabase.

---

## Routy a moduly

| Route | Modul | Stav MVP |
|-------|-------|----------|
| `/` | Home screen — denní brief, energetická osa, habit/cascade snapshot | W27 |
| `/habits` | Habits tracker — odškrtávání, streak hero, 4 skupiny | W23 |
| `/kibou` | HOPE tracker — 3 slidery, 30d trend graf | W24 |
| `/cascade` | Goal cascade — 5 vrstev, collapsible, chips | W25 |
| `/history` | Kalendářní heat-mapa habits | V2 |
| `/calculator` | Placeholder — aktivace po 2+ měsících HOPE dat | V3 |

---

## AI vrstvy (Hikari "myšlení")

1. **Ranní cron 6:00** — výpočet streaks, cascade %, detekce vzorů, generování denního briefu, update energy_blocks → vše cachované v Supabase. Žádný AI call při renderu stránky.
2. **Reaktivní (bez AI)** — klik habit ✅, zadání HOPE → přímý INSERT do Supabase.
3. **On-demand** — tlačítko "Přepočítej Hikari" re-runne vrstvu 1 mimo cron.

---

## Design systém

| Token | Hodnota |
|-------|---------|
| Background | `#080808` |
| Primary (gold) | `#F59E0B` |
| Text hlavní | `#FFFFFF` |
| Text sekundární | `#6B7280` |
| Radius | `12px` |
| Font | Geist / system |
| Režim | Pouze tmavý |

Luffy silueta jako atmosférický prvek na každé stránce (opacity 0.05–0.10 dle stránky).

---

## Implementační pořadí (W23–W27, 2026)

| Týden | Cíl |
|-------|-----|
| W23 (1.–7.6.) | Supabase projekt + 001_init.sql + `/habits` s odškrtáváním |
| W24 (8.–14.6.) | `/kibou` HOPE tracker + streaks_cache + grace day logika |
| W25 (15.–21.6.) | `/cascade` UI + vault sync manuální tlačítko + memory bootstrap |
| W26 (22.–28.6.) | AI brain v1 (cron 6:00) + konflikt workflow CLI ↔ Supabase |
| W27 (29.6.–5.7.) | Home screen + PWA polish + onboarding |

---

## Reference

| Co | Kde |
|----|-----|
| Supabase migrace | `supabase/migrations/001_init.sql` |
| Celý PRD | `PRD-HikariDashboard-MVP.md` |
| Vault pravidla (master) | `../2nd_brain/CLAUDE.md` |
| Cascade source of truth | `../2nd_brain/wiki/cile/cascade/sen.md` + `prijem.md` |
| Habits master | `../2nd_brain/wiki/cile/habits.md` |
| Hikari paměť bootstrap | `../2nd_brain/Memory.md` + `logs/hikari-self/patterns-observed.md` |

---

## Pravidla pro Claude Code

- **Jeden modul najednou** — nikdy nerozpracovávat víc modulů paralelně.
- **Před buildováním modulu** VŽDY přečti relevantní vault soubory.
- **Na začátku každého nového modulu** uveď, která funkce Claude Code se při stavění tohoto modulu používá (hooks, slash commands, MCP, atd.).
- **Auto-commit/push hook je aktivní.** V `.claude/settings.json` běží PostToolUse hook, který po každém Edit/Write udělá `git add . && git commit -m "auto: save changes" && git push`. Takže **vše se commituje a pushuje automaticky** — a přes Vercel se to samo zbuilduje a nasadí (GitHub → Vercel → Supabase). Necommituj/nepushuj ručně; jen ber v potaz, že každá editace souboru jde rovnou do produkce.
