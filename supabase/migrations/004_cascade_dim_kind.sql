-- =============================================================================
-- 004_cascade_dim_kind.sql — kind / detail / sort_order for cascade_dimensions
-- =============================================================================
-- Weekly plan in vault now has three sub-sections under "## Priority W##":
--   ### Hlavní    (povinné)
--   ### Vedlejší  (ano-pokud-zvládneš)
--   ### Bonus     (jen pokud chuť/čas)
-- Dashboard home needs to render all three groups with the description text
-- that follows the em-dash. Adding three nullable columns keeps existing rows
-- (L1–L4 dimensions) untouched.
-- =============================================================================

ALTER TABLE cascade_dimensions
  ADD COLUMN IF NOT EXISTS kind        TEXT,
  ADD COLUMN IF NOT EXISTS detail      TEXT,
  ADD COLUMN IF NOT EXISTS sort_order  INT NOT NULL DEFAULT 0;

-- kind is informational; constrain values when present.
ALTER TABLE cascade_dimensions
  DROP CONSTRAINT IF EXISTS cascade_dimensions_kind_check;
ALTER TABLE cascade_dimensions
  ADD  CONSTRAINT cascade_dimensions_kind_check
       CHECK (kind IS NULL OR kind IN ('main', 'side', 'bonus'));

-- Helpful for ordered fetches on the weekly layer.
CREATE INDEX IF NOT EXISTS idx_cascade_dimensions_layer_sort
  ON cascade_dimensions (layer_id, sort_order);
