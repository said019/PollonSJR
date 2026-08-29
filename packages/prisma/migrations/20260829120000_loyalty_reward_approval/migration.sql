-- El premio de lealtad ahora necesita el visto bueno del negocio.
--
-- Se gana solo (cada 5 pedidos entregados), pero no se descuenta de ningún
-- pedido hasta que alguien lo aprueba desde el panel.
--
-- Los premios que ya estaban pendientes quedan SIN aprobar a propósito: son
-- justo los que se aplicarían solos en el siguiente pedido, que es lo que se
-- quiere evitar. Aparecen en el panel esperando un toque para aprobarse.

ALTER TABLE "LoyaltyCard" ADD COLUMN IF NOT EXISTS "rewardApprovedAt" TIMESTAMP(3);
