import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import { LoyaltyService } from "./loyalty.service";
import { AppleWalletService } from "./apple-wallet.service";
import { GoogleWalletService } from "./google-wallet.service";
import { authenticate } from "../../middlewares/authenticate";
import crypto from "crypto";

const PASS_TOKEN_TTL = 5 * 60; // 5 minutes in seconds

// ─── Apple Web Service Protocol v1 ──────────────────────────
// Mounted at /v1 relative to the prefix loyaltyRoutes is registered with.
// server.ts registers loyaltyRoutes with prefix "/api/loyalty", so these
// end up at "/api/loyalty/v1/…".  To put them at the true root /v1,
// register appleWebServicePlugin separately in server.ts instead — but for
// now the Apple docs only care that the webServiceURL matches exactly, so
// we keep it self-contained and set webServiceURL accordingly in the pass.

const appleWebServicePlugin: FastifyPluginAsync = async (app) => {
  const appleAuth = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const authHeader = request.headers.authorization;
    const expectedToken = process.env.APPLE_AUTH_TOKEN;
    if (
      !expectedToken ||
      !authHeader ||
      authHeader !== `ApplePass ${expectedToken}`
    ) {
      reply.status(401).send({ error: "Unauthorized" });
    }
  };

  // Register a device / pass association
  app.post<{
    Params: { deviceId: string; passTypeId: string; serial: string };
    Body: { pushToken?: string };
  }>(
    "/devices/:deviceId/registrations/:passTypeId/:serial",
    { preHandler: [appleAuth] },
    async (request, reply) => {
      const { deviceId, passTypeId, serial } = request.params;
      const pushToken = request.body?.pushToken ?? "";

      await app.prisma.appleDevice.upsert({
        where: {
          deviceId_passTypeId_serialNumber: {
            deviceId,
            passTypeId,
            serialNumber: serial,
          },
        },
        update: { pushToken },
        create: { deviceId, pushToken, passTypeId, serialNumber: serial },
      });

      return reply.status(201).send();
    }
  );

  // List passes that need updating for a device
  app.get<{
    Params: { deviceId: string; passTypeId: string };
    Querystring: { passesUpdatedSince?: string };
  }>(
    "/devices/:deviceId/registrations/:passTypeId",
    { preHandler: [appleAuth] },
    async (request, reply) => {
      const { deviceId, passTypeId } = request.params;
      const { passesUpdatedSince } = request.query;

      const devices = await app.prisma.appleDevice.findMany({
        where: { deviceId, passTypeId },
      });

      const serials: string[] = devices.map(
        (d: { serialNumber: string }) => d.serialNumber
      );
      if (serials.length === 0) {
        return reply.status(204).send();
      }

      let updatedSerials: string[] = serials;

      if (passesUpdatedSince) {
        // Subtract 2 seconds to avoid race conditions
        const since = new Date(
          new Date(passesUpdatedSince).getTime() - 2000
        );

        const updates = await app.prisma.appleUpdate.findMany({
          where: {
            serialNumber: { in: serials },
            updatedAt: { gt: since },
          },
        });

        const updatedSet = new Set(
          updates.map((u: { serialNumber: string }) => u.serialNumber)
        );
        updatedSerials = serials.filter((s: string) => updatedSet.has(s));
      }

      if (updatedSerials.length === 0) {
        return reply.status(204).send();
      }

      return reply.send({
        serialNumbers: updatedSerials,
        lastUpdated: new Date().toISOString(),
      });
    }
  );

  // Download the latest version of a pass
  app.get<{ Params: { passTypeId: string; serial: string } }>(
    "/passes/:passTypeId/:serial",
    { preHandler: [appleAuth] },
    async (request, reply) => {
      const { serial } = request.params; // serial IS the customerId
      const walletService = new AppleWalletService(app);

      try {
        const buffer = await walletService.generatePassBuffer(serial);
        reply.header("Content-Type", "application/vnd.apple.pkpass");
        reply.header(
          "Content-Disposition",
          `attachment; filename="pollon.pkpass"`
        );
        return reply.send(buffer);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Error generating pass";
        return reply.status(500).send({ error: message });
      }
    }
  );

  // Unregister a device
  app.delete<{
    Params: { deviceId: string; passTypeId: string; serial: string };
  }>(
    "/devices/:deviceId/registrations/:passTypeId/:serial",
    { preHandler: [appleAuth] },
    async (request, reply) => {
      const { deviceId, passTypeId, serial } = request.params;

      await app.prisma.appleDevice.deleteMany({
        where: { deviceId, passTypeId, serialNumber: serial },
      });

      return reply.status(200).send();
    }
  );

  // Receive Apple diagnostic logs
  app.post("/log", async (request, reply) => {
    app.log.info({ body: request.body }, "Apple Wallet diagnostic log");
    return reply.status(200).send();
  });
};

