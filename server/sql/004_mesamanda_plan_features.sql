-- Capacidades comerciais do MesaManda. A VM Nexus é a fonte de verdade
-- para a liberação de módulos contratados por cada tenant.
WITH produto AS (
  SELECT id FROM nexus_products WHERE slug = 'mesamanda'
)
UPDATE nexus_plans AS plano
SET
  features = configuracao.features::jsonb,
  description = configuracao.description,
  display_order = configuracao.display_order
FROM produto
INNER JOIN (
  VALUES
    (
      'starter',
      'Gerência e caixa para uma operação essencial e organizada.',
      '{"features":["manager","cashier","catalog","customers","inventory","cash_management","basic_reports"]}',
      1
    ),
    (
      'premium',
      'Operação completa com salão, conveniência e produção integrada.',
      '{"features":["manager","cashier","catalog","customers","inventory","cash_management","basic_reports","advanced_reports","team_management","salon","waiter","convenience","kitchen","grill","production","qr_ordering"]}',
      2
    ),
    (
      'ia',
      'Operação Premium preparada para recursos inteligentes opcionais.',
      '{"features":["manager","cashier","catalog","customers","inventory","cash_management","basic_reports","advanced_reports","team_management","salon","waiter","convenience","kitchen","grill","production","qr_ordering","smartflow","ai_weather","ai_intelligent_reports","ai_manager_assistant","ai_stock_insights","ai_operations_suggestions"]}',
      3
    )
) AS configuracao(slug, description, features, display_order)
  ON plano.slug = configuracao.slug
WHERE plano.product_id = produto.id;
