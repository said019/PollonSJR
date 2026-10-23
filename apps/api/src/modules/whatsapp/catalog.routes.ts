import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { adminOnly } from "../../middlewares/admin-only";
import { catalogUrl, readOwnCatalog, sellerPhone } from "./catalog";

export async function whatsappCatalogRoutes(app: FastifyInstance) {
  app.get("/catalog/links", { preHandler: [adminOnly] }, async () => {
    const [links, products] = await Promise.all([
      app.prisma.whatsAppCatalogLink.findMany({ where: { sellerPhone: sellerPhone() } }),
      app.prisma.product.findMany({ select: { id: true, name: true, variants: true, active: true, soldOut: true }, orderBy: { name: "asc" } }),
    ]);
    return { links, products, catalogUrl: catalogUrl() };
  });
  app.get("/catalog/source", { preHandler: [adminOnly] }, async (_request, reply) => {
    try {
      return { products: await readOwnCatalog() };
    } catch { return reply.status(503).send({ error: "No se pudo consultar el catálogo. Revisa la conexión de WhatsApp; también puedes vincular un ID manualmente." }); }
  });
  app.put("/catalog/links", { preHandler: [adminOnly] }, async (request, reply) => {
    const parsed = z.object({ externalId: z.string().trim().min(1).max(100), productId: z.string().min(1), variant: z.string().max(100).nullable().optional() }).strict().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Vínculo inválido" });
    const { externalId, productId, variant } = parsed.data;
    const product = await app.prisma.product.findUnique({ where: { id: productId } });
    if (!product) return reply.status(404).send({ error: "Producto no encontrado" });
    const variants = (product.variants ?? []) as Array<{ label: string }>;
    if (variant && !variants.some(v => v.label === variant)) return reply.status(400).send({ error: "Presentación inválida" });
    return app.prisma.whatsAppCatalogLink.upsert({
      where: { sellerPhone_externalId: { sellerPhone: sellerPhone(), externalId } },
      create: { sellerPhone: sellerPhone(), externalId, productId, variant: variant || null },
      update: { productId, variant: variant || null },
    });
  });
  app.delete<{ Params: { externalId: string } }>("/catalog/links/:externalId", { preHandler: [adminOnly] }, async request => {
    await app.prisma.whatsAppCatalogLink.deleteMany({ where: { sellerPhone: sellerPhone(), externalId: request.params.externalId } });
    return { success: true };
  });
}
