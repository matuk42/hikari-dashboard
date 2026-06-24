-- =============================================================================
-- 010_hope_checkins.sql — intraday HOPE/energy check-ins (energetické oblouky dne)
-- =============================================================================
-- Until now HOPE was one row per day (hope_logs, UNIQUE(profile_id, date)) — a
-- single point. But energy/mood move through the day: ráno jinak, po škole jinak,
-- večer jinak. This table holds MULTIPLE timestamped check-ins per day so we can:
--   1. draw the day as a curve, not a point (/kibou intraday chart),
--   2. learn the REAL shape of the energy axis (calcEnergyBlocks) instead of the
--      synthetic circadian BASE_CURVE,
--   3. feed activity→HOPE correlations (hope_correlations) from the free-text note.
--
-- hope_logs stays the daily ROLLUP (average of the day's check-ins, written by the
-- client on every save) so everything downstream — 30d trend chart, averages,
-- pattern detection, the energy scale — keeps working unchanged.
--
-- The note is free text. The morning cron normalises it into activity_tag via
-- Gemini (cached back here) so correlations don't re-call the model each run.
-- =============================================================================

CREATE TABLE hope_checkins (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date         DATE NOT NULL,                          -- local (Prague) day, set by client = same value as hope_logs.date
  ts           TIMESTAMPTZ NOT NULL DEFAULT now(),     -- exact moment of the check-in (drives the intraday curve)
  mood         INT NOT NULL CHECK (mood   BETWEEN 0 AND 10),
  energy       INT NOT NULL CHECK (energy BETWEEN 0 AND 10),
  hope         INT NOT NULL CHECK (hope   BETWEEN 0 AND 10),
  note         TEXT,                                   -- free text: co se právě dělo
  activity_tag TEXT,                                   -- normalised by cron (Gemini) from note; NULL until processed
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No UNIQUE(profile_id, date) — multiple check-ins per day is the whole point.
CREATE INDEX idx_hope_checkins_day ON hope_checkins(profile_id, date, ts);
CREATE INDEX idx_hope_checkins_ts  ON hope_checkins(profile_id, ts DESC);
-- Partial index for the cron's "untagged notes" lookup (tag extraction queue).
CREATE INDEX idx_hope_checkins_untagged ON hope_checkins(profile_id)
  WHERE activity_tag IS NULL AND note IS NOT NULL;

ALTER TABLE hope_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY authenticated_all ON hope_checkins FOR ALL TO authenticated USING (true) WITH CHECK (true);
