-- Customer favorites
ALTER TABLE "Customer" ADD COLUMN "favoriteProductIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Product tags (vegetarian, spicy, gluten_free, etc.)
ALTER TABLE "Product" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Push subscriptions
CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_customerId_idx" ON "PushSubscription"("customerId");

ALTER TABLE "PushSubscription"
  ADD CONSTRAINT "PushSubscription_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
