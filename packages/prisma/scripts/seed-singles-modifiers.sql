-- ─────────────────────────────────────────────────────────────
-- Seed: modificador "Sabor" para complementos sueltos y salsa extra.
--
-- Productos individuales que requieren elección de sabor:
--   - "Complemento Chico"  → 1 elección de Puré / Sopa / Ensalada
--   - "Complemento Grande" → 1 elección de Puré / Sopa / Ensalada
--   - "Salsa Extra"        → 1 elección de Tamarindo / Mango / etc.
--
-- Idempotente: borra modificador "Sabor" pre-existente en estos
-- productos antes de insertar.
--
-- Ejecutar:
--   railway run psql $DATABASE_URL -f packages/prisma/scripts/seed-singles-modifiers.sql
-- ─────────────────────────────────────────────────────────────

BEGIN;

-- 1. Borrar modificadores "Sabor" pre-existentes en estos productos
DELETE FROM "ProductModifier"
WHERE name = 'Sabor'
  AND "productId" IN (
    SELECT id FROM "Product"
    WHERE LOWER(name) LIKE '%complemento%'
       OR LOWER(name) LIKE '%salsa extra%'
  );

-- 2. Sabor para "Complemento Chico" y "Complemento Grande"
INSERT INTO "ProductModifier" (id, "productId", name, options, required, "maxSelect", "minSelect", "totalQuota", "sortOrder")
SELECT
  'cmod_' || substring(md5(random()::text || p.id) for 20),
  p.id,
  'Sabor',
  '[
    {"label": "Puré de papa", "price": 0},
    {"label": "Sopa de codito", "price": 0},
    {"label": "Ensalada de zanahoria con col", "price": 0}
  ]'::json,
  true,    -- obligatorio
  1,       -- maxSelect
  1,       -- minSelect (al menos 1)
  NULL,    -- sin cupos (es un single-select normal)
  0
FROM "Product" p
WHERE p.category = 'COMPLEMENTOS'
  AND LOWER(p.name) LIKE 'complemento%';

-- 3. Sabor para "Salsa Extra"
INSERT INTO "ProductModifier" (id, "productId", name, options, required, "maxSelect", "minSelect", "totalQuota", "sortOrder")
SELECT
  'cmod_' || substring(md5(random()::text || p.id) for 20),
  p.id,
  'Sabor',
  '[
    {"label": "BBQ", "price": 0},
    {"label": "BBQ Hot", "price": 0},
    {"label": "Tamarindo", "price": 0},
    {"label": "Mango", "price": 0},
    {"label": "Chimichurri", "price": 0},
    {"label": "Aderezo Ranch", "price": 0},
    {"label": "Queso Amarillo", "price": 0}
  ]'::json,
  true,
  1,
  1,
  NULL,
  0
FROM "Product" p
WHERE p.category = 'COMPLEMENTOS'
  AND LOWER(p.name) LIKE 'salsa extra%';

COMMIT;

-- Verificación
SELECT
  p.name           AS producto,
  m.name           AS modificador,
  m.required       AS obligatorio,
  m."minSelect"    AS min,
  m."maxSelect"    AS max,
  json_array_length(m.options::json) AS opciones
FROM "Product" p
JOIN "ProductModifier" m ON m."productId" = p.id
WHERE p.category = 'COMPLEMENTOS'
  AND m.name = 'Sabor'
ORDER BY p.name;
