import { FastifyInstance } from "fastify";

/**
 * Conciliación diaria: detecta pagos aprobados en MP que no activaron el pedido.
 * También detecta pedidos RECEIVED sin pago aprobado (anomalía).
 * Cron: diario a las 02:00.
 */
export async function reconcilePayments(app: FastifyInstance) {
  // 1. Rescatar pedidos PAGADOS pero NUNCA activados (webhook perdido,
  //    bug viejo de validación de monto, etc.). SOLO PENDING_PAYMENT.
  //
  //    Antes incluía CANCELLED y se creaba un LOOP: si el negocio cancelaba
  //    a propósito un pedido CARD (duplicado, fuera de zona, etc.) y el
  //    pago seguía APPROVED en MP, el cron lo reactivaba al día siguiente.
  //    Caso real: #217 reactivado 4 días seguidos hasta detectarlo.
  //    Los pedidos cancelados intencionalmente con pago APPROVED son tema
  //    de REEMBOLSO, no de reactivación — se reportan abajo (orphan-like)
  //    para que el admin reembolse manual.
  const missedActivations = await app.prisma.payment.findMany({
    where: {
      status: "APPROVED",
      order: {
        status: "PENDING_PAYMENT",
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

  // 1b. Pedidos CANCELLED con pago APPROVED — ALERTA para reembolso manual,
  //     pero NO reactivar (el negocio canceló a propósito).
  const cancelledWithPaidPayment = await app.prisma.payment.findMany({
    where: {
      status: "APPROVED",
      order: { status: "CANCELLED" },
      refundedAmount: 0,
    },
    include: { order: { select: { orderNumber: true, total: true } } },
  });
  if (cancelledWithPaidPayment.length > 0) {
    app.log.warn(
      `Conciliación: ${cancelledWithPaidPayment.length} pedido(s) CANCELLED con pago APPROVED sin reembolsar — requieren reembolso manual: ${cancelledWithPaidPayment
        .map((p) => `#${p.order.orderNumber} ($${p.order.total / 100})`)
        .join(", ")}`
    );
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
