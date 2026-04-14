-- ═══════════════════════════════════════════════════════════
-- Customer: internalNote + updatedAt
-- ═══════════════════════════════════════════════════════════
ALTER TABLE "Customer" ADD COLUMN "internalNote" TEXT;
ALTER TABLE "Customer" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ═══════════════════════════════════════════════════════════
-- Product: emoji + createdAt + updatedAt
-- ═══════════════════════════════════════════════════════════
ALTER TABLE "Product" ADD COLUMN "emoji" TEXT DEFAULT '🍗';
ALTER TABLE "Product" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Product" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ═══════════════════════════════════════════════════════════
-- ProductModifier
-- ═══════════════════════════════════════════════════════════
CREATE TABLE "ProductModifier" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "options" JSONB NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "maxSelect" INTEGER NOT NULL DEFAULT 1,
  "minSelect" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ProductModifier_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProductModifier" ADD CONSTRAINT "ProductModifier_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════
-- Promotion + PromotionItem
-- ═══════════════════════════════════════════════════════════
CREATE TABLE "Promotion" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "dayOfWeek" INTEGER,
  "price" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionItem" (
  "id" TEXT NOT NULL,
  "promotionId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "qty" INTEGER NOT NULL DEFAULT 1,
  "variant" TEXT,
  CONSTRAINT "PromotionItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PromotionItem" ADD CONSTRAINT "PromotionItem_promotionId_fkey"
  FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionItem" ADD CONSTRAINT "PromotionItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════
-- Order: scheduled fields + SCHEDULED status
-- ═══════════════════════════════════════════════════════════
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';

ALTER TABLE "Order" ADD COLUMN "isScheduled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "scheduledFor" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "depositAmount" INTEGER;
ALTER TABLE "Order" ADD COLUMN "depositPaidAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "remainingAmount" INTEGER;

-- ═══════════════════════════════════════════════════════════
-- OrderItemModifier
-- ═══════════════════════════════════════════════════════════
CREATE TABLE "OrderItemModifier" (
  "id" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "option" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  CONSTRAINT "OrderItemModifier_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OrderItemModifier" ADD CONSTRAINT "OrderItemModifier_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════
-- LoyaltyCard: rewrite to 5-order count system
-- ═══════════════════════════════════════════════════════════
ALTER TABLE "LoyaltyCard" ADD COLUMN "completedOrders" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LoyaltyCard" ADD COLUMN "freeProductsEarned" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LoyaltyCard" ADD COLUMN "freeProductsUsed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LoyaltyCard" ADD COLUMN "pendingProductId" TEXT;
ALTER TABLE "LoyaltyCard" ADD COLUMN "rewardEarnedAt" TIMESTAMP(3);

ALTER TABLE "LoyaltyCard" ADD CONSTRAINT "LoyaltyCard_pendingProductId_fkey"
  FOREIGN KEY ("pendingProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════
-- LoyaltyEvent: rename pointsDelta → orderDelta
-- ═══════════════════════════════════════════════════════════
ALTER TABLE "LoyaltyEvent" RENAME COLUMN "pointsDelta" TO "orderDelta";
ALTER TABLE "LoyaltyEvent" ALTER COLUMN "orderDelta" SET DEFAULT 1;
