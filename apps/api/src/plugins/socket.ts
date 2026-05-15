import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { FastifyInstance } from "fastify";
import {
  verifyAdminToken,
  verifyCustomerToken,
  verifyDriverToken,
} from "../modules/auth/jwt.service";
import type { ServerToClientEvents, ClientToServerEvents } from "@pollon/types";

declare module "fastify" {
  interface FastifyInstance {
    io: Server<ClientToServerEvents, ServerToClientEvents>;
  }
}

interface SocketData {
  role: "admin" | "customer" | "driver" | "anonymous";
  adminId?: string;
  customerId?: string;
  driverId?: string;
}

export async function registerSocket(
  httpServer: HttpServer,
  app: FastifyInstance
): Promise<Server<ClientToServerEvents, ServerToClientEvents>> {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:3000"],
      methods: ["GET", "POST"],
    },
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutos
    },
  });

  // Redis adapter for horizontal scaling
  const pubClient = app.redis.duplicate();
  const subClient = app.redis.duplicate();
  await pubClient.connect();
  await subClient.connect();
  io.adapter(createAdapter(pubClient, subClient));

  // ── JWT Authentication Middleware ────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    const role = socket.handshake.auth.role as string | undefined;

    if (!token) {
      // Allow anonymous connections (store:status, menu:updated)
      (socket.data as SocketData).role = "anonymous";
      return next();
    }

    // Usamos las funciones centralizadas de jwt.service (algoritmo HS256
    // fijo + fail-fast de secretos en prod). Antes este archivo leía los
    // secrets con fallback inseguro propio y, peor, si el token era inválido
    // degradaba SILENCIOSAMENTE a "anonymous" — un atacante con role spoofeado
    // igual entraba (limitado, pero es defense-in-depth flojo).
    try {
      if (role === "admin") {
        const payload = verifyAdminToken(token);
        (socket.data as SocketData).role = "admin";
        (socket.data as SocketData).adminId =
          (payload.adminId as string) || (payload.sub as string);
        return next();
      }

      if (role === "customer") {
        const payload = verifyCustomerToken(token);
        const customerId = (payload.sub as string) || (payload as any).id;
        if (!customerId) return next(new Error("Token de cliente inválido"));
        (socket.data as SocketData).role = "customer";
        (socket.data as SocketData).customerId = customerId;
        return next();
      }

      if (role === "driver") {
        const payload = verifyDriverToken(token);
        if (!payload.sub) return next(new Error("Token de repartidor inválido"));
        (socket.data as SocketData).role = "driver";
        (socket.data as SocketData).driverId = payload.sub as string;
        return next();
      }

      // role desconocido pero mandó token → tratamos como anónimo
      // (no es un intento de auth con rol privilegiado).
      (socket.data as SocketData).role = "anonymous";
      return next();
    } catch {
      // Mandó role + token pero el token NO verifica. Esto es un intento
      // fallido de autenticarse con un rol — RECHAZAR la conexión, no
      // degradar a anonymous.
      return next(new Error("Token inválido o expirado"));
    }
  });

  // ── Connection Handling ─────────────────────────────────
  io.on("connection", (socket) => {
    const data = socket.data as SocketData;
    app.log.info(`Socket connected: ${socket.id} (${data.role})`);

    // Auto-join rooms based on authenticated role
    if (data.role === "admin") {
      socket.join("admin:pollon-sjr");
      app.log.info(`Admin ${data.adminId} joined admin:pollon-sjr`);
    }

    if (data.role === "customer" && data.customerId) {
      socket.join(`customer:${data.customerId}`);
      app.log.info(`Customer ${data.customerId} joined their room`);
    }

    if (data.role === "driver" && data.driverId) {
      socket.join(`driver:${data.driverId}`);
      app.log.info(`Driver ${data.driverId} joined their room`);
    }

    // Legacy join handlers (for backwards compatibility during migration)
    socket.on("admin:join", () => {
      if (data.role === "admin") {
        socket.join("admin:pollon-sjr");
      }
    });

    socket.on("customer:join", ({ customerId }) => {
      if (data.role === "customer" && customerId === data.customerId) {
        socket.join(`customer:${customerId}`);
      }
    });

    socket.on("driver:join", () => {
      if (data.role === "driver" && data.driverId) {
        socket.join(`driver:${data.driverId}`);
      }
    });

    socket.on("disconnect", (reason) => {
      app.log.info(`Socket disconnected: ${socket.id} → ${reason}`);
    });
  });

  app.decorate("io", io);

  app.addHook("onClose", async () => {
    io.close();
    await pubClient.quit();
    await subClient.quit();
  });

  return io;
}
