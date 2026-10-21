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
    transferClabe: string | null;
    transferBank: string | null;
    transferAccountHolder: string | null;
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
  app: FastifyInstance,
  now: Date = new Date()
): Promise<{ accepting: boolean; reason?: string; closure?: "day" | "cutoff" | "hours" | "paused" }> {
  const config = await getStoreConfig(app);

  if (!config.isOpen) {
    return {
      accepting: false,
      closure: "day",
      reason: config.closedMessage ?? "El negocio está cerrado por hoy.",
    };
  }

  // All time checks use Mexico City local time so the schedule matches
  // what the admin configures in the dashboard, regardless of server TZ.
  const nowMx = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Mexico_City" })
  );
  const dayOfWeek = nowMx.getDay(); // 0=Sun, 6=Sat

  if (config.openDays.length > 0 && !config.openDays.includes(dayOfWeek)) {
    return {
      accepting: false,
      closure: "day",
      reason: "¡Hola! Hoy no tenemos servicio. Gracias por escribirnos 🍗",
    };
  }

  // Check time window
  const [openH, openM] = config.openTime.split(":").map(Number);
  const [closeH, closeM] = config.closeTime.split(":").map(Number);
  const currentMinutes = nowMx.getHours() * 60 + nowMx.getMinutes();
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
      closure: "hours",
      reason: `Por hoy ya cerramos. Nuestro horario termina a las ${config.closeTime} hrs.`,
    };
  }

  // Server-only order cutoff, distinct from the published closing time.
  // Never return the private value or put it into public store configuration.
  const cutoff = process.env.ORDER_CUTOFF_TIME?.trim();
  if (cutoff) {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(cutoff)) {
      return { accepting: false, reason: "No estamos recibiendo pedidos en este momento. Puedes escribir ASESOR para pedir ayuda." };
    }
    const [hour, minute] = cutoff.split(":").map(Number);
    if (currentMinutes >= hour * 60 + minute) {
      return { accepting: false, closure: "cutoff", reason: "Por hoy ya no estamos recibiendo pedidos. ¡Gracias por escribirnos!" };
    }
  }

  if (!config.acceptOrders) {
    return {
      accepting: false,
      closure: "paused",
      reason: "La toma de pedidos está en pausa temporal. Mientras tanto, puedes consultar el menú o escribir ASESOR para que te atienda el equipo.",
    };
  }

  return { accepting: true };
}
