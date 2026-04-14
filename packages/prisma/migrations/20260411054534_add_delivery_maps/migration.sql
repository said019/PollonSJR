/*
  Warnings:

  - You are about to drop the column `colonies` on the `DeliveryZone` table. All the data in the column will be lost.
  - You are about to drop the column `orderId` on the `LoyaltyEvent` table. All the data in the column will be lost.
  - You are about to drop the column `points` on the `LoyaltyEvent` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `LoyaltyEvent` table. All the data in the column will be lost.
  - You are about to drop the column `changedAt` on the `OrderStatusLog` table. All the data in the column will be lost.
  - Added the required column `maxKm` to the `DeliveryZone` table without a default value. This is not possible if the table is not empty.
  - Added the required column `minKm` to the `DeliveryZone` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pointsDelta` to the `LoyaltyEvent` table without a default value. This is not possible if the table is not empty.
  - Added the required column `reason` to the `LoyaltyEvent` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DeliveryZone" DROP COLUMN "colonies",
ADD COLUMN     "color" TEXT NOT NULL DEFAULT '#F07820',
ADD COLUMN     "maxKm" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "minKm" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LoyaltyEvent" DROP COLUMN "orderId",
DROP COLUMN "points",
DROP COLUMN "type",
ADD COLUMN     "pointsDelta" INTEGER NOT NULL,
ADD COLUMN     "reason" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryLat" DOUBLE PRECISION,
ADD COLUMN     "deliveryLng" DOUBLE PRECISION,
ADD COLUMN     "deliveryZoneId" TEXT;

-- AlterTable
ALTER TABLE "OrderStatusLog" DROP COLUMN "changedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "note" TEXT;

-- CreateTable
CREATE TABLE "StoreLocation" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "address" TEXT NOT NULL,

    CONSTRAINT "StoreLocation_pkey" PRIMARY KEY ("id")
);
