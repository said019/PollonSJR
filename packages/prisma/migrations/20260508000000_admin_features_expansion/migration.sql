-- Customer: blocking
ALTER TABLE "Customer" ADD COLUMN "blocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Customer" ADD COLUMN "blockedReason" TEXT;

-- Promotion: time window, discount code, usage limits
ALTER TABLE "Promotion" ADD COLUMN "startTime" TEXT;
ALTER TABLE "Promotion" ADD COLUMN "endTime" TEXT;
ALTER TABLE "Promotion" ADD COLUMN "code" TEXT;
ALTER TABLE "Promotion" ADD COLUMN "maxUses" INTEGER;
ALTER TABLE "Promotion" ADD COLUMN "usedCount" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");

-- DeliveryZone: per-zone time window
ALTER TABLE "DeliveryZone" ADD COLUMN "startTime" TEXT;
ALTER TABLE "DeliveryZone" ADD COLUMN "endTime" TEXT;
