-- Trazabilidad del descuento de un pedido.
--
-- Hasta ahora el panel sólo podía mostrar "Descuento: −$220.00" sin poder
-- decir de dónde salía, porque el pedido no guardaba nada del origen (sólo
-- "couponId"). Los premios de lealtad y los combos no dejaban rastro alguno.
--
-- "discountReason" guarda el origen ya armado y legible; los dos campos de
-- lealtad guardan qué premio consumió el pedido para poder devolvérselo al
-- cliente si termina cancelado.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discountReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "loyaltyRewardProductId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "loyaltyRewardExpiresAt" TIMESTAMP(3);
