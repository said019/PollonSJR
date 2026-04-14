import { FastifyRequest, FastifyReply } from "fastify";
import { verifyCustomerToken, verifyAdminToken } from "../modules/auth/jwt.service";

/**
 * Unified auth middleware — accepts customer OR admin JWT.
 * Sets request.user as { id, role, email? }
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return reply.status(401).send({ error: "Token de autenticación requerido." });
  }

  const token = authHeader.slice(7);

  // Try as customer token
  try {
    const payload = verifyCustomerToken(token);
    (request as any).user = { id: payload.sub as string, role: "customer" };
    return;
  } catch {}

  // Try as admin token
  try {
    const payload = verifyAdminToken(token);
    (request as any).user = { id: payload.sub as string, role: "admin", email: payload.email };
    return;
  } catch {}

  return reply.status(401).send({ error: "Token inválido o expirado." });
}
