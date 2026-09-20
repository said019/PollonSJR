-- Disable the app-exclusive free chicken-fingers promotion.
-- Redemption history is intentionally preserved for reporting/auditing.
DELETE FROM "ProductModifier"
WHERE "name" = 'Promo app: dedos de pollo GRATIS';

UPDATE "Product"
SET "description" = btrim(
  replace(
    replace(
      "description",
      ' Exclusivo en la app: orden de dedos de pollo GRATIS con salsa BBQ Hot, Mango o Tamarindo. Una promoción por cliente.',
      ''
    ),
    ' Exclusivo en la app: orden de dedos de pollo GRATIS con salsa BBQ Hot, Mango o Tamarindo.',
    ''
  )
)
WHERE "name" = 'Combo Familiar'
  AND "description" ILIKE '%dedos de pollo GRATIS%';
