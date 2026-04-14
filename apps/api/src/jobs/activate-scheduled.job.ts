import { FastifyInstance } from "fastify";
import { emitOrderNew, emitOrderStatus } from "../modules/orders/orders.events";
import { enqueueNotification } from "../modules/notifications/queue";

/**
 * Activate scheduled orders 30 minutes before their scheduledFor time.
 * Runs every 5 minutes.
 */
export async function activateScheduledOrders(app: FastifyInstance) {
  const now = new Date();
  const thirtyMinAhead = new Date(now.getTime() + 30 * 60 * 1000);

  const due = await app.prisma.order.findMany({
    where: {
      status: "SCHEDULED",
      scheduledFor: { lte: thirtyMinAhead },
    },
    include: { customer: true, _count: { select: { items: true } } },
  });

  if (due.length === 0) return;

  for (const order of due) {
    await app.prisma.$transaction([
      app.prisma.order.update({
        where: { id: order.id },
        data: { status: "RECEIVED" },
      }),
      app.prisma.orderStatusLog.create({
        data: {
          orderId: order.id,
          from: "SCHEDULED",
          to: "RECEIVED",
          note: "Activado automáticamente (30 min antes de scheduledFor)",
        },
      }),
    ]);

    // Notify admin kanban
    emitOrderNew(app, {
      id: order.id,
      orderNumber: order.orderNumber,
      status: "RECEIVED",
      type: order.type,
      total: order.total,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      itemCount: order._count.items,
      createdAt: order.createdAt.toISOString(),
      paymentMethod: order.paymentMethod,
    });

    emitOrderStatus(app, order.customerId, order.id, "RECEIVED", {
      orderNumber: order.orderNumber,
      estimatedMinutes: 30,
    });

    // Enqueue WA notification: "tu pedido empieza en 30 min"
    enqueueNotification(app.redis, {
      type: "whatsapp",
      to: order.customer.phone,
      template: "order_scheduled_starting" as any,
      params: {
        name: order.customer.name ?? "Cliente",
        orderNumber: String(order.orderNumber),
      },
    }).catch(() => {});
  }

  app.log.info(`Activated ${due.length} scheduled order(s)`);
}
