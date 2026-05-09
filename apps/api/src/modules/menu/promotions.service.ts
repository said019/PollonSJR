import { FastifyInstance } from "fastify";

export class PromotionsService {
  constructor(private app: FastifyInstance) {}

  /**
   * Get promotions for today (or a specific day of week).
   * Filters out: inactive, exhausted (maxUses reached), outside time window,
   * and private promotions (with a code — only shown when redeemed by code).
   */
  async getToday() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const nowHHMM = today.toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Mexico_City",
    });

    const promotions = await this.app.prisma.promotion.findMany({
      where: {
        active: true,
        code: null, // hide private promos from public listing
        OR: [{ dayOfWeek }, { dayOfWeek: null }],
      },
      include: {
        items: { include: { product: true } },
      },
    });

    const visible = promotions.filter((p) => {
      if (p.maxUses != null && p.usedCount >= p.maxUses) return false;
      if (p.startTime || p.endTime) {
        const start = p.startTime ?? "00:00";
        const end = p.endTime ?? "23:59";
        if (start <= end) {
          if (nowHHMM < start || nowHHMM > end) return false;
        } else if (nowHHMM < start && nowHHMM > end) {
          return false;
        }
      }
      return true;
    });

    return visible.map((p) => ({
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
   * Lookup a promotion by its private code (case-insensitive).
   * Validates active, within time window, and not exhausted.
   * Returns null if not redeemable.
   */
  async findByCode(rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (!code) return null;

    const promo = await this.app.prisma.promotion.findUnique({
      where: { code },
      include: { items: { include: { product: true } } },
    });
    if (!promo || !promo.active) return null;
    if (promo.maxUses != null && promo.usedCount >= promo.maxUses) return null;

    const now = new Date();
    if (promo.dayOfWeek != null && promo.dayOfWeek !== now.getDay()) return null;

    if (promo.startTime || promo.endTime) {
      const nowHHMM = now.toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "America/Mexico_City",
      });
      const start = promo.startTime ?? "00:00";
      const end = promo.endTime ?? "23:59";
      if (start <= end) {
        if (nowHHMM < start || nowHHMM > end) return null;
      } else if (nowHHMM < start && nowHHMM > end) {
        return null;
      }
    }
    return promo;
  }

  async incrementUsage(id: string) {
    return this.app.prisma.promotion.update({
      where: { id },
      data: { usedCount: { increment: 1 } },
    });
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
    startTime?: string | null;
    endTime?: string | null;
    code?: string | null;
    maxUses?: number | null;
    price: number;
    active?: boolean;
    items: Array<{ productId: string; qty: number; variant?: string | null }>;
  }) {
    return this.app.prisma.promotion.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        dayOfWeek: data.dayOfWeek ?? null,
        startTime: data.startTime ?? null,
        endTime: data.endTime ?? null,
        code: data.code ? data.code.toUpperCase().trim() : null,
        maxUses: data.maxUses ?? null,
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
      startTime?: string | null;
      endTime?: string | null;
      code?: string | null;
      maxUses?: number | null;
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
          ...(data.startTime !== undefined && { startTime: data.startTime }),
          ...(data.endTime !== undefined && { endTime: data.endTime }),
          ...(data.code !== undefined && {
            code: data.code ? data.code.toUpperCase().trim() : null,
          }),
          ...(data.maxUses !== undefined && { maxUses: data.maxUses }),
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
