ALTER TABLE nexus_products
  ADD COLUMN IF NOT EXISTS technologies TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE nexus_products
SET technologies = ARRAY[technology]
WHERE cardinality(technologies) = 0
  AND technology IS NOT NULL;
