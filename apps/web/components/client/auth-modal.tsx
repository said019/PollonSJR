"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { saveTokens } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import {
  Lock,
  Mail,
  Phone,
  User,
  Loader2,
  Eye,
  EyeOff,
  Users,
  ShieldCheck,
  MessageCircle,
  ArrowLeft,
} from "lucide-react";
import Image from "next/image";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// "otp" es el modo por defecto: entrar con teléfono + código por WhatsApp, sin
// contraseña. El registro/login con contraseña sigue disponible para quien ya
// tiene cuenta con contraseña.
type Mode = "otp" | "login" | "register";
type OtpStep = "phone" | "code" | "name";

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>("otp");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  // Flujo sin contraseña (OTP por WhatsApp)
  const { requestOTP, verifyOTP, saveName } = useAuth();
  const [otpStep, setOtpStep] = useState<OtpStep>("phone");
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpName, setOtpName] = useState("");

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
    setOtpStep("phone");
    setOtpPhone("");
    setOtpCode("");
    setOtpName("");
    setError(null);
    setLoading(false);
  };

  /* ── Flujo sin contraseña: teléfono → código por WhatsApp → nombre ── */

  const handleRequestOtp = async () => {
    if (otpPhone.length !== 10) {
      setError("Escribe tu WhatsApp a 10 dígitos");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await requestOTP(otpPhone);
      setOtpStep("code");
    } catch (err: any) {
      setError(err.message || "No pudimos enviar el código. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) {
      setError("El código tiene 6 dígitos");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { isNewCustomer } = await verifyOTP(otpPhone, otpCode);
      if (isNewCustomer) {
        // Cliente nuevo: sólo falta su nombre (para el pedido y el saludo).
        setOtpStep("name");
      } else {
        onSuccess?.();
        onClose();
        resetAll();
      }
    } catch (err: any) {
      setError(err.message || "Código incorrecto o vencido");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOtpName = async () => {
    if (otpName.trim().length < 2) {
      setError("Escribe tu nombre");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await saveName(otpName.trim());
    } catch {
      // Si falla guardar el nombre no bloqueamos el pedido: ya tiene sesión.
    } finally {
      setLoading(false);
      onSuccess?.();
      onClose();
      resetAll();
    }
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
        {/* Header with logo */}
        <div className="text-center mb-5">
          <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-3 border-2 border-primary/30 shadow-lg">
            <Image
              src="/pollon-logo.jpg"
              alt="Pollón SJR"
              width={64}
              height={64}
              className="w-full h-full object-cover"
            />
          </div>
          <h2 className="text-xl font-headline font-bold text-on-surface">
            {mode === "otp"
              ? otpStep === "phone"
                ? "Entra con tu WhatsApp"
                : otpStep === "code"
                  ? "Escribe tu código"
                  : "¿Cómo te llamas?"
              : mode === "login"
                ? "Bienvenido de vuelta"
                : "Crea tu cuenta"}
          </h2>
          {mode === "otp" && (
            <p className="mt-1 px-2 text-xs text-on-surface-variant">
              {otpStep === "phone"
                ? "Sin contraseñas: te mandamos un código por WhatsApp."
                : otpStep === "code"
                  ? `Te lo enviamos por WhatsApp al ${otpPhone}`
                  : "Es lo último que necesitamos para tu pedido."}
            </p>
          )}

          {/* Social proof trust signal */}
          <div className="mt-2.5 flex items-center justify-center gap-1.5 rounded-xl bg-surface-container-high px-3 py-2">
            <Users size={11} className="text-primary flex-shrink-0" />
            <span className="text-[11px] text-on-surface-variant/70">
              +2,500 clientes activos en San Juan del Río
            </span>
            <ShieldCheck size={11} className="text-secondary flex-shrink-0" />
          </div>
        </div>

        {/* Tabs — sólo en el modo con contraseña */}
        {mode !== "otp" && (
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
        )}

        {/* ─── SIN CONTRASEÑA — código por WhatsApp ─── */}
        {mode === "otp" && (
          <div className="space-y-3">
            {/* Paso 1: teléfono */}
            {otpStep === "phone" && (
              <>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                    Tu WhatsApp (10 dígitos)
                  </label>
                  <div className="relative">
                    <Phone
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 pointer-events-none"
                    />
                    <input
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      value={otpPhone}
                      onChange={(e) =>
                        setOtpPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                      }
                      placeholder="4421234567"
                      className="w-full pl-10 pr-4 py-3 bg-surface-container-high border border-outline-variant text-on-surface rounded-xl text-base tracking-wider focus:ring-2 focus:ring-primary focus:border-primary placeholder:text-on-surface-variant/40"
                      onKeyDown={(e) => e.key === "Enter" && handleRequestOtp()}
                      autoFocus
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-error text-sm text-center py-1">{error}</p>
                )}

                <button
                  onClick={handleRequestOtp}
                  disabled={loading || otpPhone.length !== 10}
                  className="w-full bg-primary text-on-primary py-3.5 rounded-xl font-headline font-bold disabled:opacity-50 hover:brightness-110 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <>
                      <MessageCircle size={16} />
                      Enviarme el código
                    </>
                  )}
                </button>
              </>
            )}

            {/* Paso 2: código */}
            {otpStep === "code" && (
              <>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                    Código de 6 dígitos
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="••••••"
                    className="w-full px-4 py-3 bg-surface-container-high border border-outline-variant text-on-surface rounded-xl text-center text-2xl font-headline font-bold tracking-[0.4em] focus:ring-2 focus:ring-primary focus:border-primary placeholder:text-on-surface-variant/30"
                    onKeyDown={(e) => e.key === "Enter" && handleVerifyOtp()}
                    autoFocus
                  />
                </div>

                {error && (
                  <p className="text-error text-sm text-center py-1">{error}</p>
                )}

                <button
                  onClick={handleVerifyOtp}
                  disabled={loading || otpCode.length !== 6}
                  className="w-full bg-primary text-on-primary py-3.5 rounded-xl font-headline font-bold disabled:opacity-50 hover:brightness-110 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : "Entrar"}
                </button>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => {
                      setOtpStep("phone");
                      setOtpCode("");
                      setError(null);
                    }}
                    className="flex items-center gap-1 text-xs text-on-surface-variant/70 hover:text-on-surface"
                  >
                    <ArrowLeft size={12} />
                    Cambiar número
                  </button>
                  <button
                    onClick={handleRequestOtp}
                    disabled={loading}
                    className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
                  >
                    Reenviar código
                  </button>
                </div>
              </>
            )}

            {/* Paso 3: nombre (sólo clientes nuevos) */}
            {otpStep === "name" && (
              <>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 block">
                    Tu nombre
                  </label>
                  <div className="relative">
                    <User
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 pointer-events-none"
                    />
                    <input
                      type="text"
                      value={otpName}
                      onChange={(e) => setOtpName(e.target.value)}
                      placeholder="Juan Pérez"
                      maxLength={60}
                      className="w-full pl-10 pr-4 py-3 bg-surface-container-high border border-outline-variant text-on-surface rounded-xl text-base focus:ring-2 focus:ring-primary focus:border-primary placeholder:text-on-surface-variant/40"
                      onKeyDown={(e) => e.key === "Enter" && handleSaveOtpName()}
                      autoFocus
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-error text-sm text-center py-1">{error}</p>
                )}

                <button
                  onClick={handleSaveOtpName}
                  disabled={loading || otpName.trim().length < 2}
                  className="w-full bg-primary text-on-primary py-3.5 rounded-xl font-headline font-bold disabled:opacity-50 hover:brightness-110 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    "Listo, seguir con mi pedido"
                  )}
                </button>
              </>
            )}

            {otpStep === "phone" && (
              <p className="text-center text-xs text-on-surface-variant/60 pt-1">
                ¿Ya tienes cuenta con contraseña?{" "}
                <button
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                  className="text-primary font-semibold hover:underline"
                >
                  Entrar con contraseña
                </button>
              </p>
            )}
          </div>
        )}

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
            <p className="text-center text-xs text-on-surface-variant/60 mt-2">
              <button
                onClick={() => {
                  setMode("otp");
                  setError(null);
                }}
                className="inline-flex items-center gap-1 text-primary font-semibold hover:underline"
              >
                <MessageCircle size={11} />
                Mejor mándame un código por WhatsApp
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
            <p className="text-center text-xs text-on-surface-variant/60 mt-2">
              <button
                onClick={() => {
                  setMode("otp");
                  setError(null);
                }}
                className="inline-flex items-center gap-1 text-primary font-semibold hover:underline"
              >
                <MessageCircle size={11} />
                Sin contraseña: mándame un código por WhatsApp
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
