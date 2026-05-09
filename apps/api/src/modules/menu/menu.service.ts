import { FastifyInstance } from "fastify";
import { CATEGORY_LABELS } from "@pollon/utils";
import type { CategoryType, MenuByCategory } from "@pollon/types";

export class MenuService {
  constructor(private app: FastifyInstance) {}

  async getAll(): Promise<MenuByCategory[]> {
    const cached = await this.app.redis.get("menu:all");
    if (cached) return JSON.parse(cached);

    const products = await this.app.prisma.product.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      include: { modifiers: { orderBy: { sortOrder: "asc" } } },
    });

    const grouped = new Map<CategoryType, MenuByCategory>();
    for (const p of products) {
      const cat = p.category as CategoryType;
      if (!grouped.has(cat)) {
        grouped.set(cat, {
          category: cat,
          label: CATEGORY_LABELS[cat],
          products: [],
        });
      }
      grouped.get(cat)!.products.push({
        id: p.id,
        name: p.name,
        description: p.description,
        category: cat,
        price: p.price,
        imageUrl: p.imageUrl,
        soldOut: p.soldOut,
        variants: p.variants as any,
        tags: (p as any).tags ?? [],
        ...((p as any).emoji ? { emoji: (p as any).emoji } : {}),
        ...((p as any).modifiers
          ? {
              modifiers: ((p as any).modifiers as any[]).map((m) => ({
                id: m.id,
                name: m.name,
                required: m.required,
                minSelect: m.minSelect,
                maxSelect: m.maxSelect,
                totalQuota: m.totalQuota ?? null,
                options: m.options,
              })),
            }
          : {}),
      } as any);
    }

    const result = Array.from(grouped.values());
    await this.app.redis.set("menu:all", JSON.stringify(result), { EX: 300 });
    return result;
  }

  async getByCategory(category: string) {
    return this.app.prisma.product.findMany({
      where: { active: true, category: category as any },
      orderBy: { sortOrder: "asc" },
    });
  }

  async invalidateCache() {
    await this.app.redis.del("menu:all");
  }
}
