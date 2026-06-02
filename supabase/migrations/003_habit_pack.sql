-- 003_habit_pack.sql — group metadata so the habits page can rebuild the
-- Aktivní / Balíček Imunita / Balíček Fyzička / Zautomatizováno grouping
-- directly from the DB instead of a hardcoded list in the page.
--
-- pack:      'imunita' | 'fyzicka' | NULL (solo habit)
-- pack_code: 'A'..'J' display code within the Imunita pack | NULL
--
-- Idempotent: safe to re-run.

ALTER TABLE habits ADD COLUMN IF NOT EXISTS pack      TEXT;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS pack_code TEXT;
