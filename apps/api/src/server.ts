import Fastify from "fastify";
import { createServer } from "http";
import { registerPrisma } from "./plugins/prisma";
import { registerRedis } from "./plugins/redis";
import { registerSocket } from "./plugins/socket";
import { registerAuth } from "./plugins/auth";
import { registerCors } from "./plugins/cors";
import { registerRateLimit } from "./plugins/rate-limit";
import { menuRoutes } from "./modules/menu/menu.routes";
import { ordersRoutes } from "./modules/orders/orders.routes";
import { paymentsRoutes } from "./modules/payments/payments.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { customersRoutes } from "./modules/customers/customers.routes";
import { loyaltyRoutes } from "./modules/loyalty/loyalty.routes";
import { notificationsRoutes } from "./modules/notifications/notifications.routes";
import { adminRoutes } from "./modules/admin/admin.routes";
import { reportsRoutes } from "./modules/admin/reports.routes";
import { deliveryRoutes, adminDeliveryRoutes } from "./modules/delivery/delivery.routes";
import { registerOrderSockets } from "./sockets/orders.socket";
import { registerLoyaltySockets } from "./sockets/loyalty.socket";
import { startScheduler } from "./jobs/scheduler";
import { getStoreConfig, isAcceptingOrders } from "./modules/admin/store-config.service";
import { startNotificationWorker } from "./modules/notifications/queue";
import { sendWhatsApp } from "./modules/notifications/whatsapp.service";
import { evolutionRoutes, evolutionWebhookRoutes } from "./modules/notifications/evolution.routes";

const PORT = Number(process.env.PORT) || 3001;

async function bootstrap() {
  const httpServer = createServer();

  const app = Fastify({
    logger: true,
    serverFactory: (handler) => {
      httpServer.on("request", handler);
      return httpServer;
    },
  });

  // Plugins
  await registerCors(app);
  await registerRateLimit(app);
  await registerPrisma(app);
  await registerRedis(app);
  await registerAuth(app);

  const io = await registerSocket(httpServer, app);

  // Sockets
  registerOrderSockets(io);
  registerLoyaltySockets(io);

  // Routes
  app.register(menuRoutes, { prefix: "/api/menu" });

  // Public: today's promotions
  app.get("/api/promotions/today", async () => {
    const { PromotionsService } = await import("./modules/menu/promotions.service");
    return new PromotionsService(app).getToday();
  });
  app.register(ordersRoutes, { prefix: "/api/orders" });
  app.register(paymentsRoutes, { prefix: "/api/payments" });
  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(customersRoutes, { prefix: "/api/customers" });
  app.register(loyaltyRoutes, { prefix: "/api/loyalty" });
  app.register(notificationsRoutes, { prefix: "/api/notifications" });
  app.register(adminRoutes, { prefix: "/api/admin" });
  app.register(reportsRoutes, { prefix: "/api/admin" });
  app.register(evolutionRoutes, { prefix: "/api/evolution" });
  app.register(evolutionWebhookRoutes, { prefix: "/api/webhook/evolution" });
  app.register(deliveryRoutes, { prefix: "/api/delivery" });
  app.register(adminDeliveryRoutes, { prefix: "/api/admin/delivery" });

  // Store status (public) — with schedule validation
  app.get("/api/store/status", async () => {
    const config = await getStoreConfig(app);
    const { accepting, reason } = await isAcceptingOrders(app);

    return {
      isOpen: config.isOpen,
      deliveryActive: config.deliveryActive,
      acceptOrders: config.acceptOrders,
      accepting,
      reason,
      openDays: config.openDays,
      openTime: config.openTime,
      closeTime: config.closeTime,
      closedMessage: config.closedMessage,
    };
  });

  // Root — API info
  app.get("/", async () => ({
    name: "Pollón SJR API",
    version: "1.0.0",
    status: "running",
  }));

  // Health check — validates DB + Redis
  app.get("/health", async (_, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
    } catch {
      return reply.status(503).send({ ok: false, db: "error" });
    }
    try {
      await app.redis.ping();
    } catch {
      return reply.status(503).send({ ok: false, redis: "error" });
    }
    return { ok: true, env: process.env.NODE_ENV, ts: new Date().toISOString() };
  });

  await app.ready();

  // Cron jobs
  startScheduler(app);

  // Notification worker (uses a dedicated Redis connection to avoid blocking)
  const workerRedis = app.redis.duplicate();
  workerRedis.connect().then(() => {
    startNotificationWorker(workerRedis as any, sendWhatsApp);
  }).catch((err) => app.log.error("Notification worker Redis error:", err));

  httpServer.listen(PORT, "0.0.0.0", () => {
    app.log.info(`Pollón API listening on port ${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Error starting server:", err);
  process.exit(1);
});
