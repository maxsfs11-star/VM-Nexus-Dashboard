ALTER TABLE nexus_plans ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE nexus_plans ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE nexus_plans ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE nexus_plans ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

INSERT INTO nexus_products (name, slug, description, status)
VALUES ('MesaManda', 'mesamanda', 'Sistema de gestão para restaurantes e estabelecimentos de alimentação.', 'available')
ON CONFLICT (slug) DO UPDATE SET status = 'available', updated_at = NOW();

WITH produto AS (SELECT id FROM nexus_products WHERE slug = 'mesamanda')
INSERT INTO nexus_plans (product_id, name, slug, description, monthly_price, features, display_order)
SELECT produto.id, plano.name, plano.slug, plano.description, 0, plano.features::jsonb, plano.display_order
FROM produto
CROSS JOIN (VALUES
  ('Starter', 'starter', 'Operação essencial para começar com organização.', '{"modules":["mesas","pedidos","caixa"]}', 1),
  ('Premium', 'premium', 'Recursos completos para operação e gestão.', '{"modules":["mesas","pedidos","caixa","estoque","relatorios","clientes"]}', 2),
  ('IA', 'ia', 'Plano avançado com recursos de inteligência artificial.', '{"modules":["mesas","pedidos","caixa","estoque","relatorios","clientes","ia"]}', 3)
) AS plano(name, slug, description, features, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM nexus_plans existente
  WHERE existente.product_id = produto.id AND existente.slug = plano.slug
);

CREATE UNIQUE INDEX IF NOT EXISTS nexus_plans_product_slug_idx ON nexus_plans(product_id, slug);
CREATE INDEX IF NOT EXISTS nexus_subscriptions_active_idx ON nexus_subscriptions(tenant_id, status);
