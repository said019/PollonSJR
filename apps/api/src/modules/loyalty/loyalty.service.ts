import { FastifyInstance } from "fastify";
import { AppleWalletService } from "./apple-wallet.service";
import { GoogleWalletService } from "./google-wallet.service";

const ORDERS_PER_REWARD = 5;
const REWARD_TTL_MONTHS = 6;

/** Línea de pedido candidata a recibir el producto gratis del premio. */
export interface RewardEligibleLine {
  productId: string;
  qty: number;
  unitPrice: number;
}

export class LoyaltyService {
  constructor(private app: FastifyInstance) {}

  /**
   * Get loyalty info for a customer.
   */
  async getInfo(customerId: string) {
    const card = await this.ensureCard(customerId);
    const { progress, ordersToNext } = this.getProgress(
      card.completedOrders,
      card.pendingReward
    );

    return {
      completedOrders: card.completedOrders,
      freeProductsEarned: card.freeProductsEarned,
      freeProductsUsed: card.freeProductsUsed,
      progress,
      ordersToNext,
      target: ORDERS_PER_REWARD,
      pendingReward: card.pendingReward,
      pendingProduct: card.pendingProduct
        ? {
            id: card.pendingProduct.id,
            name: card.pendingProduct.name,
            emoji: card.pendingProduct.emoji,
          }
        : null,
      rewardEarnedAt: card.rewardEarnedAt?.toISOString() || null,
      rewardExpiresAt: card.rewardExpiresAt?.toISOString() || null,
    };
  }

