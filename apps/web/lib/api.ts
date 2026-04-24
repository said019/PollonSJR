import { refreshAccessToken, clearTokens } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

type FetchOptions = RequestInit & { token?: string; _retried?: boolean };

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { token, _retried, ...init } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (!res.ok) {
    // Admin 401 → clear token and redirect to login
    if (res.status === 401 && path.startsWith("/api/admin") && typeof window !== "undefined") {
      localStorage.removeItem("pollon:admin_token");
      window.location.href = "/admin/login";
      throw new Error("Sesión de admin expirada. Redirigiendo al login...");
    }

    // Customer 401 → attempt token refresh once
    if (res.status === 401 && !path.startsWith("/api/admin") && !_retried && typeof window !== "undefined") {
      const newToken = await refreshAccessToken();
      if (newToken) {
        return apiFetch<T>(path, { ...options, token: newToken, _retried: true });
      }
      clearTokens();
    }

    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string, token?: string) =>
    apiFetch<T>(path, { method: "GET", token }),

  post: <T>(path: string, body: unknown, token?: string) =>
    apiFetch<T>(path, { method: "POST", body: JSON.stringify(body), token }),

  put: <T>(path: string, body: unknown, token?: string) =>
    apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body), token }),

  patch: <T>(path: string, body: unknown, token?: string) =>
    apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body), token }),

  delete: <T>(path: string, token?: string) =>
    apiFetch<T>(path, { method: "DELETE", token }),
};
