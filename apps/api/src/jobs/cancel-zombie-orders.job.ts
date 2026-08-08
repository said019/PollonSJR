import { FastifyInstance } from "fastify";
import { APP_COMBO_PROMOTION_KEY } from "../modules/orders/app-exclusive-promotion";

/**
 * Cancela pedidos en PENDING_PAYMENT por más de 90 minutos.
 * El cliente no completó el pago en MercadoPago.
 * Cron: cada 15 minutos.
 */
export async function cancelZombieOrders(app: FastifyInstance) {
  const cutoff = new Date(Date.now() - 90 * 60 * 1000);

  const zombies = await app.prisma.order.findMany({
    where: {
      status: "PENDING_PAYMENT",
      createdAt: { lt: cutoff },
    },
  });

  if (zombies.length === 0) return;

  for (const order of zombies) {
    await app.prisma.$transaction([
      app.prisma.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
      }),
      app.prisma.orderStatusLog.create({
        data: {
          orderId: order.id,
          from: "PENDING_PAYMENT",
          to: "CANCELLED",
          note: "Cancelado automáticamente: pago no completado en 90 min",
        },
      }),
      app.prisma.customerPromotionRedemption.deleteMany({
        where: {
          orderId: order.id,
          promotionKey: APP_COMBO_PROMOTION_KEY,
        },
      }),
    ]);
  }

  app.log.info(`${zombies.length} pedido(s) zombie cancelado(s)`);
}
