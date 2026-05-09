import { FastifyInstance } from "fastify";
import { z } from "zod";
import { CustomersService } from "./customers.service";
import { authenticate } from "../../middlewares/authenticate";

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  address: z.string().min(1).max(300).optional(),
});

const savedAddressSchema = z.object({
  alias: z.string().trim().min(1).max(30),
  address: z.string().trim().min(1).max(500),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  isDefault: z.boolean().optional(),
});

const updateSavedAddressSchema = savedAddressSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "Debes enviar al menos un campo." }
);

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
    const { page, limit } = request.query as { page?: string; limit?: string };
    const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
    return service.getOrders(user.id, Number(page) || 1, limitNum);
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
    const parsed = savedAddressSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }

    const { alias, address, lat, lng } = parsed.data;

    const count = await app.prisma.savedAddress.count({ where: { customerId: user.id } });
    if (count >= 3) {
      return reply.status(400).send({ error: "Solo puedes guardar hasta 3 direcciones." });
    }

    const duplicate = await app.prisma.savedAddress.findFirst({
      where: {
        customerId: user.id,
        alias: { equals: alias, mode: "insensitive" },
      },
    });
    if (duplicate) {
      return reply.status(409).send({ error: "Ya tienes una dirección con ese alias." });
    }

    const makeDefault = parsed.data.isDefault ?? count === 0;
    const saved = await app.prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.savedAddress.updateMany({
          where: { customerId: user.id },
          data: { isDefault: false },
        });
      }

      return tx.savedAddress.create({
        data: { customerId: user.id, alias, address, lat, lng, isDefault: makeDefault },
      });
    });
    return reply.status(201).send(saved);
  });

  app.patch<{ Params: { id: string } }>("/me/addresses/:id", { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user as { id: string };
    const parsed = updateSavedAddressSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }

    const existing = await app.prisma.savedAddress.findFirst({
      where: { id: request.params.id, customerId: user.id },
    });
    if (!existing) return reply.status(404).send({ error: "Dirección no encontrada." });

    if (parsed.data.alias) {
      const duplicate = await app.prisma.savedAddress.findFirst({
        where: {
          customerId: user.id,
          id: { not: request.params.id },
          alias: { equals: parsed.data.alias, mode: "insensitive" },
        },
      });
      if (duplicate) {
        return reply.status(409).send({ error: "Ya tienes una dirección con ese alias." });
      }
    }

    const updated = await app.prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault) {
        await tx.savedAddress.updateMany({
          where: { customerId: user.id },
          data: { isDefault: false },
        });
      }

      return tx.savedAddress.update({
        where: { id: request.params.id },
        data: parsed.data,
      });
    });

    return updated;
  });

  app.delete<{ Params: { id: string } }>("/me/addresses/:id", { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { id: string };

    await app.prisma.$transaction(async (tx) => {
      const existing = await tx.savedAddress.findFirst({
        where: { id: request.params.id, customerId: user.id },
      });
      if (!existing) return;

      await tx.savedAddress.delete({ where: { id: existing.id } });

      if (existing.isDefault) {
        const nextDefault = await tx.savedAddress.findFirst({
          where: { customerId: user.id },
          orderBy: { createdAt: "asc" },
        });
        if (nextDefault) {
          await tx.savedAddress.update({
            where: { id: nextDefault.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return { ok: true };
  });

  // ─── Favorites ─────────────────────────────────────────────

  app.get("/me/favorites", { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { id: string };
    const customer = await app.prisma.customer.findUnique({
      where: { id: user.id },
      select: { favoriteProductIds: true },
    });
    return { productIds: customer?.favoriteProductIds ?? [] };
  });

  app.post<{ Params: { productId: string } }>(
    "/me/favorites/:productId",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as { id: string };
      const { productId } = request.params;
      const product = await app.prisma.product.findUnique({
        where: { id: productId },
        select: { id: true },
      });
      if (!product) return reply.status(404).send({ error: "Producto no encontrado" });

      const customer = await app.prisma.customer.findUnique({
        where: { id: user.id },
        select: { favoriteProductIds: true },
      });
      const current = customer?.favoriteProductIds ?? [];
      if (current.includes(productId)) return { ok: true };

      const updated = await app.prisma.customer.update({
        where: { id: user.id },
        data: { favoriteProductIds: [...current, productId] },
        select: { favoriteProductIds: true },
      });
      return { productIds: updated.favoriteProductIds };
    }
  );

  app.delete<{ Params: { productId: string } }>(
    "/me/favorites/:productId",
    { preHandler: [authenticate] },
    async (request) => {
      const user = request.user as { id: string };
      const { productId } = request.params;

      const customer = await app.prisma.customer.findUnique({
        where: { id: user.id },
        select: { favoriteProductIds: true },
      });
      const current = customer?.favoriteProductIds ?? [];
      const next = current.filter((id) => id !== productId);

      const updated = await app.prisma.customer.update({
        where: { id: user.id },
        data: { favoriteProductIds: next },
        select: { favoriteProductIds: true },
      });
      return { productIds: updated.favoriteProductIds };
    }
  );
}
