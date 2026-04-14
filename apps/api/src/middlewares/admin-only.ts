import { FastifyRequest, FastifyReply } from "fastify";
import { verifyAdminToken } from "../modules/auth/jwt.service";

interface AdminPayload {
  adminId: string;
  email: string;
  role: "admin";
}

declare module "fastify" {
  interface FastifyRequest {
    admin?: AdminPayload;
  }
}

/**
 * Admin-only middleware.
 * Verifies the JWT is signed with JWT_ADMIN_SECRET and has role "admin".
 */
export async function adminOnly(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Token de admin requerido" });
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAdminToken(token);
    request.admin = {
      adminId: payload.sub as string,
      email: payload.email as string,
      role: "admin",
    };
  } catch {
    return reply.status(401).send({ error: "Token de admin inválido" });
  }
}
