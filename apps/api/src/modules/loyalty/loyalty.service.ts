import { FastifyInstance } from "fastify";
import { AppleWalletService } from "./apple-wallet.service";
import { GoogleWalletService } from "./google-wallet.service";

const ORDERS_PER_REWARD = 5;
const REWARD_TTL_MONTHS = 6;

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

    // Update wallet passes (fire-and-forget, don't block the response)
    const newProgress = pendingReward
      ? ORDERS_PER_REWARD
      : newCompletedOrders % ORDERS_PER_REWARD;
    const apple = new AppleWalletService(this.app);
    const google = new GoogleWalletService(this.app);

    const walletMessage =
      earnedReward && pendingReward
        ? "¡Felicidades! Ganaste un producto gratis"
        : `Compra registrada — ${newProgress}/${ORDERS_PER_REWARD}`;

    Promise.allSettled([
      apple.updatePassAndNotify(order.customerId, walletMessage),
      google.updateLoyaltyObject(
        order.customerId,
        order.customer.name ?? "",
        newProgress
      ),
    ]).catch(() => {});

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
  }

  /**
   * Apply a pending loyalty reward when creating a new order.
   * Returns the discount (full product price) if applicable.
   */
  async applyPendingReward(customerId: string, subtotal: number) {
    const card = await this.app.prisma.loyaltyCard.findUnique({
      where: { customerId },
      include: { pendingProduct: true },
    });

    if (!card?.pendingReward || !card.pendingProduct) {
      return { discountAmount: 0, rewardApplied: false, productName: null as string | null };
    }

    // Check expiry
    if (card.rewardExpiresAt && new Date() > card.rewardExpiresAt) {
      await this.app.prisma.loyaltyCard.update({
        where: { id: card.id },
        data: { pendingReward: false, pendingProductId: null, rewardEarnedAt: null, rewardExpiresAt: null },
      });
      return { discountAmount: 0, rewardApplied: false, productName: null };
    }

    // Discount = price of the free product (capped at subtotal)
    const discountAmount = Math.min(card.pendingProduct.price, subtotal);

    // Clear pending reward (now used)
    await this.app.prisma.loyaltyCard.update({
      where: { id: card.id },
      data: {
        pendingReward: false,
        pendingProductId: null,
        rewardEarnedAt: null,
        rewardExpiresAt: null,
        freeProductsUsed: card.freeProductsUsed + 1,
      },
    });

    return {
      discountAmount,
      rewardApplied: true,
      productName: card.pendingProduct.name,
    };
  }

  /**
   * Admin: adjust a customer's completed orders manually.
   */
  async adminAdjust(customerId: string, delta: number, reason: string) {
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
