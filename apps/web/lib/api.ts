const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

type FetchOptions = RequestInit & { token?: string };

async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { token, ...init } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });

  if (!res.ok) {
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
