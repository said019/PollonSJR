-- Add transfer payment configuration to StoreConfig
ALTER TABLE "StoreConfig"
  ADD COLUMN "transferClabe" TEXT,
  ADD COLUMN "transferBank" TEXT,
  ADD COLUMN "transferAccountHolder" TEXT;
