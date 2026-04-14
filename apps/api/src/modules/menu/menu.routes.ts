import { FastifyInstance } from "fastify";
import { MenuService } from "./menu.service";
import { PromotionsService } from "./promotions.service";
import { categoryEnum } from "./menu.schema";

export async function menuRoutes(app: FastifyInstance) {
  const service = new MenuService(app);
  const promotions = new PromotionsService(app);

  app.get("/", async () => service.getAll());

  app.get("/promotions/today", async () => promotions.getToday());

  app.get<{ Params: { category: string } }>("/:category", async (request, reply) => {
    const parsed = categoryEnum.safeParse(request.params.category.toUpperCase());
    if (!parsed.success) {
      return reply.status(400).send({ error: "Categoría inválida" });
    }
    return service.getByCategory(parsed.data);
  });
}
