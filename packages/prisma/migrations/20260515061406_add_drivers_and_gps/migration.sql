-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "photoUrl" TEXT,
    "vehicle" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "locationUpdatedAt" TIMESTAMP(3),
    "onShift" BOOLEAN NOT NULL DEFAULT false,
    "shiftStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Driver_email_key" ON "Driver"("email");

-- CreateIndex
CREATE INDEX "Driver_active_onShift_idx" ON "Driver"("active", "onShift");

-- CreateTable
CREATE TABLE "DriverLocationPing" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "orderId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverLocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverLocationPing_driverId_createdAt_idx" ON "DriverLocationPing"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "DriverLocationPing_orderId_createdAt_idx" ON "DriverLocationPing"("orderId", "createdAt");

-- AlterTable: Order gets driver assignment columns
ALTER TABLE "Order" ADD COLUMN "driverId" TEXT;
ALTER TABLE "Order" ADD COLUMN "assignedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_driverId_status_idx" ON "Order"("driverId", "status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverLocationPing" ADD CONSTRAINT "DriverLocationPing_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverLocationPing" ADD CONSTRAINT "DriverLocationPing_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
