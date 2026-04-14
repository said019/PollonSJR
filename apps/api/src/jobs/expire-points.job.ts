import { FastifyInstance } from "fastify";

/**
 * Expire pending free-product rewards that are past their expiration date.
 * Loyalty rewards now expire 6 months after being earned.
 */
export async function runExpirePoints(app: FastifyInstance) {
  const expiredCards = await app.prisma.loyaltyCard.findMany({
    where: {
      pendingReward: true,
      rewardExpiresAt: { lt: new Date() },
    },
  });

  for (const card of expiredCards) {
    await app.prisma.$transaction([
      app.prisma.loyaltyCard.update({
        where: { id: card.id },
        data: {
          pendingReward: false,
          pendingProductId: null,
          rewardEarnedAt: null,
          rewardExpiresAt: null,
        },
      }),
      app.prisma.loyaltyEvent.create({
        data: {
          cardId: card.id,
          orderDelta: 0,
          reason: "expire:reward_ttl_6mo",
        },
      }),
    ]);
  }

  app.log.info(`Expired ${expiredCards.length} loyalty rewards (6mo TTL)`);
}
