import { FastifyInstance } from "fastify";
import cors from "@fastify/cors";

export async function registerCors(app: FastifyInstance) {
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  });
}
