-- Add transfer payment proof fields to Order
ALTER TABLE "Order"
  ADD COLUMN "transferProofUrl" TEXT,
  ADD COLUMN "transferProofUploadedAt" TIMESTAMP(3);
