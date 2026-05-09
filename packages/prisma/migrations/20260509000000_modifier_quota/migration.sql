-- ProductModifier: total quota slots (e.g. combo with 3 sides distributable across options)
ALTER TABLE "ProductModifier" ADD COLUMN "totalQuota" INTEGER;

-- OrderItemModifier: how many units of this option were picked (for quota modifiers)
ALTER TABLE "OrderItemModifier" ADD COLUMN "qty" INTEGER NOT NULL DEFAULT 1;
