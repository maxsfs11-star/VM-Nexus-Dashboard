-- Catálogo comercial inicial do StudyCode.
-- Preços, benefícios e limites continuam editáveis pelo VM Nexus Dashboard.

INSERT INTO nexus_products (name, slug, description, status)
VALUES (
  'StudyCode',
  'studycode',
  'Plataforma de ensino de programação da VM Nexus Digital.',
  'available'
)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    status = 'available',
    updated_at = NOW();

WITH produto AS (
  SELECT id FROM nexus_products WHERE slug = 'studycode'
), planos(name, slug, description, monthly_price, features, display_order) AS (
  VALUES
    (
      'Free',
      'free',
      'HTML e CSS completos, JavaScript básico e recursos essenciais para começar.',
      0.00,
      '{
        "access": ["html-completo", "css-completo", "javascript-basico"],
        "allTracks": false,
        "ads": true,
        "adsMode": "non_intrusive",
        "aiQuestionsPerDay": 3,
        "aiQuestionsPerMonth": 90,
        "certificates": false,
        "projects": false,
        "benefits": [
          "HTML completo",
          "CSS completo",
          "JavaScript básico",
          "Desafios e revisões essenciais",
          "3 perguntas de IA por dia"
        ]
      }'::jsonb,
      1
    ),
    (
      'Premium',
      'premium',
      'Todas as trilhas, projetos, certificados e mentoria StudyCode AI.',
      29.90,
      '{
        "access": ["all-tracks"],
        "allTracks": true,
        "ads": false,
        "adsMode": "none",
        "aiQuestionsPerDay": 20,
        "aiQuestionsPerMonth": 600,
        "certificates": true,
        "projects": true,
        "benefits": [
          "Todas as linguagens liberadas",
          "JavaScript completo, React, TypeScript, Node.js e Next.js",
          "Python, Java, C#, SQL e novas trilhas",
          "Aulas de VS Code e Sublime Text",
          "Projetos completos e certificados",
          "Mentoria StudyCode AI",
          "Sem anúncios"
        ]
      }'::jsonb,
      2
    )
)
INSERT INTO nexus_plans (product_id, name, slug, description, monthly_price, features, display_order)
SELECT produto.id, planos.name, planos.slug, planos.description, planos.monthly_price, planos.features, planos.display_order
FROM produto CROSS JOIN planos
ON CONFLICT (product_id, slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    monthly_price = EXCLUDED.monthly_price,
    features = EXCLUDED.features,
    display_order = EXCLUDED.display_order,
    active = TRUE;
