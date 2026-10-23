import { WhatsAppInbox, startInboxRecovery } from "../whatsapp/inbox";
import { FastifyInstance } from "fastify";
import { adminOnly } from "../../middlewares/admin-only";
import { timingSafeEqual } from "node:crypto";
import { WhatsAppBot, parseIncoming } from "../whatsapp/bot";
import { observeOutbound, attentionKeys, recordAppOutbound } from "../whatsapp/attention";
import { isBusinessGreeting } from "../whatsapp/business-greeting";
import { whatsappCatalogRoutes } from "../whatsapp/catalog.routes";

const EVO_URL = () => process.env.EVOLUTION_API_URL?.replace(/\/$/, "");
const EVO_KEY = () => process.env.EVOLUTION_API_KEY;
const EVO_INSTANCE = () => process.env.EVOLUTION_INSTANCE || "pollon-sjr";

function evoHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: EVO_KEY() || "",
  };
}

/**
 * Admin routes for Evolution API management.
 * Registered at /api/evolution
 */
export async function evolutionRoutes(app: FastifyInstance) {
  await app.register(whatsappCatalogRoutes);
  // ─── Status: is WhatsApp connected? ──────────────────────

  app.get("/status", { preHandler: [adminOnly] }, async () => {
    const url = EVO_URL();
    if (!url || !EVO_KEY()) {
      return { provider: "evolution", configured: false, connected: false, state: "not_configured" };
    }

    try {
      const res = await fetch(`${url}/instance/fetchInstances`, { headers: evoHeaders() });
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      const instance = list.find((i: any) => i.name === EVO_INSTANCE());

      if (!instance) {
        return { provider: "evolution", configured: true, connected: false, state: "not_created" };
      }

      return {
        provider: "evolution",
        configured: true,
        connected: instance.connectionStatus === "open",
        state: instance.connectionStatus,
        number: instance.number || null,
      };
    } catch (err: any) {
      app.log.error("Evolution status error:", err);
      return { provider: "evolution", configured: true, connected: false, state: "error" };
    }
  });

  // ─── Connect: returns QR code to scan ────────────────────

  app.post("/connect", { preHandler: [adminOnly] }, async (_request, reply) => {
    const url = EVO_URL();
    if (!url || !EVO_KEY()) {
      return reply.status(400).send({ error: "Evolution API no configurada" });
    }

    try {
      const res = await fetch(`${url}/instance/connect/${EVO_INSTANCE()}`, {
        headers: evoHeaders(),
      });
      const data = (await res.json()) as {
        base64?: string;
        pairingCode?: string;
        count?: number;
      };
      return {
        success: true,
        qrCode: data.base64 || null,
        pairingCode: data.pairingCode || null,
        count: data.count || null,
      };
    } catch (err: any) {
      return reply.status(500).send({ error: "Error generando QR", detail: err.message });
    }
  });

  // ─── Logout: unpair WhatsApp ─────────────────────────────

  app.post("/logout", { preHandler: [adminOnly] }, async (_request, reply) => {
    const url = EVO_URL();
    if (!url || !EVO_KEY()) {
      return reply.status(400).send({ error: "Evolution API no configurada" });
    }

    try {
      const res = await fetch(`${url}/instance/logout/${EVO_INSTANCE()}`, {
        method: "DELETE",
        headers: evoHeaders(),
      });
      const data = await res.json();
      return { success: true, data };
    } catch (err: any) {
      return reply.status(500).send({ error: "Error cerrando sesión", detail: err.message });
    }
  });

  // ─── Test: send a test message ───────────────────────────

  app.post("/test", { preHandler: [adminOnly] }, async (request, reply) => {
    const { phone } = request.body as { phone: string };
    if (!phone || phone.length !== 10) {
      return reply.status(400).send({ error: "phone requerido (10 dígitos)" });
    }

    const { sendWhatsAppEvolution } = await import("./whatsapp.service");
    try {
      await sendWhatsAppEvolution({
        id: crypto.randomUUID(),
        type: "whatsapp",
        to: phone,
        template: "otp_code",
        params: { code: "TEST-" + Math.floor(Math.random() * 1000).toString().padStart(3, "0") },
        attempts: 0,
        createdAt: new Date().toISOString(),
      }, app.redis);
      return { success: true, message: `Mensaje de prueba enviado a +52${phone}` };
    } catch (err: any) {
      return reply.status(500).send({ error: "Error enviando", detail: err.message });
    }
  });
}

/**
 * Public webhook endpoint — Evolution API posts here for every event.
 * Registered at /api/webhook/evolution
 */
export async function evolutionWebhookRoutes(app: FastifyInstance) {
  const bot = new WhatsAppBot(app);
  const inbox = new WhatsAppInbox(app, (input, defer) => bot.handle(input, defer));
  startInboxRecovery(app, inbox);
  app.post("/", async (request, reply) => {
    const payload = request.body as any;
    const { event, instance, data } = payload || {};

    // Only process events from our instance
    if (instance !== EVO_INSTANCE() && instance !== undefined) {
      return reply.status(200).send({ ignored: true });
    }

    switch (event) {
      case "qrcode.updated":
        app.log.info(`[Evolution] QR updated for ${instance}`);
        break;

      case "connection.update":
        app.log.info(`[Evolution] Connection ${instance}: ${data?.state}`);
        break;

      case "messages.upsert":
        if (process.env.WHATSAPP_BOT_ENABLED !== "true") break;
        // Receiving orders is a privileged action. Fail closed without a
        // separate shared secret and an exact instance match.
        const secret = process.env.EVOLUTION_WEBHOOK_SECRET || "";
        const supplied = request.headers["x-webhook-secret"];
        if (secret.length < 32) return reply.status(503).send({ error: "Webhook not configured" });
        if (typeof supplied !== "string" || Buffer.byteLength(supplied) !== Buffer.byteLength(secret) ||
            !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) {
          return reply.status(401).send({ error: "Unauthorized" });
        }
        if (instance !== EVO_INSTANCE()) return reply.status(200).send({ ignored: true });
        const messages: unknown[] = Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : [data];
        if (messages.length > 50) return reply.status(413).send({ error: "Batch too large" });
        // Observe staff intervention before customer turns in the same batch.
        const incomingMessages = messages.map((raw: unknown) => parseIncoming(raw)).filter((m): m is NonNullable<typeof m> => m !== null);
        for (const incoming of incomingMessages.filter(m => m.fromMe)) {
          if (isBusinessGreeting(incoming)) {
            // Register only this approved automation's ID. This never removes
            // an explicit human hold or any other staff message ID.
            await recordAppOutbound(app.redis, incoming.phone, incoming.id);
            continue;
          }
          if (await observeOutbound(app.redis, incoming.phone, incoming.id) === "app") continue;
          // Never execute a command while it could still be an unacknowledged
          // app echo. It remains a hold unless the sender proves its own ID.
          if (["pausar bot", "activar bot"].includes(incoming.text.trim().toLowerCase()) &&
              !await app.redis.get(attentionKeys(incoming.phone).sending)) await bot.handle(incoming);
        }
        await inbox.receive(incomingMessages.filter(m => !m.fromMe));
        break;

      case "send.message":
        // Our outbound message delivered — log for tracking
        break;

      default:
        // Ignore other events
        break;
    }

    return reply.status(200).send({ received: true });
  });
}
