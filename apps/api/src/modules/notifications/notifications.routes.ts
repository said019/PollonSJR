import { FastifyInstance } from "fastify";
import { adminOnly } from "../../middlewares/admin-only";
import { buildWALink } from "./whatsapp.service";

export async function notificationsRoutes(app: FastifyInstance) {
  // Admin: send a custom WhatsApp message to a customer
  app.post("/send", { preHandler: [adminOnly] }, async (request, reply) => {
    const { phone, message } = request.body as { phone: string; message: string };
    if (!phone || !message) {
      return reply.status(400).send({ error: "phone y message requeridos" });
    }
    const waUrl = buildWALink(phone, message);
    return { waUrl };
  });
}
