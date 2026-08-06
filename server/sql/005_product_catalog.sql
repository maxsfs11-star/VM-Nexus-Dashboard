ALTER TABLE nexus_products
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'system'
    CHECK (product_type IN ('system', 'mobile_app', 'web_app', 'service')),
  ADD COLUMN IF NOT EXISTS platforms TEXT[] NOT NULL DEFAULT ARRAY['web']::TEXT[];

CREATE INDEX IF NOT EXISTS nexus_products_status_idx
  ON nexus_products (status, created_at DESC);
