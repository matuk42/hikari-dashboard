-- =============================================================================
-- 006_daily_task_done.sql — click-to-strike completion for daily tasks
-- =============================================================================
-- The home screen lists daily tasks (hlavní/vedlejší/bonus) from ai_daily_brief.
-- Tapping one strikes it through. Completion is stored as an array of task keys
-- ("hlavni-0", "vedlejsi-1", "bonus-0") on the brief row.
--
-- Why a column here (not a separate table): the daily tasks themselves come from
-- the vault (mentor-feedback) and are re-upserted on every sync. Because PostgREST
-- upsert only writes the columns in its payload, vault-sync (hlavni/vedlejsi/bonus)
-- and the morning cron (nudge/reasoning) never touch done_keys → the checkmarks
-- survive a re-sync. Keyed by index so editing a task's text keeps its slot.
-- =============================================================================

ALTER TABLE ai_daily_brief
  ADD COLUMN IF NOT EXISTS done_keys TEXT[] NOT NULL DEFAULT '{}';
