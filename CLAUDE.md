# Hikari Dashboard — CLAUDE.md

## Kdo je Matyáš
16 let, SPŠOA Bruntál (automobilní elektrotechnika), Lichnov. MBTI INFP-T. Cíl: location-independent freelance příjem do konce střední školy. Životní energie = HOPE. Čtyři pilíře: příroda · jeden blízký člověk · svoboda cestovat · nezávislost.

## Co je tento projekt
Hikari Dashboard — osobní webová aplikace, která čte data z Matyášova 2nd brainu (vaultu) a zobrazuje je vizuálně. Budované moduly 1–3: Habits tracker, Cascade progress view, HOPE tracker (per Rowanova designová direction). Projekt zároveň slouží jako učení Claude Code v praxi.

## Tech stack
- **Framework:** Next.js 15 (App Router, TypeScript)
- **Styling:** Tailwind CSS
- **Backend / DB:** Supabase (PostgreSQL, Auth, Realtime)
- **Hosting:** Vercel
- **Import alias:** `@/*`

## Vault
Vault (2nd brain) žije v `../2nd_brain/` — je to source of truth pro všechna data. Před buildováním jakéhokoliv modulu VŽDY přečti relevantní vault soubory (habits.md, cascade, deník…).

## Pravidla
- **Jeden modul najednou** — nikdy nerozpracovávat víc modulů paralelně.
- **Po každé změně:** `git add . && git commit -m "..."` && `git push` — bez výjimky.
- **Na začátku každého nového modulu:** uveď, která funkce Claude Code se při stavění tohoto modulu používá (hooks, slash commands, MCP, atd.).

## Kontakt na vault pravidla
Kompletní Hikari pravidla, mechaniky habits, cascade strukturu, feedback workflow → čti `../2nd_brain/CLAUDE.md`.
