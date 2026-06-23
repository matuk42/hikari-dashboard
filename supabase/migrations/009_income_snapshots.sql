-- =============================================================================
-- 009_income_snapshots.sql — current income anchor for cascade %
-- =============================================================================
-- The cascade income milestones (L2/L3: "500 Kč/měs", "500 Kč/h před koncem
-- střední", "30k/50k Kč/měs") were scored by Gemini BLIND — nothing in the system
-- told it how much Matyáš actually earns. This table is the hard data anchor.
--
-- Append-only snapshots (one per entry, not an upsert) so we keep a trajectory in
-- time — useful later for "Zlepšení za měsíc". The cascade milestone calc reads
-- the LATEST row and feeds it into the Gemini prompt.
--
-- Distinct from the business-module domain F (revenue_trajectory / product_metrics):
-- that is per-product MRR for Fáze 2 (až přijdou první Kč). This is the personal,
-- earlier, single-number-per-stream anchor.
-- =============================================================================

CREATE TABLE income_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date              DATE NOT NULL,                     -- den zadání snapshotu
  monthly_income_kc NUMERIC NOT NULL DEFAULT 0,        -- aktuální čistý měsíční příjem (Kč/měs)
  hourly_rate_kc    NUMERIC NOT NULL DEFAULT 0,        -- aktuální hodinová sazba (Kč/h) — milník 500 Kč/h 2029
  total_earned_kc   NUMERIC NOT NULL DEFAULT 0,        -- kumulativně vyděláno doteď (Kč)
  note              TEXT,
  logged_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_income_snapshots_latest ON income_snapshots(profile_id, date DESC, logged_at DESC);

ALTER TABLE income_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY authenticated_all ON income_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
