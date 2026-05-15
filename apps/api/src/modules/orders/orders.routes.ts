import { FastifyInstance } from "fastify";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { OrdersService } from "./orders.service";
import { createOrderSchema } from "./orders.schema";
import { authenticate } from "../../middlewares/authenticate";
import { validateCoupon, CouponError } from "./coupon.service";
import { uploadsDir } from "../../plugins/uploads";

// Validación del comprobante por el CONTENIDO real (magic bytes), no por el
// `Content-Type` que declara el navegador. Esto hace la subida a la vez:
//  - más ROBUSTA: acepta el archivo aunque el celular mande un mimetype raro
//    (iOS suele mandar application/octet-stream para HEIC/algunas fotos), y
//  - más SEGURA: rechaza un ejecutable/script renombrado a .jpg.
// Cero dependencias nuevas (importante: estamos en producción).
type ProofKind = "jpg" | "png" | "webp" | "heic" | "pdf";

const EXT_BY_KIND: Record<ProofKind, string> = {
  jpg: ".jpg",
  png: ".png",
  webp: ".webp",
  heic: ".heic",
  pdf: ".pdf",
};

function sniffProofKind(buf: Buffer): ProofKind | null {
  if (buf.length < 12) return null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  )
    return "png";

  // PDF: "%PDF-" (algunos PDFs traen BOM/espacios antes del header)
  if (buf.subarray(0, 1024).toString("latin1").includes("%PDF-")) return "pdf";

  // WEBP: "RIFF" .... "WEBP"
  if (
    buf.toString("latin1", 0, 4) === "RIFF" &&
    buf.toString("latin1", 8, 12) === "WEBP"
  )
    return "webp";

  // HEIC/HEIF (foto de iPhone): caja `ftyp` con marca heic/heix/mif1/heif/…
  if (buf.toString("latin1", 4, 8) === "ftyp") {
    const brand = buf.toString("latin1", 8, 12);
    const heifBrands = [
      "heic",
      "heix",
      "hevc",
      "hevx",
      "heim",
      "heis",
      "hevm",
      "hevs",
      "mif1",
      "msf1",
      "heif",
    ];
    if (heifBrands.includes(brand)) return "heic";
  }

  return null;
}

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

  // Cliente: ver status de un pedido.
  // IDOR fix: getById es compartido con rutas admin. Aquí (contexto cliente)
  // verificamos que el pedido le pertenezca al usuario autenticado, si no
  // cualquier cliente podía leer dirección/teléfono/GPS de pedidos ajenos
  // con sólo cambiar el orderId.
  app.get<{ Params: { id: string } }>("/:id", { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { id: string; role?: string };
    const order = await service.getById(request.params.id);
    if (!order) return reply.status(404).send({ error: "Pedido no encontrado" });
    const ownerId = await service.getOrderCustomerId(request.params.id);
    if (user.role !== "admin" && ownerId !== user.id) {
      return reply.status(404).send({ error: "Pedido no encontrado" });
    }
    return order;
  });

  // Cliente: items de un pedido
  app.get<{ Params: { id: string } }>("/:id/items", { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { id: string; role?: string };
    const order = await service.getById(request.params.id);
    if (!order) return reply.status(404).send({ error: "Pedido no encontrado" });
    const ownerId = await service.getOrderCustomerId(request.params.id);
    if (user.role !== "admin" && ownerId !== user.id) {
      return reply.status(404).send({ error: "Pedido no encontrado" });
    }
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

  // Cliente: cancelar pedido propio (solo antes de cocinar)
  app.post<{ Params: { id: string } }>(
    "/:id/cancel",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as { id: string };
      const orderId = request.params.id;
      const { reason } = (request.body as { reason?: string } | undefined) ?? {};

      const order = await app.prisma.order.findUnique({
        where: { id: orderId },
        include: { customer: true },
      });
      if (!order) return reply.status(404).send({ error: "Pedido no encontrado" });
      if (order.customerId !== user.id) {
        return reply.status(403).send({ error: "No autorizado" });
      }
      // Cancellation window: only before the kitchen takes the order.
      // SCHEDULED orders involve a 50% deposit, customer must contact the store.
      if (!["PENDING_PAYMENT", "RECEIVED"].includes(order.status)) {
        return reply.status(409).send({
          error:
            order.status === "SCHEDULED"
              ? "Pedidos programados se cancelan contactando al negocio."
              : "Tu pedido ya está en preparación y no se puede cancelar desde aquí.",
        });
      }

      const trimmedReason = reason?.trim().slice(0, 200) || null;

      // Optimistic update — guard against status-race with the admin.
      const updated = await app.prisma.order.updateMany({
        where: { id: orderId, status: order.status },
        data: {
          status: "CANCELLED",
          cancelReason: trimmedReason ?? "Cancelado por el cliente",
        },
      });
      if (updated.count === 0) {
        return reply.status(409).send({
          error: "El pedido ya cambió de estado. Recarga la página.",
        });
      }

      await app.prisma.orderStatusLog.create({
        data: {
          orderId,
          from: order.status,
          to: "CANCELLED",
          note: trimmedReason ?? "Cancelado por el cliente",
        },
      });

      // Free up the coupon use that was reserved at creation
      if (order.couponId) {
        await app.prisma.coupon
          .update({
            where: { id: order.couponId },
            data: { usedCount: { decrement: 1 } },
          })
          .catch(() => undefined);
      }

      const { emitOrderStatus } = await import("./orders.events");
      emitOrderStatus(app, order.customerId, orderId, "CANCELLED", {
        orderNumber: order.orderNumber,
        cancelReason: trimmedReason ?? "Cancelado por el cliente",
      });

      return { ok: true };
    }
  );

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

      let buffer: Buffer;
      try {
        // toBuffer respeta el límite de 8MB; si lo excede lanza FST_REQ_FILE_TOO_LARGE
        buffer = await file.toBuffer();
      } catch (err: any) {
        if (err?.code === "FST_REQ_FILE_TOO_LARGE") {
          return reply.status(413).send({ error: "El archivo supera 8 MB" });
        }
        request.log.error({ err }, "Error leyendo comprobante");
        return reply.status(500).send({ error: "No se pudo procesar el archivo" });
      }
      if (buffer.length === 0) {
        return reply.status(400).send({ error: "El archivo está vacío" });
      }

      // Aceptar/rechazar por el contenido real del archivo.
      const kind = sniffProofKind(buffer);
      if (!kind) {
        return reply.status(400).send({
          error:
            "Formato no válido. Sube una foto (JPG, PNG, WEBP, HEIC) o un PDF del comprobante.",
        });
      }

      const ext = EXT_BY_KIND[kind];
      const fileName = `${orderId}-${crypto.randomBytes(6).toString("hex")}${ext}`;
      const destDir = path.join(uploadsDir, "transfer-proofs");
      const destPath = path.join(destDir, fileName);

      try {
        await fs.promises.writeFile(destPath, buffer);
      } catch (err: any) {
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
