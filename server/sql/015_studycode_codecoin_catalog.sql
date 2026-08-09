-- CodeCoin é um produto consumível e não uma assinatura.

INSERT INTO nexus_products (name, slug, description, status)
VALUES (
  'StudyCode CodeCoin',
  'studycode-codecoin',
  'Moeda virtual consumível para recursos extras do StudyCode.',
  'available'
)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    status = 'available',
    updated_at = NOW();

CREATE TABLE IF NOT EXISTS studycode_coin_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES nexus_products(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  coin_amount INTEGER NOT NULL CHECK (coin_amount > 0),
  price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency TEXT NOT NULL DEFAULT 'BRL',
  stripe_price_id TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, slug)
);

WITH produto AS (
  SELECT id FROM nexus_products WHERE slug = 'studycode-codecoin'
), pacotes(slug, name, coin_amount, price, display_order) AS (
  VALUES
    ('coins-100', '100 CodeCoins', 100, 39.90, 1),
    ('coins-300', '300 CodeCoins', 300, 89.90, 2),
    ('coins-700', '700 CodeCoins', 700, 169.90, 3)
)
INSERT INTO studycode_coin_packs (product_id, slug, name, coin_amount, price, display_order)
SELECT produto.id, pacotes.slug, pacotes.name, pacotes.coin_amount, pacotes.price, pacotes.display_order
FROM produto CROSS JOIN pacotes
ON CONFLICT (product_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    coin_amount = EXCLUDED.coin_amount,
    price = EXCLUDED.price,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

CREATE INDEX IF NOT EXISTS studycode_coin_packs_active_idx
  ON studycode_coin_packs (product_id, active, display_order);
