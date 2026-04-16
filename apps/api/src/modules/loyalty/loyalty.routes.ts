import { FastifyInstance } from "fastify";
import { LoyaltyService } from "./loyalty.service";
import { authenticate } from "../../middlewares/authenticate";

export async function loyaltyRoutes(app: FastifyInstance) {
  const service = new LoyaltyService(app);

  app.get("/me", { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { id: string };
    return service.getInfo(user.id);
  });

  app.get("/me/history", { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { id: string };
    return service.getHistory(user.id);
  });

  // Apple Wallet pass generation (stub)
  app.post("/pass/apple", { preHandler: [authenticate] }, async (request, reply) => {
    // TODO: Implement PassKit .pkpass generation
    return reply.status(501).send({ message: "Apple Wallet pass - implementación pendiente" });
  });

  // Google Wallet pass generation (stub)
  app.post("/pass/google", { preHandler: [authenticate] }, async (request, reply) => {
    // TODO: Implement Google Wallet JWT
    return reply.status(501).send({ message: "Google Wallet pass - implementación pendiente" });
  });

  // Apple push updates endpoint
  app.get<{ Params: { serial: string } }>("/pass/:serial/push", async (request, reply) => {
    // TODO: Implement Apple push updates
    return reply.status(200).send({});
  });
}
