import { FastifyInstance } from "fastify";
import { OrdersService } from "./orders.service";
import { createOrderSchema, updateStatusSchema } from "./orders.schema";
import { authenticate } from "../../middlewares/authenticate";
import { validateCoupon, CouponError } from "./coupon.service";

export async function ordersRoutes(app: FastifyInstance) {
  const service = new OrdersService(app);

  // ── Static routes FIRST (before /:id parametric) ──────────

  // Cliente: pedidos activos propios (banner "en curso")
  app.get("/my-active", { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { id: string };
    return service.getMyActiveOrders(user.id);
  });

  // Cliente: validar cupón
  app.post("/coupons/validate", { preHandler: [authenticate] }, async (request, reply) => {
    const { code, subtotal } = request.body as { code: string; subtotal: number };
    const user = request.user as { id: string };

    try {
      const result = await validateCoupon(app, code, user.id, subtotal);
      return { valid: true, couponId: result.id, discountAmount: result.discountAmount, message: result.message };
    } catch (err) {
      if (err instanceof CouponError) {
        return reply.status(400).send({ valid: false, error: err.message });
      }
      throw err;
    }
  });

  // ── Root route ────────────────────────────────────────────

  // Cliente: crear pedido
  app.post("/", { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = createOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }

    const user = request.user as { id: string };
    try {
      const result = await service.create(user.id, parsed.data);
      return reply.status(201).send(result);
    } catch (err: any) {
      const msg = err.message || "Error al crear el pedido";
      const isStoreReason =
        msg.includes("cerrado") ||
        msg.includes("disponible") ||
        msg.includes("aceptando") ||
        msg.includes("Abrimos") ||
        msg.includes("Cerramos") ||
        msg.includes("servicio");
      return reply.status(isStoreReason ? 409 : 400).send({ error: msg });
    }
  });

  // ── Parametric routes ─────────────────────────────────────

  // Cliente: ver status de un pedido
  app.get<{ Params: { id: string } }>("/:id", { preHandler: [authenticate] }, async (request, reply) => {
    const order = await service.getById(request.params.id);
    if (!order) return reply.status(404).send({ error: "Pedido no encontrado" });
    return order;
  });

  // Cliente: items de un pedido
  app.get<{ Params: { id: string } }>("/:id/items", { preHandler: [authenticate] }, async (request, reply) => {
    const order = await service.getById(request.params.id);
    if (!order) return reply.status(404).send({ error: "Pedido no encontrado" });
    return order.items;
  });

  // Cliente: repetir pedido
  app.get<{ Params: { id: string } }>("/:id/repeat", { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { id: string };
    try {
      return await service.getRepeatItems(request.params.id, user.id);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  // Cliente: calificar pedido
  app.post<{ Params: { id: string } }>("/:id/rate", { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { id: string };
    const { rating, comment } = request.body as { rating: number; comment?: string };

    if (!rating || rating < 1 || rating > 5) {
      return reply.status(400).send({ error: "Calificación debe ser entre 1 y 5" });
    }

    const order = await app.prisma.order.findUnique({ where: { id: request.params.id } });
    if (!order) return reply.status(404).send({ error: "Pedido no encontrado" });
    if (order.customerId !== user.id) return reply.status(403).send({ error: "No autorizado" });
    if (order.status !== "DELIVERED") return reply.status(400).send({ error: "Solo puedes calificar pedidos entregados" });

    await app.prisma.order.update({
      where: { id: request.params.id },
      data: { rating, ratingComment: comment || null, ratedAt: new Date() },
    });

    return { success: true, rating };
  });
}
