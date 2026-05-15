import { FastifyInstance } from "fastify";
import { MenuService } from "./menu.service";
import { PromotionsService } from "./promotions.service";
import { RecommendationsService } from "./recommendations.service";
import { categoryEnum } from "./menu.schema";
import { verifyCustomerToken } from "../auth/jwt.service";

export async function menuRoutes(app: FastifyInstance) {
  const service = new MenuService(app);
  const promotions = new PromotionsService(app);
  const recommendations = new RecommendationsService(app);

  app.get("/", async () => service.getAll());

  app.get("/promotions/today", async () => promotions.getToday());

  /**
   * Recomendaciones. Auth opcional:
   *  - Sin token → sólo "global" (lo más pedido del negocio)
   *  - Con token de cliente → "personal" + "global"
   */
  app.get("/recommendations", async (request) => {
    let customerId: string | null = null;
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const payload = verifyCustomerToken(authHeader.slice(7));
        customerId = (payload.sub as string) ?? null;
      } catch {
        // token inválido — degradar a anónimo, no romper.
      }
    }
    return recommendations.getForCustomer(customerId);
  });

  // Redeem a private promotion by code. Returns the promo + items if valid.
  app.post<{ Body: { code?: string } }>(
    "/promotions/redeem",
    async (request, reply) => {
      const code = request.body?.code;
      if (!code) {
        return reply.status(400).send({ error: "Código requerido" });
      }
      const promo = await promotions.findByCode(code);
      if (!promo) {
        return reply
          .status(404)
          .send({ error: "Código inválido, expirado o agotado" });
      }
      return {
        id: promo.id,
        name: promo.name,
        description: promo.description,
        price: promo.price,
        items: promo.items.map((i) => ({
          productId: i.productId,
          productName: i.product.name,
          emoji: i.product.emoji,
          qty: i.qty,
          variant: i.variant,
        })),
      };
    }
  );

  app.get<{ Params: { category: string } }>("/:category", async (request, reply) => {
    const parsed = categoryEnum.safeParse(request.params.category.toUpperCase());
    if (!parsed.success) {
      return reply.status(400).send({ error: "Categoría inválida" });
    }
    return service.getByCategory(parsed.data);
  });
}
