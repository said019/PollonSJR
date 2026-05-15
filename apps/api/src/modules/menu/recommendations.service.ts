import { FastifyInstance } from "fastify";
import type { ProductPublic, CategoryType } from "@pollon/types";

const RELEVANT_STATUSES = [
  "RECEIVED",
  "PREPARING",
  "READY",
  "ON_THE_WAY",
  "DELIVERED",
] as const;

const GLOBAL_WINDOW_DAYS = 30;
const PERSONAL_MIN_DISTINCT_PRODUCTS = 2;
const PERSONAL_LIMIT = 4;
const GLOBAL_LIMIT = 6;

/**
 * Recomendaciones data-driven:
 *  - Personal: top productos que ESTE cliente ha pedido más veces (todo su historial).
 *  - Global:   top productos pedidos en los últimos 30 días por TODO el negocio.
 *
 * No es ML — son aggregations puras. Funcionan desde el primer día con poca data
 * (degradan a global) y mejoran solas conforme el cliente acumula pedidos.
 *
 * Resultado cacheado en Redis 5 min para que no peguemos a la DB en cada vista del menú.
 */
export class RecommendationsService {
  constructor(private app: FastifyInstance) {}

  async getForCustomer(customerId: string | null): Promise<{
    personal: ProductPublic[];
    global: ProductPublic[];
    source: "personal" | "global" | "mixed" | "empty";
  }> {
    const [personal, global] = await Promise.all([
      customerId ? this.personalTop(customerId) : Promise.resolve([]),
      this.globalTop(),
    ]);

    let source: "personal" | "global" | "mixed" | "empty" = "empty";
    if (personal.length >= PERSONAL_MIN_DISTINCT_PRODUCTS && global.length > 0) {
      source = "mixed";
    } else if (personal.length >= PERSONAL_MIN_DISTINCT_PRODUCTS) {
      source = "personal";
    } else if (global.length > 0) {
      source = "global";
    }

    return { personal, global, source };
  }

  private async personalTop(customerId: string): Promise<ProductPublic[]> {
    const cacheKey = `recs:personal:${customerId}`;
    const cached = await this.app.redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    // Suma de qty por producto, sólo de pedidos no-cancelados de este cliente.
    const grouped = await this.app.prisma.orderItem.groupBy({
      by: ["productId"],
      where: {
        order: {
          customerId,
          status: { in: RELEVANT_STATUSES as unknown as any[] },
        },
        product: { active: true, soldOut: false },
      },
      _sum: { qty: true },
      orderBy: { _sum: { qty: "desc" } },
      take: PERSONAL_LIMIT,
    });

    const productIds = grouped
      .filter((g) => (g._sum.qty ?? 0) > 0)
      .map((g) => g.productId);

    const products = await this.hydrate(productIds);

    await this.app.redis
      .set(cacheKey, JSON.stringify(products), { EX: 300 })
      .catch(() => null);

    return products;
  }

  private async globalTop(): Promise<ProductPublic[]> {
    const cacheKey = "recs:global";
    const cached = await this.app.redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    const since = new Date(
      Date.now() - GLOBAL_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );

    const grouped = await this.app.prisma.orderItem.groupBy({
      by: ["productId"],
      where: {
        order: {
          createdAt: { gte: since },
          status: { in: RELEVANT_STATUSES as unknown as any[] },
        },
        product: { active: true, soldOut: false },
      },
      _sum: { qty: true },
      orderBy: { _sum: { qty: "desc" } },
      take: GLOBAL_LIMIT,
    });

    const productIds = grouped
      .filter((g) => (g._sum.qty ?? 0) > 0)
      .map((g) => g.productId);

    let products = await this.hydrate(productIds);

    // Fallback: si no hay datos suficientes (negocio recién abierto, sin pedidos
    // en 30 días), muestra los productos destacados por sortOrder/categoría.
    if (products.length < 3) {
      const fallback = await this.app.prisma.product.findMany({
        where: { active: true, soldOut: false },
        orderBy: [{ sortOrder: "asc" }],
        take: GLOBAL_LIMIT,
      });
      products = fallback.map((p) => this.toPublic(p));
    }

    await this.app.redis
      .set(cacheKey, JSON.stringify(products), { EX: 300 })
      .catch(() => null);

    return products;
  }

  /** Hidrata IDs preservando el orden recibido (sort by group, no by query). */
  private async hydrate(productIds: string[]): Promise<ProductPublic[]> {
    if (productIds.length === 0) return [];
    const rows = await this.app.prisma.product.findMany({
      where: { id: { in: productIds }, active: true, soldOut: false },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return productIds
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => this.toPublic(p));
  }

  private toPublic(p: any): ProductPublic {
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category as CategoryType,
      price: p.price,
      imageUrl: p.imageUrl,
      soldOut: p.soldOut,
      variants: p.variants as any,
      tags: p.tags ?? [],
      emoji: p.emoji ?? null,
    };
  }

  /**
   * Invalidación útil para llamar desde el módulo de orders cuando se crea
   * un nuevo pedido (refresca el global) — opcional, ya que el TTL es corto.
   */
  async invalidateGlobal() {
    await this.app.redis.del("recs:global").catch(() => null);
  }
}
