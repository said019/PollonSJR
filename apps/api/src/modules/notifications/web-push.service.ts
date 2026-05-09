import webpush from "web-push";
import type { FastifyInstance } from "fastify";

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@pollonsjr.com";
  if (!publicKey || !privateKey) {
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

/**
 * Send a push notification to all of a customer's subscriptions.
 * Silently logs and continues on errors. Removes 410/404 subs (Gone).
 */
export async function pushToCustomer(
  app: FastifyInstance,
  customerId: string,
  payload: PushPayload
) {
  if (!ensureConfigured()) {
    app.log.warn("VAPID keys not configured — skipping push");
    return { sent: 0, failed: 0 };
  }

  const subs = await app.prisma.pushSubscription.findMany({
    where: { customerId },
  });
  if (subs.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
        sent++;
      } catch (err: any) {
        failed++;
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          dead.push(sub.id);
        } else {
          app.log.warn({ status, customerId }, "Push failed");
        }
      }
    })
  );

  if (dead.length > 0) {
    await app.prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  }

  return { sent, failed };
}

export function getPublicVapidKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}
