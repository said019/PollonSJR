"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { saveTokens } from "@/lib/auth";
import { Lock, Mail, Phone, User, Loader2, Eye, EyeOff } from "lucide-react";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type Mode = "login" | "register";

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  // Login fields
  const [identifier, setIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register fields
  const [name, setName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  const resetAll = () => {
    setIdentifier("");
    setLoginPassword("");
    setName("");
    setRegPhone("");
    setRegEmail("");
    setRegPassword("");
    setError(null);
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!identifier || !loginPassword) {
      setError("Ingresa email/teléfono y contraseña");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{
        accessToken: string;
        refreshToken: string;
        customer: { id: string; name: string | null };
      }>("/api/auth/login", { identifier, password: loginPassword });
      saveTokens(res.accessToken, res.refreshToken);
      onSuccess?.();
      onClose();
      resetAll();
    } catch (err: any) {
      setError(err.message || "Credenciales incorrectas");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!name || name.length < 2) {
      setError("Ingresa tu nombre");
      return;
    }
    if (regPhone.length !== 10) {
      setError("El teléfono debe tener 10 dígitos");
      return;
    }
    if (regPassword.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{
        accessToken: string;
        refreshToken: string;
        customer: { id: string };
      }>("/api/auth/register", {
        name,
        phone: regPhone,
        email: regEmail || undefined,
        password: regPassword,
      });
      saveTokens(res.accessToken, res.refreshToken);
      onSuccess?.();
      onClose();
      resetAll();
    } catch (err: any) {
      setError(err.message || "Error al registrarte");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-surface-container rounded-2xl p-6 w-full max-w-sm mx-4 border border-outline-variant/20 shadow-2xl">
        {/* Header with tabs */}
        <div className="text-center mb-5">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock size={22} className="text-primary" />
          </div>
          <h2 className="text-xl font-headline font-bold text-on-surface">
            {mode === "login" ? "Bienvenido de vuelta" : "Crea tu cuenta"}
          </h2>
        </div>

        {/* Tabs */}
        <div className="flex bg-surface-container-high rounded-xl p-1 mb-5">
          <button
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg text-sm font-headline font-bold transition-all ${
              mode === "login"
                ? "bg-primary text-on-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Iniciar sesión
          </button>
          <button
            onClick={() => {
              setMode("register");
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg text-sm font-headline font-bold transition-all ${
              mode === "register"
                ? "bg-primary text-on-primary shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Registrarme
          </button>
        </div>

        {/* ─── LOGIN ─── */}
        {mode === "login" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                Email o teléfono
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 pointer-events-none"
                />
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="tu@email.com o 4421234567"
                  className="w-full pl-10 pr-4 py-3 bg-surface-container-high border border-outline-variant text-on-surface rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-primary placeholder:text-on-surface-variant/40"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                Contraseña
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 pointer-events-none"
                />
                <input
                  type={showPw ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 bg-surface-container-high border border-outline-variant text-on-surface rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-primary placeholder:text-on-surface-variant/40"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-on-surface"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-error text-sm text-center py-1">{error}</p>
            )}

            <button
              onClick={handleLogin}
              disabled={loading || !identifier || !loginPassword}
              className="w-full bg-primary text-on-primary py-3 rounded-xl font-headline font-bold disabled:opacity-50 hover:brightness-110 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : "Entrar"}
            </button>

            <p className="text-center text-xs text-on-surface-variant/60 mt-3">
              ¿No tienes cuenta?{" "}
              <button
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
                className="text-primary font-semibold hover:underline"
              >
                Regístrate aquí
              </button>
            </p>
          </div>
        )}

        {/* ─── REGISTER ─── */}
        {mode === "register" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                Nombre completo
              </label>
              <div className="relative">
                <User
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 pointer-events-none"
                />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Juan Pérez"
                  maxLength={60}
                  className="w-full pl-10 pr-4 py-3 bg-surface-container-high border border-outline-variant text-on-surface rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-primary placeholder:text-on-surface-variant/40"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                Teléfono (10 dígitos)
              </label>
              <div className="relative">
                <Phone
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 pointer-events-none"
                />
                <input
                  type="tel"
                  inputMode="numeric"
                  value={regPhone}
                  onChange={(e) =>
                    setRegPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  placeholder="4421234567"
                  className="w-full pl-10 pr-4 py-3 bg-surface-container-high border border-outline-variant text-on-surface rounded-xl text-sm tracking-wider focus:ring-2 focus:ring-primary focus:border-primary placeholder:text-on-surface-variant/40"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                Email <span className="text-on-surface-variant/40 normal-case">(opcional)</span>
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 pointer-events-none"
                />
                <input
                  type="email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="tu@email.com"
                  className="w-full pl-10 pr-4 py-3 bg-surface-container-high border border-outline-variant text-on-surface rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-primary placeholder:text-on-surface-variant/40"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                Contraseña (mín. 6 caracteres)
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 pointer-events-none"
                />
                <input
                  type={showPw ? "text" : "password"}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 bg-surface-container-high border border-outline-variant text-on-surface rounded-xl text-sm focus:ring-2 focus:ring-primary focus:border-primary placeholder:text-on-surface-variant/40"
                  onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 hover:text-on-surface"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-error text-sm text-center py-1">{error}</p>
            )}

            <button
              onClick={handleRegister}
              disabled={loading || !name || regPhone.length !== 10 || regPassword.length < 6}
              className="w-full bg-primary text-on-primary py-3 rounded-xl font-headline font-bold disabled:opacity-50 hover:brightness-110 transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-2"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : "Crear cuenta"}
            </button>

            <p className="text-center text-xs text-on-surface-variant/60 mt-2">
              ¿Ya tienes cuenta?{" "}
              <button
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className="text-primary font-semibold hover:underline"
              >
                Inicia sesión
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
