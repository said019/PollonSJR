import { FastifyInstance } from "fastify";
import { z } from "zod";
import { AdminService } from "./admin.service";
import { OrdersService } from "../orders/orders.service";
import { MenuService } from "../menu/menu.service";
import { adminOnly } from "../../middlewares/admin-only";
import { createProductSchema, updateProductSchema } from "../menu/menu.schema";
import { updateStatusSchema } from "../orders/orders.schema";
import { emitMenuUpdated, emitOrderStatus } from "../orders/orders.events";
import { getStoreConfig, updateStoreConfig } from "./store-config.service";
import { LoyaltyService } from "../loyalty/loyalty.service";
import { AppleWalletService } from "../loyalty/apple-wallet.service";
import { GoogleWalletService } from "../loyalty/google-wallet.service";

const storeConfigSchema = z.object({
  isOpen: z.boolean().optional(),
  deliveryActive: z.boolean().optional(),
  acceptOrders: z.boolean().optional(),
  closedMessage: z.string().nullable().optional(),
  // Bank transfer details — CLABE in Mexico is exactly 18 digits.
  transferClabe: z
    .string()
    .trim()
    .regex(/^\d{18}$/, "La CLABE debe tener 18 dígitos")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  transferBank: z.string().trim().max(60).nullable().optional(),
  transferAccountHolder: z.string().trim().max(120).nullable().optional(),
});

const hoursSchema = z.object({
  openTime: z.string().regex(/^\d{2}:\d{2}$/),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/),
  openDays: z.array(z.number().int().min(0).max(6)),
});

