import type { FastifyInstance } from "fastify";
import { pushToCustomer } from "../modules/notifications/web-push.service";

export interface ReEngagementResult {
  sent: number;
  skippedCooldown: number;
  noTopProduct: number;
  candidates: number;
}

export interface SendReEngagementForOneResult {
  ok: boolean;
  customerId: string;
  productName?: string;
  productEmoji?: string;
  pushSent?: number;
  pushFailed?: number;
  reason?: string;
}

/**
 * Re-engagement push — corre diario a las 11:00 América/México (17:00 UTC).
 *
 * Lógica:
 *  - Busca clientes con push subscription activa que NO hayan pedido en los
 *    últimos 14 días pero que SÍ tengan al menos un pedido histórico (los
 *    nuevos sin historia los ignoramos — no sabemos qué recomendarles).
 *  - Para cada uno, encuentra el producto que MÁS ha pedido.
 *  - Envía un push: "Hace tiempo que no pides {producto} 🍗 ¿se te antoja?"
 *  - Cooldown de 30 días por cliente vía Redis (no spammear).
 *  - Cap diario: máximo 50 pushes por día para no levantar sospechas de spam
 *    con el browser vendor (Firefox/Chrome bajan reputación si mandas muchos
 *    pushes sin engagement).
 */

const STALE_DAYS = 14;
const COOLDOWN_DAYS = 30;
const DAILY_CAP = 50;

/**
 * Manual send para un cliente específico — ignora cooldown y staleness.
 * Útil para testear desde admin.
 */
export async function sendReEngagementForOne(
  app: FastifyInstance,
  customerId: string,
  opts: { ignoreCooldown?: boolean } = {}
): Promise<SendReEngagementForOneResult> {
  const top = await app.prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      order: {
        customerId,
        status: { in: ["DELIVERED", "RECEIVED", "PREPARING", "READY", "ON_THE_WAY"] as any },
      },
      product: { active: true, soldOut: false },
    },
    _sum: { qty: true },
    orderBy: { _sum: { qty: "desc" } },
    take: 1,
  });

  const topProductId = top[0]?.productId;
  if (!topProductId) {
    return {
      ok: false,
      customerId,
      reason: "Este cliente no tiene historial de pedidos no-cancelados — no podemos recomendar nada",
    };
  }

  const product = await app.prisma.product.findUnique({
    where: { id: topProductId },
    select: { name: true, emoji: true },
  });
  if (!product) {
    return { ok: false, customerId, reason: "Producto top no encontrado" };
  }

  const emoji = product.emoji || "🍗";
  const result = await pushToCustomer(app, customerId, {
    title: `Hace tiempo que no pides ${product.name} ${emoji}`,
    body: "¿Se te antoja? Tu pollón te espera 🔥",
    url: "/menu",
    tag: `reengage-${customerId}`,
    data: { type: "reengagement", productId: topProductId },
  });

  if (opts.ignoreCooldown !== true && result.sent > 0) {
    await app.redis
      .set(`reengaged:${customerId}`, "1", { EX: 30 * 24 * 60 * 60 })
      .catch(() => null);
  }

  return {
    ok: result.sent > 0,
    customerId,
    productName: product.name,
    productEmoji: emoji,
    pushSent: result.sent,
    pushFailed: result.failed,
    reason:
      result.sent === 0
        ? "Cliente sin push subscription activa (o todas las subs murieron)"
        : undefined,
  };
}

export async function runReEngagement(app: FastifyInstance): Promise<ReEngagementResult> {
  const since = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000);

  // 1. Clientes elegibles: tienen push sub, su último pedido fue antes de `since`.
  //    Lo hacemos en SQL crudo porque el filtro "último pedido < X" combinado con
  //    "tiene push sub" es feo de expresar con Prisma fluent.
  type Row = { customerId: string; lastOrderAt: Date | null };
  const candidates = await app.prisma.$queryRaw<Row[]>`
    SELECT c.id AS "customerId", MAX(o."createdAt") AS "lastOrderAt"
    FROM "Customer" c
    JOIN "PushSubscription" ps ON ps."customerId" = c.id
    LEFT JOIN "Order" o ON o."customerId" = c.id
      AND o.status NOT IN ('PENDING_PAYMENT', 'CANCELLED')
    WHERE c.blocked = false
    GROUP BY c.id
    HAVING MAX(o."createdAt") IS NOT NULL
       AND MAX(o."createdAt") < ${since}
    LIMIT ${DAILY_CAP * 3}
  `;

  let sentCount = 0;
  let skippedCooldown = 0;
  let noTopProduct = 0;

  for (const row of candidates) {
    if (sentCount >= DAILY_CAP) {
      app.log.info(`Re-engagement: hit daily cap of ${DAILY_CAP}`);
      break;
    }

    // 2. Cooldown — no enviar si ya le mandamos un re-engage en los últimos 30 días.
    const cooldownKey = `reengaged:${row.customerId}`;
    const onCooldown = await app.redis.get(cooldownKey).catch(() => null);
    if (onCooldown) {
      skippedCooldown++;
      continue;
    }

    // 3. Top product del cliente — el que más veces ha pedido.
    const top = await app.prisma.orderItem.groupBy({
      by: ["productId"],
      where: {
        order: {
          customerId: row.customerId,
          status: { in: ["DELIVERED", "RECEIVED", "PREPARING", "READY", "ON_THE_WAY"] as any },
        },
        product: { active: true, soldOut: false },
      },
      _sum: { qty: true },
      orderBy: { _sum: { qty: "desc" } },
      take: 1,
    });

    const topProductId = top[0]?.productId;
    if (!topProductId) {
      noTopProduct++;
      continue;
    }

    const product = await app.prisma.product.findUnique({
      where: { id: topProductId },
      select: { name: true, emoji: true },
    });
    if (!product) {
      noTopProduct++;
      continue;
    }

    // 4. Enviar push. pushToCustomer envía a todas sus subscriptions y limpia las muertas.
    const emoji = product.emoji || "🍗";
    const result = await pushToCustomer(app, row.customerId, {
      title: `Hace tiempo que no pides ${product.name} ${emoji}`,
      body: "¿Se te antoja? Tu pollón te espera 🔥",
      url: "/menu",
      tag: `reengage-${row.customerId}`,
      data: { type: "reengagement", productId: topProductId },
    });

    if (result.sent === 0) {
      // Todas las subs murieron — no marcar cooldown, así pueden volver a entrar
      // si se re-suscriben.
      continue;
    }

    // 5. Marcar cooldown 30 días.
    await app.redis
      .set(cooldownKey, "1", { EX: COOLDOWN_DAYS * 24 * 60 * 60 })
      .catch(() => null);

    sentCount++;
  }

  app.log.info(
    `Re-engagement: ${sentCount} sent, ${skippedCooldown} on cooldown, ${noTopProduct} no top product. Candidates: ${candidates.length}`
  );

  return {
    sent: sentCount,
    skippedCooldown,
    noTopProduct,
    candidates: candidates.length,
  };
}
