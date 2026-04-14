import { FastifyInstance } from "fastify";
import { PaymentsService } from "./payments.service";
import { authenticate } from "../../middlewares/authenticate";
import { adminOnly } from "../../middlewares/admin-only";
import crypto from "crypto";

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

  // ─── Webhook de MercadoPago ─────────────────────────────────

  app.post("/webhook", async (request, reply) => {
    // Verificar firma HMAC (si MP_WEBHOOK_SECRET está configurado)
    const signature = request.headers["x-signature"] as string;
    const webhookSecret = process.env.MP_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      const parts = signature.split(",");
      const tsValue = parts.find((p) => p.trim().startsWith("ts="))?.split("=")[1];
      const v1Value = parts.find((p) => p.trim().startsWith("v1="))?.split("=")[1];

      if (tsValue && v1Value) {
        const body = request.body as any;
        const dataId = body?.data?.id;
        const manifest = `id:${dataId};request-id:${request.headers["x-request-id"]};ts:${tsValue};`;
        const hmac = crypto
          .createHmac("sha256", webhookSecret)
          .update(manifest)
          .digest("hex");

        if (hmac !== v1Value) {
          return reply.status(401).send({ error: "Firma inválida" });
        }
      }
    }

    // Responder 200 INMEDIATAMENTE — MP no espera
    reply.status(200).send({ received: true });

    // Procesar en background (el service maneja idempotencia internamente)
    service.processWebhook(request.body).catch((err) => {
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
