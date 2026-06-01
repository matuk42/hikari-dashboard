-- =============================================================================
-- 001_init.sql — Hikari Dashboard initial schema
-- =============================================================================
-- Single-user MVP (Matyáš). Tables include profile_id for future multi-user.
-- RLS enabled with permissive "authenticated" policy; Google OAuth restricted
-- to single email in Supabase Auth settings.
-- 6 domains: A profiles · B habits · C HOPE · D cascade · E Hikari brain · F business
-- =============================================================================

-- Extensions ------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Generic updated_at trigger --------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- DOMAIN A — Identity & context
-- =============================================================================

CREATE TABLE profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id    UUID UNIQUE,                       -- Supabase auth.users.id
  google_email    TEXT UNIQUE NOT NULL,
  display_name    TEXT NOT NULL,
  born_year       INT,
  school_days     INT[],                             -- 0=Sun .. 6=Sat
  school_start    TIME,
  school_end      TIME,
  sleep_start     TIME,
  sleep_end       TIME,
  language        TEXT NOT NULL DEFAULT 'cs',
  onboarded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- key/value context — preferences, school schedule details, sleep notes, ...
CREATE TABLE user_context (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  value           TEXT NOT NULL,
  source          TEXT,                              -- onboarding | manual | auto | vault
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, key)
);

CREATE TRIGGER trg_user_context_updated_at
  BEFORE UPDATE ON user_context
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- DOMAIN B — Habits
-- =============================================================================

CREATE TYPE habit_group       AS ENUM ('active', 'trial', 'graduated', 'retired');
CREATE TYPE habit_measurement AS ENUM ('binary', 'quantitative');
CREATE TYPE habit_status      AS ENUM ('done', 'fail', 'partial', 'unknown');
CREATE TYPE log_source        AS ENUM ('dashboard', 'voice', 'manual', 'sync');

CREATE TABLE habits (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  category              habit_group NOT NULL DEFAULT 'trial',
  measurement           habit_measurement NOT NULL DEFAULT 'binary',
  target_value          NUMERIC,                     -- e.g. 25 (Anki karet)
  frequency             TEXT,                        -- "denně" | "3×/týden" | "víkend"
  mandatory             BOOLEAN NOT NULL DEFAULT false,  -- bez grace day
  end_date              DATE,                        -- auto-retire (autoškola, Erasmus)
  cascade_dimension_id  UUID,                        -- FK doplněn po cascade_dimensions
  vault_serves          TEXT[],                      -- ['sen/japonština', 'prijem/B1-podpora']
  started_on            DATE NOT NULL DEFAULT CURRENT_DATE,
  trial_end             DATE,
  retired_on            DATE,
  retired_reason        TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, name)
);

CREATE INDEX idx_habits_category_active ON habits(category) WHERE retired_on IS NULL;

CREATE TRIGGER trg_habits_updated_at
  BEFORE UPDATE ON habits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE habit_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id          UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  status            habit_status NOT NULL,
  value_num         NUMERIC,                         -- pro quantitative habits
  source            log_source NOT NULL DEFAULT 'dashboard',
  conflict_flag_id  UUID,                            -- FK doplněn po conflict_flags
  notes             TEXT,
  logged_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(habit_id, date)
);

CREATE INDEX idx_habit_logs_date      ON habit_logs(date DESC);
CREATE INDEX idx_habit_logs_habit_day ON habit_logs(habit_id, date DESC);

CREATE TABLE streaks_cache (
  habit_id              UUID PRIMARY KEY REFERENCES habits(id) ON DELETE CASCADE,
  current_streak        INT NOT NULL DEFAULT 0,
  best_streak           INT NOT NULL DEFAULT 0,
  last_completed_date   DATE,
  last_grace_used       DATE,                        -- 1 rest day forgiveness tracker
  total_completions     INT NOT NULL DEFAULT 0,
  total_misses          INT NOT NULL DEFAULT 0,
  completion_rate_pct   NUMERIC,                     -- pro Graduation detection (90%+)
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- DOMAIN C — HOPE & energie
-- =============================================================================

CREATE TABLE hope_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  mood        INT NOT NULL CHECK (mood   BETWEEN 0 AND 10),
  energy      INT NOT NULL CHECK (energy BETWEEN 0 AND 10),
  hope        INT NOT NULL CHECK (hope   BETWEEN 0 AND 10),
  note        TEXT,
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, date)
);

