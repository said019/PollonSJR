import { FastifyInstance } from "fastify";
import { OrdersService } from "./orders.service";
import { createOrderSchema, updateStatusSchema } from "./orders.schema";
import { authenticate } from "../../middlewares/authenticate";
import { validateCoupon, CouponError } from "./coupon.service";

export async function ordersRoutes(app: FastifyInstance) {
  const service = new OrdersService(app);

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
      const status = err.message?.includes("cerrado") || err.message?.includes("disponible") ? 409 : 400;
      return reply.status(status).send({ error: err.message });
    }
  });

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
}
