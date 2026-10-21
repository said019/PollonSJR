ALTER TABLE "Order" ADD COLUMN "whatsappCheckoutId" TEXT;
CREATE UNIQUE INDEX "Order_whatsappCheckoutId_key" ON "Order"("whatsappCheckoutId");
