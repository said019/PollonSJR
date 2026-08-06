import { FastifyInstance } from "fastify";
import crypto from "crypto";
import type { Order, Prisma, PrismaClient } from "@prisma/client";
import { OrdersService } from "./orders.service";
import { createOrderSchema } from "./orders.schema";
import { authenticate } from "../../middlewares/authenticate";
import { validateCoupon, CouponError } from "./coupon.service";
import {
  buildTransferProofDeliveryUrl,
  loadTransferProof,
  storeTransferProof,
  TransferProofNotFoundError,
  TransferProofStorageUnavailableError,
  verifyTransferProofDeliverySignature,
} from "./transfer-proof.storage";

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

const transferProofOrderInclude = {
  customer: true,
  _count: { select: { items: true } },
} satisfies Prisma.OrderInclude;

type TransferProofAssociatedOrder = Prisma.OrderGetPayload<{
  include: typeof transferProofOrderInclude;
}>;

type TransferProofOrderSnapshot = Pick<
  Order,
  | "id"
  | "customerId"
  | "paymentMethod"
  | "status"
  | "transferProofUrl"
  | "updatedAt"
>;

type TransferProofAssociationResult =
  | {
      kind: "associated";
      order: TransferProofAssociatedOrder | null;
      warning?: unknown;
    }
  | { kind: "conflict" }
  | { kind: "unknown"; error: unknown };

// El upload remoto sucede antes de tocar DB. Esta escritura optimista impide
// que una subida lenta gane contra cancelación, confirmación u otro reemplazo.
// Ante un commit ambiguo nunca borra el objeto: primero intenta reconciliarlo.
export async function associateTransferProofReference(
  orderDelegate: Pick<PrismaClient["order"], "updateMany" | "findUnique">,
  snapshot: TransferProofOrderSnapshot,
  storedReference: string,
  uploadedAt = new Date()
): Promise<TransferProofAssociationResult> {
  try {
    const result = await orderDelegate.updateMany({
      where: {
        id: snapshot.id,
        customerId: snapshot.customerId,
        paymentMethod: "TRANSFER",
        status: "PENDING_PAYMENT",
        transferProofUrl: snapshot.transferProofUrl,
        updatedAt: snapshot.updatedAt,
      },
      data: {
        transferProofUrl: storedReference,
        transferProofUploadedAt: uploadedAt,
      },
    });
    if (result.count !== 1) return { kind: "conflict" };

    try {
      const order = await orderDelegate.findUnique({
        where: { id: snapshot.id },
        include: transferProofOrderInclude,
      });
      return { kind: "associated", order };
    } catch (warning) {
      // updateMany ya confirmó exactamente una fila. La notificación puede
      // recuperarse mediante polling aunque este read secundario falle.
      return { kind: "associated", order: null, warning };
    }
  } catch (updateError) {
    try {
      const order = await orderDelegate.findUnique({
        where: { id: snapshot.id },
        include: transferProofOrderInclude,
      });
      if (order?.transferProofUrl === storedReference) {
        return { kind: "associated", order, warning: updateError };
      }
      return { kind: "unknown", error: updateError };
    } catch (probeError) {
      return {
        kind: "unknown",
        error: { updateError, probeError },
      };
    }
  }
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

  // Acceso privado compatible con <img>/<a>: la API entrega una URL HMAC
  // corta y este endpoint valida la firma contra la referencia vigente en DB.
  // El ID de Drive nunca se expone al navegador y el archivo sigue privado.
  app.get<{
    Params: { id: string; filename: string };
    Querystring: { expires?: string; signature?: string };
  }>("/:id/transfer-proof/:filename", async (request, reply) => {
    const order = await app.prisma.order.findUnique({
      where: { id: request.params.id },
      select: { transferProofUrl: true },
    });
    const reference = order?.transferProofUrl;
    if (!reference) {
      return reply.status(404).send({ error: "Comprobante no encontrado" });
    }

    const signatureIsValid = verifyTransferProofDeliverySignature({
      orderId: request.params.id,
      reference,
      expires: request.query.expires,
      signature: request.query.signature,
    });
    if (!signatureIsValid) {
      return reply.status(403).send({ error: "Enlace inválido o expirado" });
    }

    try {
      const proof = await loadTransferProof(reference);
      return reply
        .header("Cache-Control", "private, no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header(
          "Content-Disposition",
          `inline; filename="comprobante${proof.extension}"`
        )
        .type(proof.mimeType)
        .send(proof.buffer);
    } catch (error) {
      if (error instanceof TransferProofNotFoundError) {
        return reply.status(404).send({ error: "Comprobante no encontrado" });
      }
      request.log.error({ err: error }, "Error leyendo comprobante");
      const status =
        error instanceof TransferProofStorageUnavailableError ? 503 : 500;
      return reply.status(status).send({
        error:
          status === 503
            ? "El comprobante no está disponible temporalmente"
            : "No se pudo leer el comprobante",
      });
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
      let storedReference: string;
      try {
        storedReference = await storeTransferProof({ buffer, fileName, kind });
      } catch (err) {
        request.log.error({ err }, "Error guardando comprobante");
        const status =
          err instanceof TransferProofStorageUnavailableError ? 503 : 500;
        return reply.status(status).send({
          error:
            status === 503
              ? "El almacenamiento de comprobantes no está disponible temporalmente"
              : "No se pudo guardar el comprobante",
        });
      }

      const association = await associateTransferProofReference(
        app.prisma.order,
        order,
        storedReference
      );
      if (association.kind === "conflict") {
        // Conservamos el objeto como huérfano recuperable durante el canario.
        // Un barrido con período de gracia lo podrá retirar con certeza.
        request.log.warn(
          { orderId },
          "El pedido cambió durante la subida del comprobante"
        );
        return reply.status(409).send({
          error:
            "El pedido cambió mientras se subía el archivo. Actualiza e intenta de nuevo.",
        });
      }
      if (association.kind === "unknown") {
        // Un error de commit puede significar que Postgres sí confirmó. Nunca
        // eliminamos aquí: retener un posible huérfano es preferible a dejar
        // una referencia confirmada apuntando a un objeto borrado.
        request.log.error(
          { err: association.error, orderId },
          "Resultado ambiguo asociando comprobante al pedido"
        );
        return reply.status(500).send({ error: "No se pudo guardar el comprobante" });
      }
      if (association.warning) {
        request.log.warn(
          { err: association.warning, orderId },
          "Comprobante asociado; la reconciliación secundaria tuvo un error"
        );
      }

      // No retiramos automáticamente el comprobante reemplazado. Durante el
      // canario se prioriza retención/recuperación sobre unos pocos MB de Drive;
      // una limpieza con período de gracia se habilitará por separado.

      const updated = association.order;
      const activeReference = updated?.transferProofUrl ?? storedReference;
      const deliveryUrl = buildTransferProofDeliveryUrl(
        orderId,
        activeReference
      );

      // Notify admin (re-uses order:new toast/sound and refreshes the kanban).
      if (updated) {
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
        // También alcanza la pestaña del cliente si está abierta en otro lado.
        emitOrderStatus(app, updated.customerId, updated.id, updated.status, {
          orderNumber: updated.orderNumber,
        });
      }

      return { ok: true, transferProofUrl: deliveryUrl };
    }
  );
}
