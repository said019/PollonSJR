import { FastifyInstance } from "fastify";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { OrdersService } from "./orders.service";
import { createOrderSchema } from "./orders.schema";
import { authenticate } from "../../middlewares/authenticate";
import { validateCoupon, CouponError } from "./coupon.service";
import { uploadsDir } from "../../plugins/uploads";

const ALLOWED_PROOF_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "application/pdf": ".pdf",
};

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

  // Cliente: subir comprobante de transferencia
  app.post<{ Params: { id: string } }>(
    "/:id/transfer-proof",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as { id: string };
      const orderId = request.params.id;

      const order = await app.prisma.order.findUnique({ where: { id: orderId } });
      if (!order) return reply.status(404).send({ error: "Pedido no encontrado" });
      if (order.customerId !== user.id) {
        return reply.status(403).send({ error: "No autorizado" });
      }
      if (order.paymentMethod !== "TRANSFER") {
        return reply.status(400).send({ error: "Este pedido no es por transferencia" });
      }
      if (order.status !== "PENDING_PAYMENT") {
        return reply.status(400).send({ error: "Este pedido ya no admite comprobante" });
      }

      const file = await request.file().catch(() => null);
      if (!file) return reply.status(400).send({ error: "Archivo requerido" });

      if (!ALLOWED_PROOF_MIME.has(file.mimetype)) {
        return reply
          .status(400)
          .send({ error: "Formato no permitido. Sube JPG, PNG, WEBP, HEIC o PDF." });
      }

      const ext = EXT_BY_MIME[file.mimetype] ?? path.extname(file.filename || "");
      const fileName = `${orderId}-${crypto.randomBytes(6).toString("hex")}${ext}`;
      const destDir = path.join(uploadsDir, "transfer-proofs");
      const destPath = path.join(destDir, fileName);

      try {
        const buffer = await file.toBuffer();
        // toBuffer respects the 8MB limit; if exceeded it throws RequestFileTooLargeError
        await fs.promises.writeFile(destPath, buffer);
      } catch (err: any) {
        if (err?.code === "FST_REQ_FILE_TOO_LARGE") {
          return reply.status(413).send({ error: "El archivo supera 8 MB" });
        }
        request.log.error({ err }, "Error guardando comprobante");
        return reply.status(500).send({ error: "No se pudo guardar el comprobante" });
      }

      // Remove previous proof file if any (avoid stale orphans on Railway volume)
      if (order.transferProofUrl) {
        const prev = path.basename(order.transferProofUrl);
        const prevPath = path.join(destDir, prev);
        if (prev && prevPath.startsWith(destDir)) {
          fs.promises.unlink(prevPath).catch(() => undefined);
        }
      }

      const publicUrl = `/uploads/transfer-proofs/${fileName}`;
      const updated = await app.prisma.order.update({
        where: { id: orderId },
        data: {
          transferProofUrl: publicUrl,
          transferProofUploadedAt: new Date(),
        },
        include: {
          customer: true,
          _count: { select: { items: true } },
        },
      });

      // Notify admin (re-uses order:new toast/sound and refreshes the kanban).
      const { emitOrderNew, emitOrderStatus } = await import("./orders.events");
      emitOrderNew(app, {
        id: updated.id,
        orderNumber: updated.orderNumber,
        status: updated.status,
        type: updated.type,
        total: updated.total,
        customerName: updated.customer.name,
        customerPhone: updated.customer.phone,
        itemCount: updated._count.items,
        createdAt: updated.createdAt.toISOString(),
        paymentMethod: updated.paymentMethod,
      } as any);
      // Also reach the customer's tab — useful if they have it open in another window.
      emitOrderStatus(app, updated.customerId, updated.id, updated.status, {
        orderNumber: updated.orderNumber,
      });

      return { ok: true, transferProofUrl: publicUrl };
    }
  );
}
