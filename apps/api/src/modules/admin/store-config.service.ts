import { FastifyInstance } from "fastify";
import { emitStoreStatus } from "../orders/orders.events";

const CONFIG_CACHE_KEY = "store:config";
const CONFIG_TTL = 30; // seconds

/**
 * Read store config with Redis cache (30s TTL).
 */
export async function getStoreConfig(app: FastifyInstance) {
  const cached = await app.redis.get(CONFIG_CACHE_KEY);
  if (cached) return JSON.parse(cached);

  let config = await app.prisma.storeConfig.findUnique({
    where: { id: "singleton" },
  });

  if (!config) {
    config = await app.prisma.storeConfig.create({
      data: { id: "singleton" },
    });
  }

  await app.redis.setEx(CONFIG_CACHE_KEY, CONFIG_TTL, JSON.stringify(config));
  return config;
}

/**
 * Update store config, invalidate cache, and emit socket event.
 */
export async function updateStoreConfig(
  app: FastifyInstance,
  updates: Partial<{
    isOpen: boolean;
    deliveryActive: boolean;
    acceptOrders: boolean;
    closedMessage: string | null;
    updatedBy: string;
  }>
) {
  const config = await app.prisma.storeConfig.update({
    where: { id: "singleton" },
    data: updates,
  });

  // Invalidate cache
  await app.redis.del(CONFIG_CACHE_KEY);

  // Emit to all connected clients
  emitStoreStatus(app, {
    isOpen: config.isOpen,
    deliveryActive: config.deliveryActive,
    acceptOrders: config.acceptOrders,
    message: config.closedMessage ?? undefined,
  });

  return config;
}

/**
 * Update store hours, invalidate cache, and emit.
 */
export async function updateStoreHours(
  app: FastifyInstance,
  data: { openDays: number[]; openTime: string; closeTime: string }
) {
  const config = await app.prisma.storeConfig.update({
    where: { id: "singleton" },
    data,
  });

  await app.redis.del(CONFIG_CACHE_KEY);

  emitStoreStatus(app, {
    isOpen: config.isOpen,
    deliveryActive: config.deliveryActive,
    acceptOrders: config.acceptOrders,
  });

  return config;
}

/**
 * Check if the store is currently accepting orders.
 * Validates: isOpen, acceptOrders, day of week, and time window.
 */
export async function isAcceptingOrders(
  app: FastifyInstance
): Promise<{ accepting: boolean; reason?: string }> {
  const config = await getStoreConfig(app);

  if (!config.isOpen) {
    return {
      accepting: false,
      reason: config.closedMessage ?? "El negocio está cerrado por hoy.",
    };
  }

  if (!config.acceptOrders) {
    return {
      accepting: false,
      reason: "No estamos aceptando pedidos en este momento.",
    };
  }

  // Check day of week
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat

  if (!config.openDays.includes(dayOfWeek)) {
    return {
      accepting: false,
      reason: "Hoy no tenemos servicio. Vuelve jueves a domingo.",
    };
  }

  // Check time window
  const [openH, openM] = config.openTime.split(":").map(Number);
  const [closeH, closeM] = config.closeTime.split(":").map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  if (currentMinutes < openMinutes) {
    return {
      accepting: false,
      reason: `Abrimos a las ${config.openTime} hrs.`,
    };
  }

  if (currentMinutes >= closeMinutes) {
    return {
      accepting: false,
      reason: `Cerramos a las ${config.closeTime} hrs. ¡Hasta mañana!`,
    };
  }

  return { accepting: true };
}
