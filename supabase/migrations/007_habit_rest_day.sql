-- =============================================================================
-- 007_habit_rest_day.sql — "rest day" status for habits
-- =============================================================================
-- Habits now cycle through three states on the dashboard: none → done → rest.
-- A rest day is an intentional skip (e.g. a 3×/week habit on its off days): it
-- neither breaks the streak nor increments it — the streak-core walk skips it.
-- The old 'fail' status is no longer written (un-checking deletes the log row);
-- existing 'fail' rows are harmless and render as empty in the history heat-map.
--
-- Postgres enums: ADD VALUE is safe and idempotent with IF NOT EXISTS. It cannot
-- be used in the same transaction it's added in, but as a standalone migration
-- statement that's fine.
-- =============================================================================

ALTER TYPE habit_status ADD VALUE IF NOT EXISTS 'rest';