CREATE INDEX idx_hope_logs_date ON hope_logs(date DESC);

CREATE TYPE energy_level AS ENUM ('low', 'mid', 'high');

CREATE TABLE energy_blocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_of_week     INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun
  hour_start      INT NOT NULL CHECK (hour_start  BETWEEN 0 AND 23),
  hour_end        INT NOT NULL CHECK (hour_end    BETWEEN 0 AND 23),
  level           energy_level NOT NULL,
  confidence      NUMERIC CHECK (confidence BETWEEN 0 AND 1),
  sample_size     INT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_energy_blocks_dow ON energy_blocks(day_of_week, hour_start);

CREATE TABLE hope_correlations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity_tag    TEXT NOT NULL,                     -- 'les', 'kytara', 'autoškola'...
  avg_hope_delta  NUMERIC NOT NULL,                  -- např. +1.8
  avg_energy_delta NUMERIC,
  avg_mood_delta  NUMERIC,
  sample_size     INT NOT NULL,
  last_seen_date  DATE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, activity_tag)
);

-- =============================================================================
-- DOMAIN D — Cascade
-- =============================================================================

CREATE TYPE cascade_tree AS ENUM ('sen', 'prijem');

CREATE TABLE cascade_layers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tree            cascade_tree NOT NULL,
  layer           INT NOT NULL CHECK (layer BETWEEN 1 AND 6),
  -- 1=sen 2=5let 3=rok 4=měsíc 5=týden 6=den
  title           TEXT NOT NULL,
  description     TEXT,
  deadline        DATE,
  progress_pct    NUMERIC CHECK (progress_pct BETWEEN 0 AND 100) DEFAULT 0,
  source_file     TEXT,                              -- 'sen.md' | '2026-06.md' | '2026-W23.md'
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, tree, layer)
);

