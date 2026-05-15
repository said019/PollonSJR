const TOKEN_KEY = "pollon:token";
const REFRESH_KEY = "pollon:refresh";
const ADMIN_TOKEN_KEY = "pollon:admin_token";
const DRIVER_TOKEN_KEY = "pollon:driver_token";

// ─── Customer tokens ────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function saveTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/auth/refresh`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      }
    );

    if (!res.ok) {
      clearTokens();
      return null;
    }

    const { accessToken } = await res.json();
    localStorage.setItem(TOKEN_KEY, accessToken);
    return accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

// ─── Admin tokens ───────────────────────────────────────────

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function removeAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

// ─── Driver tokens ──────────────────────────────────────────

export function getDriverToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DRIVER_TOKEN_KEY);
}

export function setDriverToken(token: string) {
  localStorage.setItem(DRIVER_TOKEN_KEY, token);
}

export function removeDriverToken() {
  localStorage.removeItem(DRIVER_TOKEN_KEY);
}

// ─── Aliases for backwards compat ───────────────────────────

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1];
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}