export async function adminRoutes(app: FastifyInstance) {
  const adminService = new AdminService(app);
  const ordersService = new OrdersService(app);
  const menuService = new MenuService(app);

  // All admin routes require admin auth
  app.addHook("preHandler", adminOnly);

  // Dashboard is handled by reports.routes.ts

  // Store config (cached)
  app.get("/store", async () => getStoreConfig(app));

  app.patch("/store", async (request, reply) => {
    const parsed = storeConfigSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Datos inválidos" });
    return adminService.updateStoreConfig(parsed.data);
  });

  app.put("/store/hours", async (request, reply) => {
    const parsed = hoursSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Datos inválidos" });
    return adminService.updateHours(parsed.data);
  });

  // Quick pause: toggle acceptOrders in 1 click
  app.patch("/store/pause", async () => {
    const config = await getStoreConfig(app);
    return updateStoreConfig(app, { acceptOrders: !config.acceptOrders });
  });

  // Orders
  app.get("/orders", async () => ordersService.getActiveOrders());

  app.get("/orders/history", async (request) => {
    const { page, dateFrom, dateTo } = request.query as {
      page?: string;
      dateFrom?: string; // ISO date string YYYY-MM-DD
      dateTo?: string;   // ISO date string YYYY-MM-DD
    };

    const from = dateFrom ? new Date(dateFrom + "T00:00:00.000Z") : undefined;
    // End of day so the full day is included
    const to = dateTo ? new Date(dateTo + "T23:59:59.999Z") : undefined;

    return ordersService.getHistory(Number(page) || 1, 20, from, to);
  });

  app.patch<{ Params: { id: string } }>("/orders/:id/status", async (request, reply) => {
    const parsed = updateStatusSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Status inválido" });

    try {
      return await ordersService.updateStatus(request.params.id, parsed.data.status, parsed.data.cancelReason);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Products
  app.get("/products", async () => {
    return app.prisma.product.findMany({
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      include: { modifiers: true },
    });
  });

  app.post("/products", async (request, reply) => {
    const parsed = createProductSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });

    const product = await app.prisma.product.create({ data: parsed.data });
    await menuService.invalidateCache();
    emitMenuUpdated(app, product.id, true, false);
    return reply.status(201).send(product);
  });

  app.patch<{ Params: { id: string } }>("/products/:id", async (request, reply) => {
    const parsed = updateProductSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Datos inválidos" });

    const product = await app.prisma.product.update({
      where: { id: request.params.id },
      data: parsed.data,
    });

    await menuService.invalidateCache();
    emitMenuUpdated(app, product.id, product.active, product.soldOut);

    return product;
  });

  // Customers
  app.get("/customers", async (request) => {
    const { page, search } = request.query as { page?: string; search?: string };
    return adminService.getCustomers(Number(page) || 1, 20, search);
  });

  // Reports are handled by reports.routes.ts

  // ─── Coupons ──────────────────────────────────────────────

  app.get("/coupons", async () => {
    return app.prisma.coupon.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { orders: true } } },
    });
  });

  const createCouponSchema = z.object({
    code: z.string().min(1).max(30),
    type: z.enum(["PERCENT", "FIXED"]),
    value: z.number().min(1),
    minOrderAmount: z.number().min(0).optional(),
    maxUses: z.number().int().min(1).optional(),
    firstOrderOnly: z.boolean().optional(),
    expiresAt: z.string().optional(),
  });

  app.post("/coupons", async (request, reply) => {
    const parsed = createCouponSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    const { code, type, value, minOrderAmount, maxUses, firstOrderOnly, expiresAt } = parsed.data;

    const coupon = await app.prisma.coupon.create({
      data: {
        code: code.toUpperCase().trim(),
        type,
        value,
        minOrderAmount: minOrderAmount ?? null,
        maxUses: maxUses ?? null,
        firstOrderOnly: firstOrderOnly ?? false,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    return reply.status(201).send(coupon);
  });

  app.patch<{ Params: { id: string } }>("/coupons/:id", async (request) => {
    const { active } = request.body as { active: boolean };
    return app.prisma.coupon.update({
      where: { id: request.params.id },
      data: { active },
    });
  });

  // ─── ETA Update ───────────────────────────────────────────

  app.patch<{ Params: { id: string } }>("/orders/:id/eta", async (request, reply) => {
    const { estimatedMinutes } = request.body as { estimatedMinutes: number };
    if (!estimatedMinutes || estimatedMinutes < 5 || estimatedMinutes > 120) {
      return reply.status(400).send({ error: "ETA debe ser entre 5 y 120 minutos" });
    }

    const order = await app.prisma.order.findUnique({ where: { id: request.params.id } });
    if (!order) return reply.status(404).send({ error: "Pedido no encontrado" });

    const updated = await app.prisma.order.update({
      where: { id: order.id },
      data: { estimatedMinutes },
    });

    // Notify customer with the UPDATED order data
    app.io.to(`customer:${updated.customerId}`).emit("order:status", {
      orderId: updated.id,
      orderNumber: updated.orderNumber,
      status: updated.status as any,
      message: `Tiempo estimado actualizado: ~${estimatedMinutes} min`,
      estimatedMinutes,
    });

    return { ok: true };
  });

  // ─── Confirm payment (CASH/TRANSFER) ──────────────────────

  app.patch<{ Params: { id: string } }>("/orders/:id/confirm-payment", async (request, reply) => {
    const order = await app.prisma.order.findUnique({
      where: { id: request.params.id },
      include: { customer: true },
    });
    if (!order) return reply.status(404).send({ error: "Pedido no encontrado" });

    // Mark scheduled order's deposit as paid
    if (order.isScheduled) {
      await app.prisma.order.update({
        where: { id: order.id },
        data: { depositPaidAt: new Date() },
      });
      return { ok: true, message: "Anticipo confirmado" };
    }

    // For PENDING_PAYMENT orders (CASH/TRANSFER), move to RECEIVED
    if (order.status === "PENDING_PAYMENT") {
      await app.prisma.$transaction([
        app.prisma.order.update({
          where: { id: order.id },
          data: { status: "RECEIVED" },
        }),
        app.prisma.orderStatusLog.create({
          data: {
            orderId: order.id,
            from: "PENDING_PAYMENT",
            to: "RECEIVED",
            note: `Pago ${order.paymentMethod} confirmado por admin`,
          },
        }),
      ]);
      emitOrderStatus(app, order.customerId, order.id, "RECEIVED", {
        orderNumber: order.orderNumber,
      });
    }

    return { ok: true, message: "Pago confirmado" };
  });

  // ─── Loyalty admin endpoints ──────────────────────────────

  app.get("/loyalty/customers", async (request) => {
    const { page } = request.query as { page?: string };
    const limit = 20;
    const skip = ((Number(page) || 1) - 1) * limit;
    const cards = await app.prisma.loyaltyCard.findMany({
      include: {
        customer: { select: { id: true, phone: true, name: true } },
        pendingProduct: { select: { id: true, name: true, emoji: true } },
      },
      orderBy: { completedOrders: "desc" },
      skip,
      take: limit,
    });
    const total = await app.prisma.loyaltyCard.count();
    return { cards, total, page: Number(page) || 1 };
  });

  app.patch<{ Params: { id: string } }>("/loyalty/customers/:id/adjust", async (request, reply) => {
    const { delta, reason } = request.body as { delta: number; reason: string };
    if (!reason?.trim()) {
      return reply.status(400).send({ error: "reason requerido" });
    }

    const loyaltyService = new LoyaltyService(app);
    try {
      return await loyaltyService.adminAdjust(request.params.id, delta, reason);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Admin: canjear recompensa de lealtad manualmente
  app.post<{ Params: { id: string } }>("/loyalty/customers/:id/redeem", async (request, reply) => {
    const customerId = request.params.id;
    const card = await app.prisma.loyaltyCard.findUnique({
      where: { customerId },
      include: { pendingProduct: true },
    });

    if (!card) return reply.status(404).send({ error: "Cliente sin tarjeta de lealtad" });
    if (!card.pendingReward) return reply.status(400).send({ error: "Este cliente no tiene recompensa pendiente" });

    // Check if the reward has expired
    if (card.rewardExpiresAt && new Date() > card.rewardExpiresAt) {
      await app.prisma.loyaltyCard.update({
        where: { id: card.id },
        data: { pendingReward: false, pendingProductId: null, rewardEarnedAt: null, rewardExpiresAt: null },
      });
      return reply.status(400).send({ error: "La recompensa expiró. Se ha limpiado del registro." });
    }

    const productName = card.pendingProduct?.name ?? "Producto";

    await app.prisma.$transaction([
      app.prisma.loyaltyCard.update({
        where: { id: card.id },
        data: {
          pendingReward: false,
          pendingProductId: null,
          rewardEarnedAt: null,
          rewardExpiresAt: null,
          freeProductsUsed: card.freeProductsUsed + 1,
        },
      }),
      app.prisma.loyaltyEvent.create({
        data: {
          cardId: card.id,
          orderDelta: 0,
          reason: `admin:canje manual — ${productName}`,
        },
      }),
    ]);

    // Notify customer via socket
    const customer = await app.prisma.customer.findUnique({ where: { id: customerId } });
    if (customer) {
      app.io.to(`customer:${customerId}`).emit("loyalty:redeemed", {
        message: `Tu ${productName} gratis fue canjeado. ¡Disfrútalo!`,
        productName,
      });
    }

    // Update wallet passes to show redeemed state
    const appleWallet = new AppleWalletService(app);
    const googleWallet = new GoogleWalletService(app);
    void Promise.allSettled([
      appleWallet.updatePassAndNotify(customerId, `¡${productName} canjeado!`),
      (async () => {
        await googleWallet.updateLoyaltyObject(
          customerId,
          customer?.name ?? "",
          0
        );
        await googleWallet.sendMessage(
          customerId,
          "Pollón SJR",
          `¡${productName} canjeado!`
        );
      })(),
    ])
      .then((results) => {
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            app.log.error(
              {
                err: result.reason,
                customerId,
                wallet: index === 0 ? "apple" : "google",
              },
              "Wallet pass redeem update failed"
            );
          }
        });
      })
      .catch((err) => {
        app.log.error({ err, customerId }, "Wallet pass redeem handler failed");
      });

    return { success: true, message: `Recompensa canjeada: ${productName}` };
  });

  // Admin: detalle de lealtad de un cliente
  app.get<{ Params: { id: string } }>("/loyalty/customers/:id", async (request, reply) => {
    const customerId = request.params.id;
    const loyaltyService = new LoyaltyService(app);
    try {
      const info = await loyaltyService.getInfo(customerId);
      const history = await loyaltyService.getHistory(customerId);
      return { info, history };
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  // ─── Wallet admin endpoints ─────────────────────────────────

  // Admin: create/update Google Wallet loyalty class (run once)
  app.post("/wallet/google/create-class", async (request, reply) => {
    const google = new GoogleWalletService(app);
    try {
      await google.ensureLoyaltyClass();
      return { success: true, message: "Loyalty class created/updated" };
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Admin: force update a customer's wallet passes
  app.post<{ Params: { id: string } }>(
    "/wallet/force-update/:id",
    async (request, reply) => {
      const customerId = request.params.id;
      const body = request.body as { message?: string } | undefined;
      const customer = await app.prisma.customer.findUnique({
        where: { id: customerId },
        include: { loyalty: true },
      });
      if (!customer)
        return reply.status(404).send({ error: "Cliente no encontrado" });

      const stamps = customer.loyalty
        ? customer.loyalty.pendingReward
          ? 5
          : customer.loyalty.completedOrders % 5
        : 0;

      const apple = new AppleWalletService(app);
      const google = new GoogleWalletService(app);
      const message = body?.message?.trim() || "Pase actualizado";

      const results = await Promise.allSettled([
        apple.updatePassAndNotify(customerId, message),
        (async () => {
          await google.updateLoyaltyObject(
            customerId,
            customer.name ?? "",
            stamps
          );
          await google.sendMessage(customerId, "Pollón SJR", message);
        })(),
      ]);

      const failures: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          const wallet = index === 0 ? "apple" : "google";
          failures.push(wallet);
          app.log.error(
            {
              err: result.reason,
              customerId,
              wallet,
            },
            "Wallet force update failed"
          );
        }
      });

      if (failures.length === results.length) {
        return reply.status(502).send({
          success: false,
          error: `Wallet update failed for: ${failures.join(", ")}`,
        });
      }

      return { success: true, ...(failures.length > 0 && { warnings: failures }) };
    }
  );

  // Admin: send push notification to all wallet holders
  app.post("/wallet/push-all", async (request, reply) => {
    const { title, message } = request.body as {
      title: string;
      message: string;
    };
    if (!title || !message)
      return reply.status(400).send({ error: "title and message required" });

    const cards = await app.prisma.loyaltyCard.findMany({
      include: { customer: true },
    });

    const apple = new AppleWalletService(app);
    const google = new GoogleWalletService(app);
    let sent = 0;

    for (const card of cards) {
      try {
        // Apple Wallet: update the pass so Wallet shows the changeMessage.
        await apple.updatePassAndNotify(card.customerId, message);
        // Google: add message to loyalty object
        await google.sendMessage(card.customerId, title, message);
        sent++;
      } catch {
        /* continue */
      }
      // Rate limiting
      await new Promise((r) => setTimeout(r, 150));
    }

    return { success: true, sent, total: cards.length };
  });
}
