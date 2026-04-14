"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { Phone, Loader2 } from "lucide-react";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AuthModal({ open, onClose, onSuccess }: AuthModalProps) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestOtp = async () => {
    if (phone.length !== 10) {
      setError("Ingresa un número de 10 dígitos");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/auth/otp", { phone, name: name || undefined });
      setStep("otp");
    } catch (err: any) {
      setError(err.message || "Error al enviar OTP");
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
      const res = await api.post<{ token: string }>("/api/auth/verify", { phone, code: otp });
      setToken(res.token);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Código incorrecto");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface-container rounded-2xl p-6 w-full max-w-sm mx-4 border border-outline-variant/20">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-surface-container-high rounded-full flex items-center justify-center mx-auto mb-3">
            <Phone size={24} className="text-primary" />
          </div>
          <h2 className="text-lg font-headline font-bold text-on-surface">
            {step === "phone" ? "Ingresa tu celular" : "Verificar código"}
          </h2>
          <p className="text-sm text-on-surface-variant">
            {step === "phone"
              ? "Te enviaremos un código por WhatsApp"
              : `Enviamos un código al ${phone}`}
          </p>
        </div>

        {step === "phone" ? (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Tu nombre (opcional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="w-full border border-outline-variant bg-surface-container-high text-on-surface rounded-xl p-3 text-sm placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary focus:border-primary"
            />
            <input
              type="tel"
              placeholder="10 dígitos"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              className="w-full border border-outline-variant bg-surface-container-high text-on-surface rounded-xl p-3 text-sm text-center text-lg tracking-widest placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
        ) : (
          <input
            type="text"
            placeholder="______"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="w-full border border-outline-variant bg-surface-container-high text-on-surface rounded-xl p-3 text-center text-2xl tracking-[0.5em] font-mono placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary focus:border-primary"
            autoFocus
          />
        )}

        {error && <p className="text-error text-sm mt-2 text-center">{error}</p>}

        <button
          onClick={step === "phone" ? requestOtp : verifyOtp}
          disabled={loading}
          className="w-full bg-primary text-on-primary py-3 rounded-xl font-headline font-bold mt-4 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : step === "phone" ? (
            "Enviar código"
          ) : (
            "Verificar"
          )}
        </button>

        {step === "otp" && (
          <button
            onClick={() => {
              setStep("phone");
              setOtp("");
              setError(null);
            }}
            className="w-full text-on-surface-variant text-sm py-2 mt-1 hover:text-primary transition-colors"
          >
            Cambiar número
          </button>
        )}
      </div>
    </div>
  );
}
