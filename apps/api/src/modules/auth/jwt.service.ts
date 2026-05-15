import jwt from "jsonwebtoken";

const CUSTOMER_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || "admin-dev-secret";
const DRIVER_SECRET = process.env.JWT_DRIVER_SECRET || "driver-dev-secret";

const CUSTOMER_TTL = "30d";
const ADMIN_TTL = "30d";
const DRIVER_TTL = "30d";
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
  const payload = jwt.verify(token, CUSTOMER_SECRET) as jwt.JwtPayload;
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
  const payload = jwt.verify(token, ADMIN_SECRET) as jwt.JwtPayload;
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
  const payload = jwt.verify(token, DRIVER_SECRET) as jwt.JwtPayload;
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
  return jwt.verify(token, CUSTOMER_SECRET + ":refresh") as jwt.JwtPayload;
}
