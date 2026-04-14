import { FastifyInstance } from "fastify";
import { DeliveryService } from "./delivery.service";
import {
  calculateDeliverySchema,
  updateZonesSchema,
  updateStoreLocationSchema,
} from "./delivery.schema";
import { adminOnly } from "../../middlewares/admin-only";

// Public routes — registered at /api/delivery
export async function deliveryRoutes(app: FastifyInstance) {
  const service = new DeliveryService(app);

  // Public: calculate delivery fee by coordinates
  app.post("/calculate", async (request, reply) => {
    const parsed = calculateDeliverySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Coordenadas inválidas" });
    }
    return service.calculate(parsed.data.lat, parsed.data.lng);
  });
}

// Admin routes — registered at /api/admin/delivery
export async function adminDeliveryRoutes(app: FastifyInstance) {
  const service = new DeliveryService(app);

  // Admin: get all zones
  app.get("/zones", { preHandler: [adminOnly] }, async () => {
    return service.getAllZones();
  });

  // Admin: save all zones
  app.put("/zones", { preHandler: [adminOnly] }, async (request, reply) => {
    const parsed = updateZonesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    return service.saveZones(parsed.data);
  });

  // Admin: get store location
  app.get("/store", { preHandler: [adminOnly] }, async () => {
    return service.getStoreLocationPublic();
  });

  // Admin: update store location
  app.put("/store", { preHandler: [adminOnly] }, async (request, reply) => {
    const parsed = updateStoreLocationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos" });
    }
    return service.updateStoreLocation(parsed.data.lat, parsed.data.lng, parsed.data.address);
  });
}
