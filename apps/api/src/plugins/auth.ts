import { FastifyInstance } from "fastify";
import fastifyJwt from "@fastify/jwt";

export async function registerAuth(app: FastifyInstance) {
  app.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || "dev-secret-change-me",
    sign: { expiresIn: "30d" },
  });
}
