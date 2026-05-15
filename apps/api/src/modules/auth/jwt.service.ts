import jwt from "jsonwebtoken";

/**
 * Fail-fast: si en producción falta alguno de los JWT secrets, antes
 * caíamos a un valor hardcodeado conocido ("dev-secret-change-me", etc).
 * Eso permite a cualquiera FORJAR tokens válidos de admin/cliente/driver.
 * Mejor reventar al boot que correr inseguro en silencio.
 */
function requireSecret(name: string, fallbackDev: string): string {
  const v = process.env[name];
  if (v && v.length >= 16) return v;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `FATAL: ${name} no está configurado (o es muy corto) en producción. ` +
        `Setéalo con: openssl rand -hex 32`
    );
  }
  // En dev, permitir el fallback pero avisar fuerte.
  // eslint-disable-next-line no-console
  console.warn(
    `⚠️  ${name} usando secreto de desarrollo inseguro. NO usar en prod.`
  );
  return fallbackDev;
}

const CUSTOMER_SECRET = requireSecret("JWT_SECRET", "dev-secret-change-me");
const ADMIN_SECRET = requireSecret("JWT_ADMIN_SECRET", "admin-dev-secret");
const DRIVER_SECRET = requireSecret("JWT_DRIVER_SECRET", "driver-dev-secret");

// TTLs más cortos. Antes 30d para todo — si robaban un token tenían un
// mes de acceso. Customer 7d (UX: re-login semanal aceptable con refresh),
// admin/driver 2d (cuentas privilegiadas, rotación más agresiva).
const CUSTOMER_TTL = "7d";
const ADMIN_TTL = "2d";
const DRIVER_TTL = "2d";
const REFRESH_TTL = "30d";

// ── Customer tokens ─────────────────────────────────────────

export function signCustomerToken(customerId: string): string {
  return jwt.sign(
    { sub: customerId, role: "customer" },
    CUSTOMER_SECRET,
    { expiresIn: CUSTOMER_TTL }
  );
}

export function verifyCustomerToken(token: string): jwt.JwtPayload {
  const payload = jwt.verify(token, CUSTOMER_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
  if (payload.role !== "customer") throw new Error("Token no es de cliente");
  return payload;
}

// ── Admin tokens ────────────────────────────────────────────

export function signAdminToken(adminId: string, email: string): string {
  return jwt.sign(
    { sub: adminId, role: "admin", adminId, email },
    ADMIN_SECRET,
    { expiresIn: ADMIN_TTL }
  );
}

export function verifyAdminToken(token: string): jwt.JwtPayload {
  const payload = jwt.verify(token, ADMIN_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
  if (payload.role !== "admin") throw new Error("Token no es de admin");
  return payload;
}

// ── Driver tokens ───────────────────────────────────────────

export function signDriverToken(driverId: string, email: string): string {
  return jwt.sign(
    { sub: driverId, role: "driver", driverId, email },
    DRIVER_SECRET,
    { expiresIn: DRIVER_TTL }
  );
}

export function verifyDriverToken(token: string): jwt.JwtPayload {
  const payload = jwt.verify(token, DRIVER_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
  if (payload.role !== "driver") throw new Error("Token no es de repartidor");
  return payload;
}

// ── Refresh tokens (customer only) ──────────────────────────

export function signRefreshToken(customerId: string): string {
  return jwt.sign(
    { sub: customerId, type: "refresh" },
    CUSTOMER_SECRET + ":refresh",
    { expiresIn: REFRESH_TTL }
  );
}

export function verifyRefreshToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, CUSTOMER_SECRET + ":refresh", { algorithms: ["HS256"] }) as jwt.JwtPayload;
}
