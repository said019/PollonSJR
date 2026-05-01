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

  /**
   * Create a promotion plus its items in a single transaction.
   * `price` is in cents.
   */
  async create(data: {
    name: string;
    description?: string | null;
    dayOfWeek?: number | null;
    price: number;
    active?: boolean;
    items: Array<{ productId: string; qty: number; variant?: string | null }>;
  }) {
    return this.app.prisma.promotion.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        dayOfWeek: data.dayOfWeek ?? null,
        price: data.price,
        active: data.active ?? true,
        items: {
          create: data.items.map((it) => ({
            productId: it.productId,
            qty: it.qty,
            variant: it.variant ?? null,
          })),
        },
      },
      include: { items: { include: { product: true } } },
    });
  }

  /**
   * Update a promotion. If `items` is provided, the existing items are
   * fully replaced inside a single transaction.
   */
  async update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      dayOfWeek?: number | null;
      price?: number;
      active?: boolean;
      items?: Array<{ productId: string; qty: number; variant?: string | null }>;
    }
  ) {
    return this.app.prisma.$transaction(async (tx) => {
      if (data.items) {
        await tx.promotionItem.deleteMany({ where: { promotionId: id } });
      }
      return tx.promotion.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.dayOfWeek !== undefined && { dayOfWeek: data.dayOfWeek }),
          ...(data.price !== undefined && { price: data.price }),
          ...(data.active !== undefined && { active: data.active }),
          ...(data.items && {
            items: {
              create: data.items.map((it) => ({
                productId: it.productId,
                qty: it.qty,
                variant: it.variant ?? null,
              })),
            },
          }),
        },
        include: { items: { include: { product: true } } },
      });
    });
  }

  async remove(id: string) {
    return this.app.prisma.$transaction([
      this.app.prisma.promotionItem.deleteMany({ where: { promotionId: id } }),
      this.app.prisma.promotion.delete({ where: { id } }),
    ]);
  }
}
