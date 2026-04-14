import { FastifyInstance } from "fastify";
import rateLimit from "@fastify/rate-limit";

export async function registerRateLimit(app: FastifyInstance) {
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) => request.ip,
  });
}
