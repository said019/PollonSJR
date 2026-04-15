import { FastifyInstance } from "fastify";
import { z } from "zod";
import { compare, hash } from "bcrypt";
import { generateOTP, verifyOTP, AuthError } from "./otp.service";
import {
  signCustomerToken,
  signRefreshToken,
  signAdminToken,
  verifyRefreshToken,
} from "./jwt.service";
import { authenticate } from "../../middlewares/authenticate";
import { adminOnly } from "../../middlewares/admin-only";
import { buildWALink } from "../notifications/whatsapp.service";

const requestOtpSchema = z.object({ phone: z.string().regex(/^[0-9]{10}$/) });
const verifyOtpSchema = z.object({ phone: z.string(), code: z.string().length(6) });
const adminLoginSchema = z.object({ email: z.string().email(), password: z.string().min(6) });

// Password-based customer auth
const registerSchema = z.object({
  name: z.string().min(2).max(60),
  phone: z.string().regex(/^[0-9]{10}$/, "Teléfono debe tener 10 dígitos"),
  email: z.string().email("Email inválido").optional(),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

const loginSchema = z.object({
  identifier: z.string().min(1), // email or phone
  password: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  // ─── Client: Request OTP ─────────────────────────────────

  app.post("/request-otp", async (request, reply) => {
    const parsed = requestOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Ingresa tu número de WhatsApp sin código de país (10 dígitos).",
      });
    }

    try {
      const { code, customerId } = await generateOTP(app, parsed.data.phone);

      const message = `Tu código de Pollón SJR es: *${code}*\n\nVálido por 5 minutos. No lo compartas con nadie.`;
      const waLink = buildWALink(parsed.data.phone, message);

      app.log.info(`OTP for ${parsed.data.phone}: ${code}`);

      return {
        ok: true,
        message: "Código enviado por WhatsApp.",
        // Dev only — expose code for testing
        ...(process.env.NODE_ENV === "development" && { debugCode: code, waLink }),
      };
    } catch (e) {
      if (e instanceof AuthError) {
        return reply.status(429).send({ error: e.message, code: e.code });
      }
      throw e;
    }
  });

  // ─── Client: Verify OTP ──────────────────────────────────

  app.post("/verify-otp", async (request, reply) => {
    const parsed = verifyOtpSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Se requieren phone y code." });
    }

    try {
      const { customerId, isNewCustomer } = await verifyOTP(
        app,
        parsed.data.phone,
        parsed.data.code
      );

      const accessToken = signCustomerToken(customerId);
      const refreshToken = signRefreshToken(customerId);

      // Store refresh token in Redis (30d TTL)
      await app.redis.setEx(
        `refresh:customer:${customerId}`,
        30 * 24 * 60 * 60,
        refreshToken
      );

      return {
        ok: true,
        accessToken,
        refreshToken,
        isNewCustomer,
        customerId,
      };
    } catch (e) {
      if (e instanceof AuthError) {
        const status = e.code === "rate_limit" ? 429 : 400;
        return reply.status(status).send({ error: e.message, code: e.code });
      }
      throw e;
    }
  });

  // ─── Client: Refresh token ───────────────────────────────

  app.post("/refresh", async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };
    if (!refreshToken) {
      return reply.status(400).send({ error: "refreshToken requerido" });
    }

    try {
      const payload = verifyRefreshToken(refreshToken);
      const customerId = payload.sub as string;

      const stored = await app.redis.get(`refresh:customer:${customerId}`);
      if (!stored || stored !== refreshToken) {
        return reply.status(401).send({ error: "Refresh token inválido o expirado." });
      }

      const newAccessToken = signCustomerToken(customerId);
      return { accessToken: newAccessToken };
    } catch {
      return reply.status(401).send({ error: "Refresh token inválido." });
    }
  });

  // ─── Client: Logout ──────────────────────────────────────

  app.post("/logout", { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { id: string };
    await app.redis.del(`refresh:customer:${user.id}`);
    return { ok: true };
  });

  // ─── Client: Update name ─────────────────────────────────

  app.put("/me", { preHandler: [authenticate] }, async (request) => {
    const user = request.user as { id: string };
    const { name } = request.body as { name: string };

    const customer = await app.prisma.customer.update({
      where: { id: user.id },
      data: { name: name.trim() },
    });

    return { customer: { id: customer.id, phone: customer.phone, name: customer.name } };
  });

  // ─── Client: Register with password ──────────────────────

  app.post("/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues[0]?.message || "Datos inválidos",
      });
    }
    const { name, phone, email, password } = parsed.data;

    // Check if phone already exists with password
    const existing = await app.prisma.customer.findUnique({ where: { phone } });
    if (existing?.password) {
      return reply.status(409).send({
        error: "Ya existe una cuenta con este teléfono. Inicia sesión.",
      });
    }
    if (email) {
      const emailExists = await app.prisma.customer.findUnique({ where: { email } });
      if (emailExists) {
        return reply.status(409).send({ error: "Este email ya está registrado." });
      }
    }

    const passwordHash = await hash(password, 10);

    // Upsert: if customer existed via OTP without password, add password + name + email
    const customer = await app.prisma.customer.upsert({
      where: { phone },
      update: { name, email: email || null, password: passwordHash },
      create: { phone, name, email: email || null, password: passwordHash },
    });

    // Create loyalty card if first time
    const card = await app.prisma.loyaltyCard.findUnique({
      where: { customerId: customer.id },
    });
    if (!card) {
      await app.prisma.loyaltyCard.create({ data: { customerId: customer.id } });
    }

    const accessToken = signCustomerToken(customer.id);
    const refreshToken = signRefreshToken(customer.id);

    await app.redis.setEx(
      `refresh:customer:${customer.id}`,
      30 * 24 * 60 * 60,
      refreshToken
    );

    return {
      ok: true,
      accessToken,
      refreshToken,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
      },
    };
  });

  // ─── Client: Login with email or phone + password ────────

  app.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos" });
    }
    const { identifier, password } = parsed.data;

    // Try to find by email first, then by phone
    const isEmail = identifier.includes("@");
    const customer = await app.prisma.customer.findFirst({
      where: isEmail
        ? { email: identifier.toLowerCase().trim() }
        : { phone: identifier.replace(/\D/g, "") },
    });

    if (!customer || !customer.password) {
      return reply.status(401).send({ error: "Credenciales incorrectas." });
    }

    const valid = await compare(password, customer.password);
    if (!valid) {
      return reply.status(401).send({ error: "Credenciales incorrectas." });
    }

    const accessToken = signCustomerToken(customer.id);
    const refreshToken = signRefreshToken(customer.id);

    await app.redis.setEx(
      `refresh:customer:${customer.id}`,
      30 * 24 * 60 * 60,
      refreshToken
    );

    return {
      ok: true,
      accessToken,
      refreshToken,
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
      },
    };
  });

  // ─── Admin: Login ────────────────────────────────────────

  app.post("/admin/login", async (request, reply) => {
    const parsed = adminLoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Datos inválidos" });
    }

    const admin = await app.prisma.adminUser.findUnique({
      where: { email: parsed.data.email.toLowerCase().trim() },
    });

    if (!admin) {
      return reply.status(401).send({ error: "Credenciales inválidas." });
    }

    const valid = await compare(parsed.data.password, admin.password);
    if (!valid) {
      return reply.status(401).send({ error: "Credenciales inválidas." });
    }

    const token = signAdminToken(admin.id, admin.email);

    app.log.info(`Admin login: ${admin.email}`);

    return {
      ok: true,
      token,
      admin: { id: admin.id, name: admin.name, email: admin.email },
    };
  });

  // ─── Admin: Logout ───────────────────────────────────────

  app.post("/admin/logout", { preHandler: [adminOnly] }, async () => {
    return { ok: true };
  });

  // ─── Admin: Me ───────────────────────────────────────────

  app.get("/admin/me", { preHandler: [adminOnly] }, async (request) => {
    const admin = request.admin as { adminId: string };
    const data = await app.prisma.adminUser.findUnique({
      where: { id: admin.adminId },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    return { admin: data };
  });
}