CREATE TRIGGER trg_cascade_layers_updated_at
  BEFORE UPDATE ON cascade_layers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE cascade_dimensions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id      UUID NOT NULL REFERENCES cascade_layers(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  weight        NUMERIC NOT NULL DEFAULT 1.0,
  progress_pct  NUMERIC CHECK (progress_pct BETWEEN 0 AND 100) DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_cascade_dimensions_updated_at
  BEFORE UPDATE ON cascade_dimensions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE cascade_milestones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id        UUID NOT NULL REFERENCES cascade_layers(id) ON DELETE CASCADE,
  dimension_id    UUID REFERENCES cascade_dimensions(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  deadline        DATE,
  completed       BOOLEAN NOT NULL DEFAULT false,
  completed_date  DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_cascade_milestones_updated_at
  BEFORE UPDATE ON cascade_milestones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE cascade_chips (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_id      UUID NOT NULL REFERENCES cascade_dimensions(id) ON DELETE CASCADE,
  label             TEXT NOT NULL,
  linked_habit_ids  UUID[],
  context_text      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- now FK from habits to cascade_dimensions (forward reference resolved)
ALTER TABLE habits
  ADD CONSTRAINT fk_habits_cascade_dim
  FOREIGN KEY (cascade_dimension_id) REFERENCES cascade_dimensions(id) ON DELETE SET NULL;

-- =============================================================================
-- DOMAIN E — Hikari brain (memory, AI invocations, daily brief, conflicts)
-- =============================================================================

CREATE TYPE memory_type   AS ENUM ('preference', 'exception', 'pattern', 'rule', 'context');
CREATE TYPE memory_status AS ENUM ('proposed', 'active', 'rejected', 'archived');

CREATE TABLE hikari_memory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type          memory_type NOT NULL,
  content       TEXT NOT NULL,
  source        TEXT NOT NULL,                        -- 'vault:Memory.md' | 'vault:patterns-observed.md' | 'auto' | 'manual'
  source_ref    TEXT,                                 -- specific line/section reference
  status        memory_status NOT NULL DEFAULT 'proposed',
  confidence    NUMERIC CHECK (confidence BETWEEN 0 AND 1),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at   TIMESTAMPTZ,
  rejected_at   TIMESTAMPTZ
);

CREATE INDEX idx_hikari_memory_status ON hikari_memory(status);

CREATE TYPE invocation_trigger AS ENUM ('cron', 'button', 'onboarding', 'sync', 'on_demand');

CREATE TABLE ai_invocations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trigger       invocation_trigger NOT NULL,
  purpose       TEXT,                                 -- 'daily_brief' | 'pattern_detection' | 'business_suggestions' | ...
  model         TEXT NOT NULL,
  tokens_in     INT,
  tokens_out    INT,
  cost_usd      NUMERIC,
  duration_ms   INT,
  success       BOOLEAN NOT NULL DEFAULT true,
  error         TEXT,
  run_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_invocations_run_at ON ai_invocations(run_at DESC);

CREATE TABLE ai_daily_brief (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  hlavni          JSONB NOT NULL,                     -- [{title, project, reason}]
  vedlejsi        JSONB NOT NULL DEFAULT '[]',
  bonus           JSONB NOT NULL DEFAULT '[]',
  cascade_nudge   TEXT,
  reasoning       TEXT,
  invocation_id   UUID REFERENCES ai_invocations(id),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, date)
);

CREATE TYPE conflict_resolution AS ENUM ('pending', 'dashboard_wins', 'voice_wins', 'partial', 'dismissed');

CREATE TABLE conflict_flags (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date              DATE NOT NULL,
  habit_id          UUID REFERENCES habits(id) ON DELETE CASCADE,
  source_a          TEXT NOT NULL,                    -- e.g. 'dashboard'
  source_b          TEXT NOT NULL,                    -- e.g. 'voice'
  value_a           TEXT NOT NULL,
  value_b           TEXT NOT NULL,
  resolution        conflict_resolution NOT NULL DEFAULT 'pending',
  resolution_notes  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);

CREATE INDEX idx_conflict_flags_pending ON conflict_flags(resolution) WHERE resolution = 'pending';

-- forward FK from habit_logs
ALTER TABLE habit_logs
  ADD CONSTRAINT fk_habit_logs_conflict
  FOREIGN KEY (conflict_flag_id) REFERENCES conflict_flags(id) ON DELETE SET NULL;

-- =============================================================================
-- DOMAIN F — Business (schema ready, UI fázovaně)
-- =============================================================================

CREATE TYPE product_status AS ENUM ('idea', 'building', 'launched', 'stable', 'paused', 'retired');
CREATE TYPE product_type   AS ENUM ('app', 'course', 'subscription', 'plugin', 'template', 'service', 'other');

CREATE TABLE products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  codename          TEXT NOT NULL,                    -- 'B1' | 'B2' | 'B3'...
  name              TEXT NOT NULL,
  type              product_type,
  status            product_status NOT NULL DEFAULT 'idea',
  description       TEXT,
  launched_at       DATE,
  churn_target_pct  NUMERIC,                          -- target max -14% per prijem.md
  mrr_target_kc     NUMERIC,                          -- 50 000 Kč cíl / 30 000 Kč podlaha
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, codename)
);

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE product_metrics (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  month               DATE NOT NULL,                  -- první den měsíce
  mrr_kc              NUMERIC NOT NULL DEFAULT 0,
  customer_count      INT NOT NULL DEFAULT 0,
  new_customers       INT NOT NULL DEFAULT 0,
  churned_customers   INT NOT NULL DEFAULT 0,
  churn_pct           NUMERIC,
  hours_spent         NUMERIC,                        -- per prijem.md "5-10h/týden ideal"
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, month)
);

