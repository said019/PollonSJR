import { FastifyInstance } from "fastify";
import { z } from "zod";
import { adminOnly } from "../../middlewares/admin-only";
import { authenticate } from "../../middlewares/authenticate";
import { buildWALink } from "./whatsapp.service";
import { getPublicVapidKey } from "./web-push.service";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().max(500).optional(),
});

export async function notificationsRoutes(app: FastifyInstance) {
  // Admin: send a custom WhatsApp message to a customer
  app.post("/send", { preHandler: [adminOnly] }, async (request, reply) => {
    const { phone, message } = request.body as { phone: string; message: string };
    if (!phone || !message) {
      return reply.status(400).send({ error: "phone y message requeridos" });
    }
    const waUrl = buildWALink(phone, message);
    return { waUrl };
  });

  // ─── Web Push ─────────────────────────────────────────────

  // Public: get VAPID public key for browser subscription
  app.get("/vapid-key", async () => {
    return { publicKey: getPublicVapidKey() };
  });

  // Customer: register a push subscription
  app.post("/push/subscribe", { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = subscribeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos" });
    }
    const user = request.user as { id: string };
    const { endpoint, keys, userAgent } = parsed.data;

    // Upsert by endpoint (unique). If endpoint already belongs to another customer,
    // overwrite — same browser may be re-used across accounts.
    await app.prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        customerId: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? null,
      },
      update: {
        customerId: user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent ?? null,
      },
    });

    return { ok: true };
  });

  // Customer: remove a push subscription
  app.post("/push/unsubscribe", { preHandler: [authenticate] }, async (request, reply) => {
    const { endpoint } = request.body as { endpoint?: string };
    if (!endpoint) {
      return reply.status(400).send({ error: "endpoint requerido" });
    }
    const user = request.user as { id: string };
    await app.prisma.pushSubscription.deleteMany({
      where: { endpoint, customerId: user.id },
    });
    return { ok: true };
  });
}
