"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { saveTokens, getToken } from "@/lib/auth";
import { Phone, Loader2, MessageCircle } from "lucide-react";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const [step, setStep] = useState<"phone" | "otp" | "name">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);

  const requestOtp = async () => {
    if (phone.length !== 10) {
      setError("Ingresa un número de 10 dígitos");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post<{ ok: boolean; debugCode?: string }>("/api/auth/request-otp", { phone });
      setStep("otp");
    } catch (err: any) {
      setError(err.message || "Error al enviar código");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) {
      setError("Ingresa el código de 6 dígitos");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{
        ok: boolean;
        accessToken: string;
        refreshToken: string;
        isNewCustomer: boolean;
      }>("/api/auth/verify-otp", { phone, code: otp });

      saveTokens(res.accessToken, res.refreshToken);

      if (res.isNewCustomer) {
        setIsNew(true);
        setStep("name");
      } else {
        onSuccess?.();
        onClose();
        resetState();
      }
    } catch (err: any) {
      setError(err.message || "Código incorrecto");
    } finally {
      setLoading(false);
    }
  };

  const saveName = async () => {
    if (!name.trim()) {
      setError("Ingresa tu nombre");
      return;
    }
    setLoading(true);
    try {
      const token = getToken();
      if (token) {
        await api.put("/api/auth/me", { name: name.trim() }, token);
      }
      onSuccess?.();
      onClose();
      resetState();
    } catch (err: any) {
      setError(err.message || "Error al guardar nombre");
    } finally {
      setLoading(false);
    }
  };

  const resetState = () => {
    setStep("phone");
    setPhone("");
    setName("");
    setOtp("");
    setError(null);
    setIsNew(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-container rounded-2xl p-6 w-full max-w-sm mx-4 border border-outline-variant/20 shadow-2xl">
        {step === "phone" && (
          <>
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Phone size={24} className="text-primary" />
              </div>
              <h2 className="text-xl font-headline font-bold text-on-surface">
                Entra a tu cuenta
              </h2>
              <p className="text-sm text-on-surface-variant mt-1">
                Te enviaremos un código por WhatsApp
              </p>
            </div>

            <div className="flex gap-2">
              <div className="px-3 py-3 bg-surface-container-high border border-outline-variant rounded-xl text-sm text-on-surface-variant flex items-center">
                🇲🇽 +52
              </div>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="10 dígitos"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="flex-1 border border-outline-variant bg-surface-container-high text-on-surface rounded-xl p-3 text-sm text-center tracking-widest focus:ring-2 focus:ring-primary focus:border-primary"
                autoFocus
              />
            </div>

            {error && <p className="text-error text-sm mt-3 text-center">{error}</p>}

            <button
              onClick={requestOtp}
              disabled={loading || phone.length !== 10}
              className="w-full bg-primary text-on-primary py-3 rounded-xl font-headline font-bold mt-4 flex items-center justify-center gap-2 disabled:opacity-50 hover:brightness-110 transition-all"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <MessageCircle size={16} />
                  Recibir código por WhatsApp
                </>
              )}
            </button>

            <p className="text-center text-xs text-on-surface-variant/60 mt-4">
              Si es la primera vez, tu cuenta se crea automáticamente.
            </p>
          </>
        )}

        {step === "otp" && (
          <>
            <div className="text-center mb-6">
              <h2 className="text-xl font-headline font-bold text-on-surface">
                Verifica tu código
              </h2>
              <p className="text-sm text-on-surface-variant mt-1">
                Enviamos un código de 6 dígitos al <span className="text-primary font-medium">+52 {phone}</span>
              </p>
            </div>

            <input
              type="tel"
              inputMode="numeric"
              placeholder="______"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="w-full border border-outline-variant bg-surface-container-high text-on-surface rounded-xl p-4 text-center text-3xl font-headline font-black tracking-[0.4em] focus:ring-2 focus:ring-primary focus:border-primary"
              autoFocus
            />

            {error && <p className="text-error text-sm mt-3 text-center">{error}</p>}

            <button
              onClick={verifyOtp}
              disabled={loading || otp.length !== 6}
              className="w-full bg-primary text-on-primary py-3 rounded-xl font-headline font-bold mt-4 flex items-center justify-center gap-2 disabled:opacity-50 hover:brightness-110 transition-all"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : "Verificar"}
            </button>

            <button
              onClick={() => {
                setStep("phone");
                setOtp("");
                setError(null);
              }}
              className="w-full text-on-surface-variant text-sm py-2 mt-1 hover:text-primary transition-colors"
            >
              Cambiar número o reenviar código
            </button>
          </>
        )}

        {step === "name" && (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-2">👋</div>
              <h2 className="text-xl font-headline font-bold text-on-surface">
                ¿Cómo te llamas?
              </h2>
              <p className="text-sm text-on-surface-variant mt-1">
                Para identificar tu pedido cuando llegue
              </p>
            </div>

            <input
              type="text"
              placeholder="Tu nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-outline-variant bg-surface-container-high text-on-surface rounded-xl p-3 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
              autoFocus
              maxLength={60}
            />

            {error && <p className="text-error text-sm mt-3 text-center">{error}</p>}

            <button
              onClick={saveName}
              disabled={loading || !name.trim()}
              className="w-full bg-primary text-on-primary py-3 rounded-xl font-headline font-bold mt-4 disabled:opacity-50 hover:brightness-110 transition-all"
            >
              {loading ? <Loader2 size={18} className="animate-spin mx-auto" /> : "¡Listo!"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