  async getHistory(customerId: string) {
    const card = await this.ensureCard(customerId);

    return this.app.prisma.loyaltyEvent.findMany({
      where: { cardId: card.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  /**
   * Process loyalty after an order is delivered.
   * - Increments completedOrders
   * - Every 5 orders, earns a free product reward
   * - Product is determined from customer history (most ordered)
   * - Reward expires 6 months after earning
   */
  async processAfterDelivery(orderId: string) {
    const order = await this.app.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: { include: { loyalty: true } } },
    });
    if (!order) return;

    let card = order.customer.loyalty;
    if (!card) {
      card = await this.app.prisma.loyaltyCard.create({
        data: { customerId: order.customerId },
      });
    }

    const newCompletedOrders = card.completedOrders + 1;
    const earnedReward = newCompletedOrders % ORDERS_PER_REWARD === 0;

    let pendingProductId: string | null = card.pendingProductId;
    let pendingReward = card.pendingReward;
    let rewardEarnedAt: Date | null = card.rewardEarnedAt;
    let rewardExpiresAt: Date | null = card.rewardExpiresAt;
    let freeProductsEarned = card.freeProductsEarned;

    if (earnedReward && !card.pendingReward) {
      // Determine most-ordered product for this customer
      const topProduct = await this.getMostOrderedProduct(order.customerId);
      if (topProduct) {
        pendingProductId = topProduct.id;
        pendingReward = true;
        rewardEarnedAt = new Date();
        rewardExpiresAt = new Date();
        rewardExpiresAt.setMonth(rewardExpiresAt.getMonth() + REWARD_TTL_MONTHS);
        freeProductsEarned = card.freeProductsEarned + 1;
      }
    }

    await this.app.prisma.$transaction([
      this.app.prisma.loyaltyCard.update({
        where: { id: card.id },
        data: {
          completedOrders: newCompletedOrders,
          pendingReward,
          pendingProductId,
          rewardEarnedAt,
          rewardExpiresAt,
          freeProductsEarned,
        },
      }),
      this.app.prisma.loyaltyEvent.create({
        data: {
          cardId: card.id,
          orderDelta: 1,
          reason: `order:#${order.orderNumber}`,
        },
      }),
    ]);

    const newProgress = pendingReward
      ? ORDERS_PER_REWARD
      : newCompletedOrders % ORDERS_PER_REWARD;

    const walletMessage =
      earnedReward && pendingReward
        ? "¡Felicidades! Ganaste un producto gratis"
        : `Compra registrada — ${newProgress}/${ORDERS_PER_REWARD}`;

    this.notifyWalletPasses(
      order.customerId,
      order.customer.name ?? "",
      newProgress,
      walletMessage
    );

    // Emit progress to customer
    const progressState = this.getProgress(newCompletedOrders, pendingReward);

    this.app.io.to(`customer:${order.customerId}`).emit("loyalty:points", {
      completedOrders: newCompletedOrders,
      progress: progressState.progress,
      ordersToNext: progressState.ordersToNext,
      target: ORDERS_PER_REWARD,
      pendingReward,
      points: newCompletedOrders,
      tier: "POLLITO",
      pointsEarned: 1,
    });

    // If earned reward, notify
    if (earnedReward && pendingReward && pendingProductId) {
      const product = await this.app.prisma.product.findUnique({
        where: { id: pendingProductId },
      });
      this.app.io.to(`customer:${order.customerId}`).emit("loyalty:tier_up", {
        newTier: "VIP_POLLON",
        previousTier: "POLLITO",
        message: `¡Ganaste ${product?.name ?? "un producto"} gratis! Se aplica en tu próximo pedido.`,
      });

      // Enqueue WhatsApp notification
      const { enqueueNotification } = await import("../notifications/queue");
      const name = order.customer.name ?? "Cliente";
      enqueueNotification(this.app.redis, {
        type: "whatsapp",
        to: order.customer.phone,
        template: "loyalty_reward_earned" as any,
        params: {
          name,
          productName: product?.name ?? "producto",
        },
      }).catch(() => {});
    }

    // Devolvemos el avance ya actualizado para que el aviso de "entregado"
    // pueda decir el número REAL de compras (antes mandaba "1 puntos" fijo).
    return {
      completedOrders: newCompletedOrders,
      target: ORDERS_PER_REWARD,
      pendingReward,
      ordersToNext: pendingReward
        ? 0
        : (ORDERS_PER_REWARD - (newCompletedOrders % ORDERS_PER_REWARD)) % ORDERS_PER_REWARD,
    };
  }

  /**
   * Apply a pending loyalty reward when creating a new order.
   *
   * El premio es UN producto concreto gratis (el que más pide el cliente),
   * no un saldo. Por eso sólo se canjea si ESE producto viene en el pedido
   * y el descuento se topa al precio de esa línea:
   *
   *   - Antes el tope era el subtotal COMPLETO del pedido, así que un premio
   *     de "12 Piezas" ($220) le regalaba $220 de cualquier otra cosa. Un
   *     pedido de $210 de productos distintos salía gratis.
   *   - Antes tampoco se revisaba el carrito, así que el premio se quemaba
   *     en el siguiente pedido fuera lo que fuera. Si el producto premiado
   *     no viene, ahora el premio se queda pendiente para después.
   *
   * "lines" son las líneas normales del pedido (sin las de combos, que ya
   * traen su propio descuento — apilar el premio encima sería doble regalo).
   */
  async applyPendingReward(customerId: string, lines: RewardEligibleLine[]) {
    const notApplied = {
      discountAmount: 0,
      rewardApplied: false,
      productName: null as string | null,
      productId: null as string | null,
      rewardExpiresAt: null as Date | null,
    };

    const card = await this.app.prisma.loyaltyCard.findUnique({
      where: { customerId },
      include: { pendingProduct: true },
    });

    if (!card?.pendingReward || !card.pendingProduct) {
      return notApplied;
    }

    // Check expiry
    if (card.rewardExpiresAt && new Date() > card.rewardExpiresAt) {
      await this.app.prisma.loyaltyCard.update({
        where: { id: card.id },
        data: { pendingReward: false, pendingProductId: null, rewardEarnedAt: null, rewardExpiresAt: null },
      });
      return notApplied;
    }

    // El producto premiado tiene que venir en el pedido. Si no, el premio
    // NO se quema: sigue pendiente para cuando el cliente sí lo pida.
    const rewardedLine = lines.find(
      (line) => line.productId === card.pendingProduct!.id && line.qty > 0
    );
    if (!rewardedLine) return notApplied;

    // Es UNA pieza gratis, al precio realmente cobrado en esa línea (la
    // variante puede costar menos que el precio base del producto).
    const discountAmount = Math.min(card.pendingProduct.price, rewardedLine.unitPrice);
    if (discountAmount <= 0) return notApplied;

    const rewardExpiresAt = card.rewardExpiresAt;
    const rewardedProductId = card.pendingProduct.id;
    const rewardedProductName = card.pendingProduct.name;

    // Atomically clear pending reward (conditional on pendingReward still being true)
    const updated = await this.app.prisma.loyaltyCard.updateMany({
      where: { id: card.id, pendingReward: true },
      data: {
        pendingReward: false,
        pendingProductId: null,
        rewardEarnedAt: null,
        rewardExpiresAt: null,
        freeProductsUsed: card.freeProductsUsed + 1,
      },
    });

    // If another request already redeemed the reward, don't apply discount
    if (updated.count === 0) {
      return notApplied;
    }

    return {
      discountAmount,
      rewardApplied: true,
      productName: rewardedProductName,
      productId: rewardedProductId,
      rewardExpiresAt,
    };
  }

  /**
   * Devolver el premio que consumió un pedido que terminó cancelado.
   *
   * El premio se quema al CREAR el pedido (hay que descontarlo para cobrar
   * el total correcto), pero nadie lo devolvía: un pedido con tarjeta que
   * nunca se pagaba, o cancelado por el negocio, se llevaba el premio del
   * cliente para siempre. Es idempotente: borra la marca del pedido dentro
   * de la misma transacción, así que dos rutas de cancelación no lo
   * devuelven dos veces.
   */
  async restorePendingReward(orderId: string): Promise<boolean> {
    const order = await this.app.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        customerId: true,
        loyaltyRewardProductId: true,
        loyaltyRewardExpiresAt: true,
      },
    });
    if (!order?.loyaltyRewardProductId) return false;

    const card = await this.app.prisma.loyaltyCard.findUnique({
      where: { customerId: order.customerId },
    });
    if (!card) return false;

    const clearOrderMark = {
      where: { id: orderId },
      data: { loyaltyRewardProductId: null, loyaltyRewardExpiresAt: null },
    };

    // Si el cliente ya ganó OTRO premio mientras tanto, no lo pisamos:
    // sólo soltamos la marca del pedido.
    if (card.pendingReward) {
      await this.app.prisma.order.update(clearOrderMark);
      return false;
    }

    await this.app.prisma.$transaction([
      this.app.prisma.loyaltyCard.update({
        where: { id: card.id },
        data: {
          pendingReward: true,
          pendingProductId: order.loyaltyRewardProductId,
          rewardEarnedAt: new Date(),
          // Se conserva el vencimiento ORIGINAL: cancelar un pedido no
          // alarga la vigencia del premio.
          rewardExpiresAt: order.loyaltyRewardExpiresAt,
          freeProductsUsed: Math.max(0, card.freeProductsUsed - 1),
        },
      }),
      this.app.prisma.loyaltyEvent.create({
        data: {
          cardId: card.id,
          orderDelta: 0,
          reason: `reward-restored:pedido-cancelado`,
        },
      }),
      this.app.prisma.order.update(clearOrderMark),
    ]);

    return true;
  }

  /**
   * Admin: corregir (restar) las compras de un cliente.
   *
   * Las compras SÓLO se acreditan al entregar un pedido hecho en la app —
   * ése es el motivo por el que a un cliente le conviene dejar de pedir por
   * WhatsApp. Si se pudieran regalar sellos a mano, el programa deja de
   * migrar a nadie y la decisión recae en el mostrador caso por caso. Se
   * permite restar para corregir errores reales (un pedido cancelado, etc.).
   */
  async adminAdjust(customerId: string, delta: number, reason: string) {
    if (delta > 0) {
      throw new Error(
        "Las compras sólo se acumulan al entregar un pedido hecho en la app. Aquí sólo puedes corregir restando."
      );
    }

    const card = await this.app.prisma.loyaltyCard.findUnique({
      where: { customerId },
    });
    if (!card) throw new Error("Cliente sin tarjeta de lealtad");

    await this.app.prisma.$transaction([
      this.app.prisma.loyaltyCard.update({
        where: { id: card.id },
        data: { completedOrders: Math.max(0, card.completedOrders + delta) },
      }),
      this.app.prisma.loyaltyEvent.create({
        data: {
          cardId: card.id,
          orderDelta: delta,
          reason: `admin:${reason}`,
        },
      }),
    ]);

    return this.getInfo(customerId);
  }

  private async ensureCard(customerId: string) {
    return this.app.prisma.loyaltyCard.upsert({
      where: { customerId },
      update: {},
      create: { customerId },
      include: { pendingProduct: true },
    });
  }

  private notifyWalletPasses(
    customerId: string,
    customerName: string,
    stamps: number,
    message: string
  ) {
    const apple = new AppleWalletService(this.app);
    const google = new GoogleWalletService(this.app);

    void Promise.allSettled([
      apple.updatePassAndNotify(customerId, message),
      (async () => {
        await google.updateLoyaltyObject(customerId, customerName, stamps);
        await google.sendMessage(customerId, "Pollón SJR", message);
      })(),
    ])
      .then((results) => {
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            this.app.log.error(
              {
                err: result.reason,
                customerId,
                wallet: index === 0 ? "apple" : "google",
              },
              "Wallet pass update failed"
            );
          }
        });
      })
      .catch((err) => {
        this.app.log.error(
          { err, customerId },
          "Wallet pass update handler failed"
        );
      });
  }

  private getProgress(completedOrders: number, pendingReward: boolean) {
    if (pendingReward) {
      return { progress: ORDERS_PER_REWARD, ordersToNext: 0 };
    }

    const progress = completedOrders % ORDERS_PER_REWARD;
    return {
      progress,
      ordersToNext: ORDERS_PER_REWARD - progress,
    };
  }

  /**
   * Find the most-ordered product by a customer.
   */
  private async getMostOrderedProduct(customerId: string) {
    const rows = await this.app.prisma.$queryRaw<
      Array<{ productId: string; total_qty: bigint }>
    >`
      SELECT oi."productId", SUM(oi.qty)::bigint as total_qty
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      WHERE o."customerId" = ${customerId}
      AND o."status" = 'DELIVERED'
      GROUP BY oi."productId"
      ORDER BY total_qty DESC
      LIMIT 1`;

    if (rows.length === 0) return null;

    return this.app.prisma.product.findUnique({ where: { id: rows[0].productId } });
  }
}
