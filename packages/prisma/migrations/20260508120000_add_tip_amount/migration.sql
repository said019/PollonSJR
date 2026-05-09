-- Add tip amount to orders
ALTER TABLE "Order" ADD COLUMN "tipAmount" INTEGER NOT NULL DEFAULT 0;
