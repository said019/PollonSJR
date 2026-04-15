"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { setAdminToken } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import Image from "next/image";

export function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await api.post<{ token: string }>("/api/auth/admin/login", { email, password });
      setAdminToken(res.token);
      router.push("/admin");
    } catch (err: any) {
      setError(err.message || "Credenciales incorrectas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <form onSubmit={handleSubmit} className="bg-surface-container-high rounded-2xl p-8 w-full max-w-sm shadow-lg">
        <div className="text-center mb-6">
          <div className="w-20 h-20 rounded-2xl overflow-hidden mx-auto mb-4 border-2 border-primary/30 shadow-lg">
            <Image
              src="/pollon-logo.jpg"
              alt="Pollón SJR"
              width={80}
              height={80}
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-xl font-headline font-bold">Admin POLLÓN</h1>
          <p className="text-sm text-on-surface-variant">Ingresa tus credenciales</p>
        </div>

        <div className="space-y-3 mb-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full border border-outline-variant bg-surface-container text-on-surface rounded-xl p-3 text-sm placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary focus:border-primary"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            required
            className="w-full border border-outline-variant bg-surface-container text-on-surface rounded-xl p-3 text-sm placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary focus:border-primary"
          />
        </div>

        {error && <p className="text-error text-sm mb-3">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-on-primary py-3 rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : "Iniciar sesión"}
        </button>
      </form>
    </div>
  );
}
