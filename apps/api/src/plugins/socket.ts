import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
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

    try {
      if (role === "admin") {
        const secret = process.env.JWT_ADMIN_SECRET || "admin-dev-secret";
        const payload = jwt.verify(token, secret) as { adminId: string; role: string };
        if (payload.role !== "admin") return next(new Error("Token de admin inválido"));
        (socket.data as SocketData).role = "admin";
        (socket.data as SocketData).adminId = payload.adminId;
        return next();
      }

      if (role === "customer") {
        const secret = process.env.JWT_SECRET || "dev-secret-change-me";
        const payload = jwt.verify(token, secret) as { sub?: string; id?: string };
        const customerId = payload.sub || payload.id;
        if (!customerId) return next(new Error("Token de cliente inválido"));
        (socket.data as SocketData).role = "customer";
        (socket.data as SocketData).customerId = customerId;
        return next();
      }

      if (role === "driver") {
        const secret = process.env.JWT_DRIVER_SECRET || "driver-dev-secret";
        const payload = jwt.verify(token, secret) as { sub?: string; role?: string };
        if (payload.role !== "driver" || !payload.sub) {
          return next(new Error("Token de repartidor inválido"));
        }
        (socket.data as SocketData).role = "driver";
        (socket.data as SocketData).driverId = payload.sub;
        return next();
      }

      // Unknown role — allow as anonymous
      (socket.data as SocketData).role = "anonymous";
      next();
    } catch {
      // Invalid token — allow as anonymous (can still receive public events)
      (socket.data as SocketData).role = "anonymous";
      next();
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
