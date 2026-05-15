"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { setDriverToken } from "@/lib/auth";
import type { DriverAuthResponse } from "@pollon/types";
import { Bike, Loader2, Lock } from "lucide-react";

export default function DriverLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<DriverAuthResponse>("/api/drivers/login", {
        email: email.trim().toLowerCase(),
        password,
      });
      setDriverToken(res.token);
      router.push("/driver");
    } catch (err: any) {
      setError(err.message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-3xl border border-outline-variant/15 bg-surface-container p-6 shadow-2xl"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Bike size={26} />
          </div>
          <h1 className="font-headline text-2xl font-extrabold uppercase tracking-tight text-tertiary">
            Pollón Repartidor
          </h1>
          <p className="mt-1 text-xs text-on-surface-variant">
            Ingresa con tu correo y contraseña.
          </p>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Correo
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-3 text-sm text-on-surface outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
              placeholder="juan@pollon.mx"
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-on-surface-variant">
              Contraseña
            </span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-high px-3 py-3 text-sm text-on-surface outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
              autoComplete="current-password"
            />
          </label>

          {error && (
            <p className="rounded-lg bg-error/10 px-3 py-2 text-xs font-semibold text-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 font-headline text-sm font-extrabold uppercase tracking-wider text-on-primary shadow-lg shadow-primary/25 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={14} />}
            Entrar
          </button>
        </div>

        <p className="mt-5 text-center text-[10px] text-on-surface-variant/60">
          ¿Sin cuenta? Pídele acceso al admin.
        </p>
      </form>
    </div>
  );
}
