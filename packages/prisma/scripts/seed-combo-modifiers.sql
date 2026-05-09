-- ─────────────────────────────────────────────────────────────
-- Seed: agrega el modificador "Complementos" con cupos a cada Combo.
--
-- Ejecutar en producción con Railway CLI:
--   railway run psql $DATABASE_URL -f packages/prisma/scripts/seed-combo-modifiers.sql
-- O en local:
--   psql -U <user> -d <db> -f packages/prisma/scripts/seed-combo-modifiers.sql
--
-- Idempotente: borra modificadores "Complementos" pre-existentes
-- en combos antes de crear, así puede correrse N veces sin duplicar.
-- ─────────────────────────────────────────────────────────────

BEGIN;

DELETE FROM "ProductModifier"
WHERE name = 'Complementos'
  AND "productId" IN (
    SELECT id FROM "Product" WHERE category = 'COMBOS'
  );

WITH cfg(match, quota) AS (
  VALUES
    ('personal', 1),
    ('pareja',   2),
    ('familiar', 3),
    ('extra',    3),
    ('jumbo',    6)
)
INSERT INTO "ProductModifier" (id, "productId", name, options, required, "maxSelect", "minSelect", "totalQuota", "sortOrder")
SELECT
  'cmod_' || substring(md5(random()::text || p.id) for 20),
  p.id,
  'Complementos',
  '[
    {"label": "Puré de papa", "price": 0},
    {"label": "Sopa de codito", "price": 0},
    {"label": "Ensalada de zanahoria con col", "price": 0}
  ]'::json,
  true,
  cfg.quota,
  0,
  cfg.quota,
  0
FROM "Product" p
JOIN cfg ON LOWER(p.name) LIKE '%' || cfg.match || '%'
WHERE p.category = 'COMBOS';

COMMIT;

-- Verificación
SELECT
  p.name           AS combo,
  m.name           AS modificador,
  m."totalQuota"   AS cupos,
  json_array_length(m.options::json) AS opciones
FROM "Product" p
JOIN "ProductModifier" m ON m."productId" = p.id
WHERE p.category = 'COMBOS' AND m.name = 'Complementos'
ORDER BY p."sortOrder";
