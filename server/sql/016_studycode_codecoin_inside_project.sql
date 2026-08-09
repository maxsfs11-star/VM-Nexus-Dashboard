-- CodeCoin pertence ao projeto StudyCode; não é um produto independente.
WITH studycode AS (
  SELECT id FROM nexus_products WHERE slug = 'studycode'
), codecoin AS (
  SELECT id FROM nexus_products WHERE slug = 'studycode-codecoin'
)
UPDATE studycode_coin_packs pack
SET product_id = studycode.id,
    updated_at = NOW()
FROM studycode, codecoin
WHERE pack.product_id = codecoin.id;

UPDATE nexus_products
SET status = 'archived', updated_at = NOW()
WHERE slug = 'studycode-codecoin';