// ─── Main loyalty routes (prefix: /api/loyalty) ─────────────

export async function loyaltyRoutes(app: FastifyInstance) {
  const service = new LoyaltyService(app);

  // Mount Apple Web Service Protocol routes at /v1
  // Because server.ts registers this plugin with prefix "/api/loyalty",
  // these resolve to /api/loyalty/v1/... — set APPLE_PASS_WEBSERVICE_URL
  // env var to match: e.g. https://api.pollon.mx/api/loyalty
  app.register(appleWebServicePlugin, { prefix: "/v1" });

  // ─── Customer loyalty info ─────────────────────────────────

  app.get("/me", { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { id: string };
    return service.getInfo(user.id);
  });

  app.get("/me/history", { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { id: string };
    return service.getHistory(user.id);
  });

  // ─── Apple Wallet pass ─────────────────────────────────────

  app.post(
    "/pass/apple",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as { id: string };

      // Guard: check certs are configured before issuing a download token
      if (
        !process.env.APPLE_CERT_BASE64 ||
        !process.env.APPLE_KEY_BASE64 ||
        !process.env.APPLE_WWDR_BASE64
      ) {
        return reply.status(503).send({
          error:
            "Apple Wallet not configured. Set APPLE_CERT_BASE64, APPLE_KEY_BASE64, APPLE_WWDR_BASE64",
        });
      }

      // Store a short-lived token in Redis (TTL 5 min) mapping to customerId
      const token = crypto.randomBytes(32).toString("hex");
      await app.redis.set(`apple_pass_token:${token}`, user.id, {
        EX: PASS_TOKEN_TTL,
      });

      const apiUrl = process.env.API_URL ?? "";
      return reply.send({
        url: `${apiUrl}/api/loyalty/pass/apple/download?token=${token}`,
      });
    }
  );

  // Public download endpoint — no bearer auth, validated via Redis token
  app.get<{ Querystring: { token?: string } }>(
    "/pass/apple/download",
    async (request, reply) => {
      const { token } = request.query;

      if (!token) {
        return reply.status(400).send({ error: "Missing token" });
      }

      const customerId = await app.redis.get(`apple_pass_token:${token}`);
      if (!customerId) {
        return reply.status(410).send({ error: "Token expired or invalid" });
      }

      // One-time use: consume the token immediately
      await app.redis.del(`apple_pass_token:${token}`);

      const walletService = new AppleWalletService(app);

      try {
        const buffer = await walletService.generatePassBuffer(customerId);
        reply.header("Content-Type", "application/vnd.apple.pkpass");
        reply.header(
          "Content-Disposition",
          `attachment; filename="pollon.pkpass"`
        );
        return reply.send(buffer);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Error generating pass";
        return reply.status(500).send({ error: message });
      }
    }
  );

  // ─── Google Wallet pass ────────────────────────────────────

  app.post(
    "/pass/google",
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user as { id: string };

      if (!process.env.GOOGLE_ISSUER_ID) {
        return reply.status(503).send({
          error:
            "Google Wallet not configured. Set GOOGLE_ISSUER_ID and GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY (or GOOGLE_SA_JSON)",
        });
      }

      const customer = await app.prisma.customer.findUnique({
        where: { id: user.id },
        include: { loyalty: true },
      });

      const name = customer?.name ?? "Cliente";
      const completedOrders = customer?.loyalty?.completedOrders ?? 0;
      const pendingReward = customer?.loyalty?.pendingReward ?? false;
      const stamps = pendingReward ? 5 : completedOrders % 5;

      const googleService = new GoogleWalletService(app);

      try {
        const url = googleService.buildSaveUrl(user.id, name, stamps);
        return reply.send({ url });
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Error generating Google Wallet pass";
        return reply.status(503).send({ error: message });
      }
    }
  );
}
