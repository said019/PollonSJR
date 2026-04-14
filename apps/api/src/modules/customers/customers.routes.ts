import { FastifyInstance } from "fastify";
import { z } from "zod";
import { CustomersService } from "./customers.service";
import { authenticate } from "../../middlewares/authenticate";

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  address: z.string().min(1).max(300).optional(),
});

export async function customersRoutes(app: FastifyInstance) {
  const service = new CustomersService(app);

  app.get("/me", { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { id: string };
    return service.getProfile(user.id);
  });

  app.put("/me", { preHandler: [authenticate] }, async (request, reply) => {
    const parsed = updateProfileSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Datos inválidos" });

    const user = request.user as { id: string };
    return service.updateProfile(user.id, parsed.data);
  });

  app.get("/me/orders", { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { id: string };
    const { page } = request.query as { page?: string };
    return service.getOrders(user.id, Number(page) || 1);
  });

  // ─── Saved Addresses ───────────────────────────────────────

  app.get("/me/addresses", { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { id: string };
    return app.prisma.savedAddress.findMany({
      where: { customerId: user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  });

  app.post("/me/addresses", { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { id: string };
    const { alias, address, lat, lng, isDefault } = request.body as {
      alias: string; address: string; lat: number; lng: number; isDefault?: boolean;
    };

    const count = await app.prisma.savedAddress.count({ where: { customerId: user.id } });
    if (count >= 3) {
      return reply.status(400).send({ error: "Solo puedes guardar hasta 3 direcciones." });
    }

    if (isDefault) {
      await app.prisma.savedAddress.updateMany({
        where: { customerId: user.id },
        data: { isDefault: false },
      });
    }

    const saved = await app.prisma.savedAddress.create({
      data: { customerId: user.id, alias, address, lat, lng, isDefault: isDefault ?? false },
    });
    return reply.status(201).send(saved);
  });

  app.delete<{ Params: { id: string } }>("/me/addresses/:id", { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { id: string };
    await app.prisma.savedAddress.deleteMany({
      where: { id: request.params.id, customerId: user.id },
    });
    return { ok: true };
  });
}
