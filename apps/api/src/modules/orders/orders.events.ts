import { FastifyInstance } from "fastify";
import type { OrderStatusType } from "@pollon/types";
import { pushToCustomer } from "../notifications/web-push.service";

const STATUS_MESSAGES: Record<string, string> = {
  RECEIVED: "¡Pedido recibido! El negocio lo está revisando.",
  PREPARING: "Tu pollo está en la freidora",
  READY: "¡Listo para recoger! Puedes pasar por él.",
  ON_THE_WAY: "Tu repartidor ya va en camino",
  DELIVERED: "¡Buen provecho! Esperamos verte pronto",
  CANCELLED: "Tu pedido fue cancelado.",
};

const PUSH_TITLES: Record<string, string> = {
  RECEIVED: "Pedido recibido 🍗",
  PREPARING: "Cocinando tu pedido 🔥",
  READY: "¡Listo! 🎉",
  ON_THE_WAY: "Tu pedido va en camino 🛵",
  DELIVERED: "Pedido entregado ✓",
  CANCELLED: "Pedido cancelado",
};

const PAYMENT_LABEL: Record<string, string> = {
  CARD: "Tarjeta",
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
};
const TYPE_LABEL: Record<string, string> = {
  DELIVERY: "A domicilio",
  PICKUP: "Recoger en tienda",
};

// ── Nuevo pedido: socket al panel + WhatsApp a los dueños (para que se
//    enteren aunque la app esté cerrada).
export function emitOrderNew(app: FastifyInstance, orderSummary: any) {
  app.io.to("admin:pollon-sjr").emit("order:new", orderSummary);

  // OWNER_PHONES = "5576108444,5538914735" (10 dígitos MX, sin +52, separados por coma)
  const raw = process.env.OWNER_PHONES || "";
  const phones = raw
    .split(",")
    .map((s) => s.replace(/\D/g, "").slice(-10))
    .filter((s) => s.length === 10);
  if (phones.length === 0) return;

  const webUrl = process.env.WEB_URL || "https://pollon-web-production.up.railway.app";
  const adminUrl = `${webUrl.replace(/\/$/, "")}/admin/orders`;

  // Mostrar nota para TRANSFER pendiente (avisa al dueño que hay que verificar comprobante)
  const note =
    orderSummary?.paymentMethod === "TRANSFER" && orderSummary?.status === "PENDING_PAYMENT"
      ? "Falta verificar comprobante"
      : "";

  const params = {
    orderNumber: String(orderSummary?.orderNumber ?? "?"),
    type: TYPE_LABEL[orderSummary?.type] ?? orderSummary?.type ?? "—",
    payment: PAYMENT_LABEL[orderSummary?.paymentMethod] ?? orderSummary?.paymentMethod ?? "—",
    total: ((orderSummary?.total ?? 0) / 100).toFixed(2),
    customerName: orderSummary?.customerName || "Cliente",
    customerPhone: orderSummary?.customerPhone || "",
    note,
    adminUrl,
  };

  // Encolar (no bloquear creación si falla)
  void import("../notifications/queue")
    .then(({ enqueueNotification }) =>
      Promise.all(
        phones.map((phone) =>
          enqueueNotification(app.redis, {
            type: "whatsapp",
            to: phone,
            template: "owner_new_order",
            params,
          })
        )
      )
    )
    .catch((err) => app.log.error({ err }, "Owner new-order WA enqueue failed"));
}

// ── Status del pedido cambió — notifica admin y cliente
export function emitOrderStatus(
  app: FastifyInstance,
  customerId: string,
  orderId: string,
  status: OrderStatusType | string,
  extra?: { orderNumber?: number; estimatedMinutes?: number; cancelReason?: string }
) {
  const message =
    status === "CANCELLED" && extra?.cancelReason
      ? extra.cancelReason
      : STATUS_MESSAGES[status] ?? "Estado actualizado";

  const payload = {
    orderId,
    orderNumber: extra?.orderNumber,
    status: status as OrderStatusType,
    message,
    cancelReason: extra?.cancelReason,
    estimatedMinutes: extra?.estimatedMinutes,
  };

  // Emitir al cliente
  app.io.to(`customer:${customerId}`).emit("order:status", payload);

  // Emitir al admin
  app.io.to("admin:pollon-sjr").emit("order:status", payload);

  // Push notification — fire-and-forget, doesn't block status update
  const pushTitle = PUSH_TITLES[status as string];
  if (pushTitle) {
    void pushToCustomer(app, customerId, {
      title: pushTitle,
      body: message,
      url: `/order/${orderId}`,
      tag: `order-${orderId}`,
      data: { orderId, status, orderNumber: extra?.orderNumber },
    }).catch((err) => app.log.warn({ err }, "Push send failed"));
  }
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
