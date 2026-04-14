-- CreateEnum: PayMethod
CREATE TYPE "PayMethod" AS ENUM ('CARD', 'CASH', 'TRANSFER');

-- CreateEnum: CouponType
CREATE TYPE "CouponType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum: RewardType
CREATE TYPE "RewardType" AS ENUM ('PERCENT_DISCOUNT', 'FIXED_DISCOUNT', 'FREE_PRODUCT');

-- AlterTable: Order — add payment method, coupon, ETA fields
ALTER TABLE "Order" ADD COLUMN "paymentMethod" "PayMethod" NOT NULL DEFAULT 'CARD';
ALTER TABLE "Order" ADD COLUMN "cashAmount" INTEGER;
ALTER TABLE "Order" ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "estimatedMinutes" INTEGER;
ALTER TABLE "Order" ADD COLUMN "couponId" TEXT;

-- CreateTable: SavedAddress
CREATE TABLE "SavedAddress" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedAddress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SavedAddress_customerId_alias_key" ON "SavedAddress"("customerId", "alias");
ALTER TABLE "SavedAddress" ADD CONSTRAINT "SavedAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: Coupon
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" INTEGER NOT NULL,
    "minOrderAmount" INTEGER,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: LoyaltyReward
CREATE TABLE "LoyaltyReward" (
    "id" TEXT NOT NULL,
    "tier" "LoyaltyTier" NOT NULL,
    "type" "RewardType" NOT NULL,
    "value" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LoyaltyReward_pkey" PRIMARY KEY ("id")
);

-- AlterTable: LoyaltyCard — add pending reward fields
ALTER TABLE "LoyaltyCard" ADD COLUMN "pendingReward" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LoyaltyCard" ADD COLUMN "pendingRewardType" "RewardType";
ALTER TABLE "LoyaltyCard" ADD COLUMN "pendingRewardValue" INTEGER;
ALTER TABLE "LoyaltyCard" ADD COLUMN "rewardExpiresAt" TIMESTAMP(3);
