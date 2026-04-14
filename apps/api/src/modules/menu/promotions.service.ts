import { FastifyInstance } from "fastify";

export class PromotionsService {
  constructor(private app: FastifyInstance) {}

  /**
   * Get promotions for today (or a specific day of week).
   */
  async getToday() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 6=Sat

    const promotions = await this.app.prisma.promotion.findMany({
      where: {
        active: true,
        OR: [{ dayOfWeek }, { dayOfWeek: null }],
      },
      include: {
        items: { include: { product: true } },
      },
    });

    return promotions.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      dayOfWeek: p.dayOfWeek,
      price: p.price,
      items: p.items.map((i) => ({
        productId: i.productId,
        productName: i.product.name,
        emoji: i.product.emoji,
        qty: i.qty,
        variant: i.variant,
      })),
    }));
  }

  /**
   * Admin: list all promotions.
   */
  async listAll() {
    const promotions = await this.app.prisma.promotion.findMany({
      orderBy: [{ dayOfWeek: "asc" }, { createdAt: "asc" }],
      include: { items: { include: { product: true } } },
    });
    return promotions;
  }

  async toggleActive(id: string, active: boolean) {
    return this.app.prisma.promotion.update({
      where: { id },
      data: { active },
    });
  }
}
