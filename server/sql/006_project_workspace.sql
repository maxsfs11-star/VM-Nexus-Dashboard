ALTER TABLE nexus_products
  ADD COLUMN IF NOT EXISTS technology TEXT,
  ADD COLUMN IF NOT EXISTS tenant_enabled BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE nexus_products
SET tenant_enabled = TRUE
WHERE slug = 'mesamanda'
   OR EXISTS (SELECT 1 FROM nexus_tenants tenant WHERE tenant.product_key = nexus_products.slug);
