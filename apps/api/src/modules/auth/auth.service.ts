// Auth logic has been moved to:
// - otp.service.ts (OTP generation + verification with bcrypt + Redis rate limit)
// - jwt.service.ts (JWT sign/verify for customer, admin, refresh)
// - auth.routes.ts (request/verify OTP, admin login, refresh, logout)
//
// This file is kept empty for backwards compatibility.
