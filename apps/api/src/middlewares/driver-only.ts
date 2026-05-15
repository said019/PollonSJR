import { FastifyRequest, FastifyReply } from "fastify";
import { verifyDriverToken } from "../modules/auth/jwt.service";

interface DriverPayload {
  driverId: string;
  email: string;
  role: "driver";
}

declare module "fastify" {
  interface FastifyRequest {
    driver?: DriverPayload;
  }
}

export async function driverOnly(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Token de repartidor requerido" });
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyDriverToken(token);
    request.driver = {
      driverId: payload.sub as string,
      email: payload.email as string,
      role: "driver",
    };
  } catch {
    return reply.status(401).send({ error: "Token de repartidor inválido" });
  }
}