CREATE INDEX idx_product_metrics_month ON product_metrics(month DESC);

CREATE TYPE task_status AS ENUM ('backlog', 'doing', 'blocked', 'done', 'skipped');

CREATE TABLE product_tasks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  description           TEXT,
  status                task_status NOT NULL DEFAULT 'backlog',
  priority              INT NOT NULL DEFAULT 0,
  cascade_milestone_id  UUID REFERENCES cascade_milestones(id) ON DELETE SET NULL,
  due_date              DATE,
  estimated_hours       NUMERIC,
  actual_hours          NUMERIC,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ
);

CREATE INDEX idx_product_tasks_status ON product_tasks(status);

CREATE TYPE suggestion_status AS ENUM ('pending', 'approved', 'rejected', 'in_progress', 'done', 'expired');

CREATE TABLE ai_business_suggestions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id            UUID REFERENCES products(id) ON DELETE CASCADE,
  suggestion_text       TEXT NOT NULL,
  rationale             TEXT NOT NULL,
  expected_impact       TEXT,
  status                suggestion_status NOT NULL DEFAULT 'pending',
  decided_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  actual_impact_notes   TEXT,
  invocation_id         UUID REFERENCES ai_invocations(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_business_suggestions_pending ON ai_business_suggestions(status) WHERE status = 'pending';

CREATE TABLE time_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  date        DATE NOT NULL,
  hours       NUMERIC NOT NULL CHECK (hours > 0),
  focus_area  TEXT,                                   -- 'coding' | 'marketing' | 'support' | ...
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_time_log_date ON time_log(date DESC);

CREATE TABLE revenue_trajectory (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month               DATE NOT NULL,
  total_mrr_kc        NUMERIC NOT NULL DEFAULT 0,
  products_count      INT NOT NULL DEFAULT 0,
  on_track_for_50k    BOOLEAN,                        -- alignment s prijem.md cíl
  projection_at_50k   DATE,                           -- AI odhad kdy dosáhneš 50k cíle
  reasoning           TEXT,
  invocation_id       UUID REFERENCES ai_invocations(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, month)
);

-- =============================================================================
-- Row Level Security — Single-user mode
-- =============================================================================
-- All tables enabled. Permissive policy: any authenticated session has full
-- access. Single-user safety relies on Supabase Project Settings →
-- Authentication → Providers → Google → restrict to single allowed email.
-- V2 migration will replace with per-profile RLS when multi-user activates.

ALTER TABLE profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_context             ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks_cache            ENABLE ROW LEVEL SECURITY;
ALTER TABLE hope_logs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_blocks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE hope_correlations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cascade_layers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cascade_dimensions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cascade_milestones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cascade_chips            ENABLE ROW LEVEL SECURITY;
ALTER TABLE hikari_memory            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_invocations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_daily_brief           ENABLE ROW LEVEL SECURITY;
ALTER TABLE conflict_flags           ENABLE ROW LEVEL SECURITY;
ALTER TABLE products                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_metrics          ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_business_suggestions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_log                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_trajectory       ENABLE ROW LEVEL SECURITY;

CREATE POLICY authenticated_all ON profiles                FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON user_context            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON habits                  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON habit_logs              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON streaks_cache           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON hope_logs               FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON energy_blocks           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON hope_correlations       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON cascade_layers          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON cascade_dimensions      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON cascade_milestones      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON cascade_chips           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON hikari_memory           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON ai_invocations          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON ai_daily_brief          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON conflict_flags          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON products                FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON product_metrics         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON product_tasks           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON ai_business_suggestions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON time_log                FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON revenue_trajectory      FOR ALL TO authenticated USING (true) WITH CHECK (true);
