import { FastifyInstance } from "fastify";
import type { OrderStatusType } from "@pollon/types";

const STATUS_MESSAGES: Record<string, string> = {
  RECEIVED: "¡Pedido recibido! El negocio lo está revisando.",
  PREPARING: "Tu pollo está en la freidora",
  READY: "¡Listo para recoger! Puedes pasar por él.",
  ON_THE_WAY: "Tu repartidor ya va en camino",
  DELIVERED: "¡Buen provecho! Esperamos verte pronto",
  CANCELLED: "Tu pedido fue cancelado.",
};

// ── Nuevo pedido llega al kanban del admin
export function emitOrderNew(app: FastifyInstance, orderSummary: any) {
  app.io.to("admin:pollon-sjr").emit("order:new", orderSummary);
}

// ── Status del pedido cambió — notifica admin y cliente
export function emitOrderStatus(
  app: FastifyInstance,
  customerId: string,
  orderId: string,
  status: OrderStatusType | string,
  extra?: { orderNumber?: number; estimatedMinutes?: number }
) {
  const message = STATUS_MESSAGES[status] ?? "Estado actualizado";

  const payload = {
    orderId,
    orderNumber: extra?.orderNumber,
    status: status as OrderStatusType,
    message,
    estimatedMinutes: extra?.estimatedMinutes,
  };

  // Emitir al cliente
  app.io.to(`customer:${customerId}`).emit("order:status", payload);

  // Emitir al admin
  app.io.to("admin:pollon-sjr").emit("order:status", payload);
}

// ── Pago confirmado — notifica al admin
export function emitOrderPaid(app: FastifyInstance, orderId: string, paymentId: string) {
  app.io.to("admin:pollon-sjr").emit("order:paid", { orderId, paymentId });
}

// ── Pago rechazado — notifica al cliente
export function emitOrderRejected(
  app: FastifyInstance,
  customerId: string,
  data: { orderNumber: number; statusDetail: string; message: string }
) {
  app.io.to(`customer:${customerId}`).emit("order:rejected", data);
}

// ── Producto del menú cambió
export function emitMenuUpdated(
  app: FastifyInstance,
  productId: string,
  active: boolean,
  soldOut: boolean
) {
  app.io.emit("menu:updated", { productId, active, soldOut });
}

// ── Estado de la tienda cambió
export function emitStoreStatus(
  app: FastifyInstance,
  config: {
    isOpen: boolean;
    deliveryActive: boolean;
    acceptOrders: boolean;
    message?: string;
  }
) {
  app.io.emit("store:status", config);
}
