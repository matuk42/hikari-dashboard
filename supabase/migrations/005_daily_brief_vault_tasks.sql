-- =============================================================================
-- 005_daily_brief_vault_tasks.sql — daily priorities now come from the vault
-- =============================================================================
-- Home's hlavní/vedlejší/bonus tasks are now DAILY and authored by Matyáš in the
-- vault (logs/mentor-feedback/<date>-feedback.md → "### Priority na zítřek").
-- vault-sync writes ai_daily_brief.{hlavni,vedlejsi,bonus}; the morning cron now
-- writes only cascade_nudge + reasoning (Gemini no longer generates tasks).
--
-- Since the two writers touch disjoint columns, the cron must be able to insert a
-- brief row WITHOUT tasks (sync fills them later, or the day has no plan yet).
-- Drop the NOT NULL on hlavni so a cron-only row is valid.
-- =============================================================================

ALTER TABLE ai_daily_brief ALTER COLUMN hlavni DROP NOT NULL;
