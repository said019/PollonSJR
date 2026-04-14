import { FastifyInstance } from "fastify";

/**
 * Conciliación diaria: detecta pagos aprobados en MP que no activaron el pedido.
 * También detecta pedidos RECEIVED sin pago aprobado (anomalía).
 * Cron: diario a las 02:00.
 */
export async function reconcilePayments(app: FastifyInstance) {
  // 1. Pagos aprobados con pedido no activado
  const missedActivations = await app.prisma.payment.findMany({
    where: {
      status: "APPROVED",
      order: {
        status: { in: ["PENDING_PAYMENT", "CANCELLED"] },
      },
      approvedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
    },
    include: { order: true },
  });

  if (missedActivations.length > 0) {
    app.log.warn(
      `Conciliación: ${missedActivations.length} pago(s) aprobado(s) con pedido no activado`
    );

    for (const payment of missedActivations) {
      // Reactivar el pedido
      await app.prisma.$transaction([
        app.prisma.order.update({
          where: { id: payment.orderId },
          data: { status: "RECEIVED" },
        }),
        app.prisma.orderStatusLog.create({
          data: {
            orderId: payment.orderId,
            from: payment.order.status,
            to: "RECEIVED",
            note: `Reactivado por conciliación. Pago MP: ${payment.mpPaymentId}`,
          },
        }),
      ]);

      app.log.info(
        `Pedido #${payment.order.orderNumber} reactivado por conciliación`
      );
    }
  }

  // 2. Pedidos RECEIVED sin pago aprobado (anomalía — solo alerta, no cancelar)
  const orphanOrders = await app.prisma.order.findMany({
    where: {
      status: "RECEIVED",
      createdAt: { lt: new Date(Date.now() - 30 * 60 * 1000) },
      OR: [
        { payment: null },
        { payment: { status: { not: "APPROVED" } } },
      ],
    },
  });

  if (orphanOrders.length > 0) {
    app.log.error(
      `Conciliación: ${orphanOrders.length} pedido(s) RECEIVED sin pago aprobado — revisar manualmente`
    );
  }

  // 3. Limpiar webhook_events mayores a 90 días
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const deleted = await app.prisma.webhookEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  if (deleted.count > 0) {
    app.log.info(`Conciliación: ${deleted.count} webhook_events antiguos eliminados`);
  }
}
