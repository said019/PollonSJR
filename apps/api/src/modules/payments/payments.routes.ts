import { FastifyInstance } from "fastify";
import { PaymentsService } from "./payments.service";
import { authenticate } from "../../middlewares/authenticate";
import { adminOnly } from "../../middlewares/admin-only";
import crypto from "crypto";
import { z } from "zod";

const cardPaymentSchema = z.object({
  orderId: z.string().min(1),
  token: z.string().min(1),
  paymentMethodId: z.string().min(1),
  issuerId: z.union([z.string(), z.number()]).optional(),
  installments: z.number().int().min(1).max(24).optional(),
  transactionAmount: z.number().positive().optional(),
  idempotencyKey: z.string().max(120).optional(),
  payer: z
    .object({
      email: z.string().email().optional(),
      identification: z
        .object({
          type: z.string().optional(),
          number: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export async function paymentsRoutes(app: FastifyInstance) {
  const service = new PaymentsService(app);

  // ─── Cliente ────────────────────────────────────────────────

  // Crear preferencia de pago
  app.post("/create", { preHandler: [authenticate] }, async (request, reply) => {
    const { orderId } = request.body as { orderId: string };
    if (!orderId) return reply.status(400).send({ error: "orderId requerido" });

    try {
      return await service.createPreference(orderId);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Crear pago directo con Card Payment Brick
  app.post("/card", { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = cardPaymentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Datos de pago inválidos",
        details: parsed.error.flatten(),
      });
    }

    const user = request.user as { id: string };
    try {
      return await service.createCardPayment(user.id, parsed.data);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Status del pago de un pedido
  app.get<{ Params: { orderId: string } }>(
    "/:orderId",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        return await service.getPaymentStatus(request.params.orderId);
      } catch (err: any) {
        return reply.status(404).send({ error: err.message });
      }
    }
  );

  // Reconciliación pull-based — el cliente la llama cuando regresa de MP.
  // Consulta MP directamente y activa el pedido si encuentra un pago aprobado.
  // No depende del webhook (que puede fallar/tardar).
  app.post<{ Params: { orderId: string } }>(
    "/reconcile/:orderId",
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        return await service.reconcileOrderPayment(request.params.orderId);
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  // ─── Webhook de MercadoPago ─────────────────────────────────

  app.post("/webhook", async (request, reply) => {
    // MP manda dos formatos:
    //  - Moderno: POST con body {type:"payment", data:{id}}
    //  - Legacy IPN: POST con query params ?id=X&topic=Y (body vacío)
    // Normalizamos antes de firmar/procesar.
    const body = (request.body as any) || {};
    const query = (request.query as any) || {};
    const dataId: string | undefined =
      body?.data?.id?.toString?.() || (query.id ? String(query.id) : undefined);
    const eventType: string | undefined = body?.type || query.topic;

    // Verificar firma HMAC (si MP_WEBHOOK_SECRET está configurado)
    const signature = request.headers["x-signature"] as string;
    const webhookSecret = process.env.MP_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      const parts = signature.split(",");
      const tsValue = parts.find((p) => p.trim().startsWith("ts="))?.split("=")[1];
      const v1Value = parts.find((p) => p.trim().startsWith("v1="))?.split("=")[1];

      if (tsValue && v1Value && dataId) {
        const manifest = `id:${dataId};request-id:${request.headers["x-request-id"]};ts:${tsValue};`;
        const hmac = crypto
          .createHmac("sha256", webhookSecret)
          .update(manifest)
          .digest("hex");

        if (hmac !== v1Value) {
          app.log.warn(
            { dataId, signaturePreview: v1Value.slice(0, 8) },
            "MP webhook: firma HMAC inválida — secreto distinto o manifest distinto"
          );
          return reply.status(401).send({ error: "Firma inválida" });
        }
      }
    }

    // Responder 200 INMEDIATAMENTE — MP no espera
    reply.status(200).send({ received: true });

    // Sólo procesamos eventos de tipo "payment". merchant_order y otros se ignoran.
    if (eventType !== "payment" || !dataId) return;

    // Construir payload normalizado para el service.
    const normalizedPayload =
      body && body.data ? body : { type: "payment", data: { id: dataId } };

    service.processWebhook(normalizedPayload).catch((err) => {
      app.log.error("Webhook processing error:", err);
    });
  });

  // ─── Admin ──────────────────────────────────────────────────

  // Reembolso total de un pedido
  app.post<{ Params: { orderId: string } }>(
    "/admin/orders/:orderId/refund",
    { preHandler: [adminOnly] },
    async (request, reply) => {
      try {
        return await service.refundOrder(request.params.orderId);
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  // Reconciliar pago manualmente (admin) — útil para rescatar pedidos
  // antiguos que se quedaron PENDING_PAYMENT por webhook caído.
  app.post<{ Params: { orderId: string } }>(
    "/admin/orders/:orderId/reconcile",
    { preHandler: [adminOnly] },
    async (request, reply) => {
      try {
        return await service.reconcileOrderPayment(request.params.orderId);
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  // Historial de pagos con filtros
  app.get(
    "/admin/payments",
    { preHandler: [adminOnly] },
    async (request, reply) => {
      const query = request.query as {
        status?: string;
        from?: string;
        to?: string;
        page?: string;
      };
      return service.getAdminPayments({
        status: query.status,
        from: query.from,
        to: query.to,
        page: query.page ? parseInt(query.page) : 1,
      });
    }
  );

  // Revenue por período
  app.get<{ Params: { period: string } }>(
    "/admin/revenue/:period",
    { preHandler: [adminOnly] },
    async (request, reply) => {
      const period = request.params.period as "day" | "week" | "month";
      if (!["day", "week", "month"].includes(period)) {
        return reply.status(400).send({ error: "Período inválido: day, week, month" });
      }
      return service.getRevenue(period);
    }
  );
}
