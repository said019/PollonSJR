-- Promo exclusiva de la app: Combo Familiar + dedos de pollo gratis.
-- La salsa se guarda como modificador del combo para que llegue a cocina.

UPDATE "Product"
SET description = '8 piezas + 3 complementos grandes + 5 bisquets. Exclusivo en la app: orden de dedos de pollo GRATIS con salsa BBQ Hot, Mango o Tamarindo. Una promoción por cliente.'
WHERE LOWER(name) = 'combo familiar';

-- Retira cualquier variante de Chipotle (incluido "Chipotle cremoso") y
-- agrega Chimichurri conservando el precio que tenía la opción reemplazada.
UPDATE "ProductModifier" AS pm
SET options = (
  SELECT
    COALESCE(
      jsonb_agg(entry.value ORDER BY entry.ordinality)
        FILTER (WHERE LOWER(entry.value->>'label') NOT LIKE '%chipotle%'),
      '[]'::jsonb
    ) ||
    CASE
      WHEN bool_or(LOWER(entry.value->>'label') = 'chimichurri') THEN '[]'::jsonb
      ELSE jsonb_build_array(
        jsonb_build_object(
          'label', 'Chimichurri',
          'price', COALESCE(
            MAX((entry.value->>'price')::integer)
              FILTER (WHERE LOWER(entry.value->>'label') LIKE '%chipotle%'),
            0
          )
        )
      )
    END
  FROM jsonb_array_elements(pm.options::jsonb) WITH ORDINALITY AS entry(value, ordinality)
)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(pm.options::jsonb) AS option
  WHERE LOWER(option->>'label') LIKE '%chipotle%'
);

DO $$
DECLARE
  combo_id TEXT;
  promo_modifier_id TEXT;
BEGIN
  SELECT id INTO combo_id
  FROM "Product"
  WHERE LOWER(name) = 'combo familiar'
  ORDER BY "createdAt" ASC
  LIMIT 1;

  IF combo_id IS NULL THEN
    RAISE NOTICE 'Combo Familiar no encontrado; se omite el modificador promocional.';
    RETURN;
  END IF;

  SELECT id INTO promo_modifier_id
  FROM "ProductModifier"
  WHERE "productId" = combo_id
    AND LOWER(name) = 'promo app: dedos de pollo gratis'
  LIMIT 1;

  IF promo_modifier_id IS NULL THEN
    INSERT INTO "ProductModifier" (
      id,
      "productId",
      name,
      options,
      required,
      "maxSelect",
      "minSelect",
      "totalQuota",
      "sortOrder"
    ) VALUES (
      'promo_combo_familiar_salsa',
      combo_id,
      'Promo app: dedos de pollo GRATIS',
      '[
        {"label": "BBQ Hot", "price": 0},
        {"label": "Mango", "price": 0},
        {"label": "Tamarindo", "price": 0}
      ]'::jsonb,
      false,
      1,
      0,
      NULL,
      10
    );
  ELSE
    UPDATE "ProductModifier"
    SET
      name = 'Promo app: dedos de pollo GRATIS',
      options = '[
        {"label": "BBQ Hot", "price": 0},
        {"label": "Mango", "price": 0},
        {"label": "Tamarindo", "price": 0}
      ]'::jsonb,
      required = false,
      "maxSelect" = 1,
      "minSelect" = 0,
      "totalQuota" = NULL,
      "sortOrder" = 10
    WHERE id = promo_modifier_id;
  END IF;
END $$;

-- Registro genérico de redenciones. La restricción compuesta hace que dos
-- pedidos simultáneos del mismo cliente no puedan consumir la promo dos veces.
CREATE TABLE IF NOT EXISTS "CustomerPromotionRedemption" (
  id TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "promotionKey" TEXT NOT NULL,
  "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerPromotionRedemption_pkey" PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerPromotionRedemption_customerId_promotionKey_key"
  ON "CustomerPromotionRedemption"("customerId", "promotionKey");

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerPromotionRedemption_orderId_promotionKey_key"
  ON "CustomerPromotionRedemption"("orderId", "promotionKey");

CREATE INDEX IF NOT EXISTS "CustomerPromotionRedemption_promotionKey_idx"
  ON "CustomerPromotionRedemption"("promotionKey");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'CustomerPromotionRedemption_customerId_fkey'
  ) THEN
    ALTER TABLE "CustomerPromotionRedemption"
      ADD CONSTRAINT "CustomerPromotionRedemption_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"(id)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'CustomerPromotionRedemption_orderId_fkey'
  ) THEN
    ALTER TABLE "CustomerPromotionRedemption"
      ADD CONSTRAINT "CustomerPromotionRedemption_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"(id)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
