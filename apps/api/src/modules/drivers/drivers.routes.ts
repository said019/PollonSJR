import { FastifyInstance } from "fastify";
import { z } from "zod";
import { DriversService } from "./drivers.service";
import { adminOnly } from "../../middlewares/admin-only";
import { driverOnly } from "../../middlewares/driver-only";

const createDriverSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(120),
  name: z.string().min(2).max(80),
  phone: z.string().max(30).optional(),
  vehicle: z.string().max(120).optional(),
  photoUrl: z.string().max(500).optional(),
});

const updateDriverSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).max(120).optional(),
  name: z.string().min(2).max(80).optional(),
  phone: z.string().max(30).nullable().optional(),
  vehicle: z.string().max(120).nullable().optional(),
  photoUrl: z.string().max(500).nullable().optional(),
  active: z.boolean().optional(),
});

const assignSchema = z.object({
  driverId: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().optional(),
  speed: z.number().optional(),
  heading: z.number().min(0).max(360).optional(),
  orderId: z.string().optional(),
});

const shiftSchema = z.object({
  onShift: z.boolean(),
});

const statusSchema = z.object({
  status: z.enum(["ON_THE_WAY", "DELIVERED"]),
});

/**
 * Rutas /api/admin/drivers — CRUD de repartidores y asignación a pedidos.
 * Mounted con prefix "/api/admin/drivers".
 */
export async function adminDriversRoutes(app: FastifyInstance) {
  const service = new DriversService(app);

  app.get("/", { preHandler: [adminOnly] }, async () => service.list());

  app.post("/", { preHandler: [adminOnly] }, async (request, reply) => {
    const parsed = createDriverSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos", details: parsed.error.flatten() });
    }
    try {
      return await service.create(parsed.data);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [adminOnly] },
    async (request, reply) => {
      const parsed = updateDriverSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Datos inválidos" });
      }
      try {
        await service.update(request.params.id, parsed.data);
        return { ok: true };
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: [adminOnly] },
    async (request, reply) => {
      try {
        return await service.remove(request.params.id);
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  // Snapshot live de repartidores en turno (admin mapa)
  app.get("/active", { preHandler: [adminOnly] }, async () =>
    service.getActiveDriversSnapshot()
  );
}

/**
 * Rutas /api/admin/orders/:orderId/driver — asignar/quitar a un pedido.
 * Mounted con prefix "/api/admin/orders".
 */
export async function adminOrderDriverRoutes(app: FastifyInstance) {
  const service = new DriversService(app);

  app.post<{ Params: { orderId: string } }>(
    "/:orderId/driver",
    { preHandler: [adminOnly] },
    async (request, reply) => {
      const parsed = assignSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "driverId requerido" });
      }
      try {
        return await service.assignToOrder(request.params.orderId, parsed.data.driverId);
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  app.delete<{ Params: { orderId: string } }>(
    "/:orderId/driver",
    { preHandler: [adminOnly] },
    async (request, reply) => {
      try {
        await service.unassignFromOrder(request.params.orderId);
        return { ok: true };
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );
}

/**
 * Rutas /api/drivers — login + endpoints del propio repartidor.
 * Mounted con prefix "/api/drivers".
 */
export async function driversRoutes(app: FastifyInstance) {
  const service = new DriversService(app);

  // Public: login
  app.post(
    "/login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Email y password requeridos" });
    }
    try {
      return await service.login(parsed.data.email, parsed.data.password);
    } catch (err: any) {
      return reply.status(401).send({ error: err.message });
    }
  });

  // Driver-auth
  app.get("/me", { preHandler: [driverOnly] }, async (request) =>
    service.me(request.driver!.driverId)
  );

  app.post("/shift", { preHandler: [driverOnly] }, async (request, reply) => {
    const parsed = shiftSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "onShift requerido" });
    await service.setShift(request.driver!.driverId, parsed.data.onShift);
    return { ok: true, onShift: parsed.data.onShift };
  });

  app.get("/orders", { preHandler: [driverOnly] }, async (request) =>
    service.listMyOrders(request.driver!.driverId)
  );

  app.get<{ Params: { orderId: string } }>(
    "/orders/:orderId",
    { preHandler: [driverOnly] },
    async (request, reply) => {
      try {
        return await service.getMyOrder(
          request.driver!.driverId,
          request.params.orderId
        );
      } catch (err: any) {
        return reply.status(404).send({ error: err.message });
      }
    }
  );

  app.post<{ Params: { orderId: string } }>(
    "/orders/:orderId/status",
    { preHandler: [driverOnly] },
    async (request, reply) => {
      const parsed = statusSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: "status inválido" });
      try {
        return await service.updateMyOrderStatus(
          request.driver!.driverId,
          request.params.orderId,
          parsed.data.status
        );
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    }
  );

  app.post("/location", { preHandler: [driverOnly] }, async (request, reply) => {
    const parsed = locationSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "lat/lng inválidos" });
    try {
      return await service.pushLocation(request.driver!.driverId, parsed.data);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
