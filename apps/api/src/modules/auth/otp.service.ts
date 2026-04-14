import { FastifyInstance } from "fastify";
import bcrypt from "bcrypt";
import crypto from "crypto";

const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
const OTP_MAX_ATTEMPTS = 3;
const RATE_LIMIT_WINDOW = 60 * 60; // 1 hour
const RATE_LIMIT_MAX = 3;

export class AuthError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Generate a new OTP for a phone number.
 * Includes Redis rate limiting and bcrypt hashing.
 */
export async function generateOTP(
  app: FastifyInstance,
  phone: string
): Promise<{ code: string; customerId: string }> {
  // 1. Rate limit — max 3 requests per phone per hour
  const rateLimitKey = `otp:rate:${phone}`;
  const requests = await app.redis.incr(rateLimitKey);
  if (requests === 1) {
    await app.redis.expire(rateLimitKey, RATE_LIMIT_WINDOW);
  }
  if (requests > RATE_LIMIT_MAX) {
    const ttl = await app.redis.ttl(rateLimitKey);
    const minutes = Math.ceil(ttl / 60);
    throw new AuthError(
      `Demasiados intentos. Espera ${minutes} minutos para solicitar otro código.`,
      "rate_limit"
    );
  }

  // 2. Find or create Customer
  const customer = await app.prisma.customer.upsert({
    where: { phone },
    update: {},
    create: { phone },
  });

  // 3. Invalidate previous OTPs
  await app.prisma.oTP.updateMany({
    where: { customerId: customer.id, used: false },
    data: { used: true },
  });

  // 4. Generate 6-digit cryptographically secure code
  const code = String(crypto.randomInt(100000, 999999));

  // 5. Hash the code (4 rounds — short-lived OTPs don't need more)
  const hash = await bcrypt.hash(code, 4);
  await app.prisma.oTP.create({
    data: {
      customerId: customer.id,
      code: hash,
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
    },
  });

  return { code, customerId: customer.id };
}

/**
 * Verify an OTP code entered by the customer.
 */
export async function verifyOTP(
  app: FastifyInstance,
  phone: string,
  inputCode: string
): Promise<{ customerId: string; isNewCustomer: boolean }> {
  const customer = await app.prisma.customer.findUnique({ where: { phone } });
  if (!customer) {
    throw new AuthError("Número no reconocido. Solicita un código primero.", "not_found");
  }

  // Find the most recent unused, non-expired OTP
  const otp = await app.prisma.oTP.findFirst({
    where: {
      customerId: customer.id,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) {
    throw new AuthError("El código expiró o ya fue usado. Solicita uno nuevo.", "expired");
  }

  // Check max attempts
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await app.prisma.oTP.update({ where: { id: otp.id }, data: { used: true } });
    throw new AuthError(
      "Código inválido demasiadas veces. Solicita un código nuevo.",
      "max_attempts"
    );
  }

  // Compare with bcrypt
  const isValid = await bcrypt.compare(inputCode, otp.code);

  if (!isValid) {
    await app.prisma.oTP.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });
    const remaining = OTP_MAX_ATTEMPTS - otp.attempts - 1;
    throw new AuthError(
      `Código incorrecto. ${remaining} intento${remaining !== 1 ? "s" : ""} restante${remaining !== 1 ? "s" : ""}.`,
      "invalid_code"
    );
  }

  // Mark as used
  await app.prisma.oTP.update({ where: { id: otp.id }, data: { used: true } });

  // Create loyalty card if first time
  const existingCard = await app.prisma.loyaltyCard.findUnique({
    where: { customerId: customer.id },
  });
  if (!existingCard) {
    await app.prisma.loyaltyCard.create({
      data: { customerId: customer.id },
    });
  }

  return { customerId: customer.id, isNewCustomer: !customer.name };
}
