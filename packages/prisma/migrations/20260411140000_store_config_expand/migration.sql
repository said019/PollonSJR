-- AlterTable: expand StoreConfig
ALTER TABLE "StoreConfig" ADD COLUMN "closedMessage" TEXT;
ALTER TABLE "StoreConfig" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "StoreConfig" ADD COLUMN "updatedBy" TEXT;
