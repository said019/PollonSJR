"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import {
  AlertTriangle,
  Check,
  Loader2,
  LogOut,
  MessageCircle,
  QrCode,
  Send,
  X,
} from "lucide-react";
import { useState } from "react";

interface StatusResponse {
  provider: "evolution";
  configured: boolean;
  connected: boolean;
  state: string; // "open" | "connecting" | "close" | "not_created" | "not_configured" | "error"
  number?: string | null;
}

interface ConnectResponse {
  success: boolean;
  qrCode: string | null; // data:image/png;base64,... OR raw base64
  pairingCode: string | null;
  count: number | null;
}

const STATE_LABELS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "muted" }> = {
  open: { label: "Conectado", tone: "ok" },
  connecting: { label: "Conectando…", tone: "warn" },
  close: { label: "Desconectado", tone: "bad" },
  not_created: { label: "Sin instancia", tone: "warn" },
  not_configured: { label: "No configurado", tone: "muted" },
  error: { label: "Error de conexión", tone: "bad" },
};

const TONE_CLASSES: Record<"ok" | "warn" | "bad" | "muted", string> = {
  ok: "bg-green-500/15 text-green-400",
  warn: "bg-amber-500/15 text-amber-400",
  bad: "bg-error/15 text-error",
  muted: "bg-surface-variant text-on-surface-variant",
};

export function EvolutionApiSection() {
  const token = getAdminToken();
  const qc = useQueryClient();
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState<ConnectResponse | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["evolution-status"],
    queryFn: () =>
      api.get<StatusResponse>("/api/evolution/status", token || undefined),
    // Poll every 5s while QR is showing or while not connected, otherwise 30s
    refetchInterval: (query) => {
      const s = query.state.data as StatusResponse | undefined;
      if (showQr) return 3_000;
      if (!s?.connected) return 10_000;
      return 30_000;
    },
  });

  const connectMut = useMutation({
    mutationFn: () =>
      api.post<ConnectResponse>(
        "/api/evolution/connect",
        {},
        token || undefined
      ),
    onSuccess: (data) => {
      setQr(data);
      setShowQr(true);
    },
  });

  const logoutMut = useMutation({
    mutationFn: () =>
      api.post("/api/evolution/logout", {}, token || undefined),
    onSuccess: () => {
      setShowQr(false);
      setQr(null);
      qc.invalidateQueries({ queryKey: ["evolution-status"] });
    },
  });

  const testMut = useMutation({
    mutationFn: (phone: string) =>
      api.post<{ success: boolean; message?: string }>(
        "/api/evolution/test",
        { phone },
        token || undefined
      ),
    onSuccess: (data) => {
      setTestResult(data.message || "Mensaje enviado");
      setTestError(null);
    },
    onError: (err: any) => {
      setTestError(err.message || "No se pudo enviar");
      setTestResult(null);
    },
  });

  // Auto-hide QR once the connection is open
  if (showQr && status?.state === "open") {
    setShowQr(false);
    setQr(null);
  }

  const stateMeta =
    status && STATE_LABELS[status.state]
      ? STATE_LABELS[status.state]
      : { label: status?.state ?? "—", tone: "muted" as const };

  const qrSrc = qr?.qrCode
    ? qr.qrCode.startsWith("data:")
      ? qr.qrCode
      : `data:image/png;base64,${qr.qrCode}`
    : null;

  const handleTest = () => {
    setTestResult(null);
    setTestError(null);
    const digits = testPhone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setTestError("Ingresa un número de 10 dígitos");
      return;
    }
    testMut.mutate(digits);
  };

  return (
    <section className="mb-6 rounded-xl border border-outline-variant/20 bg-surface-container-high p-5">
      <div className="mb-4 flex items-center gap-2">
        <MessageCircle size={20} className="text-primary" />
        <h2 className="font-bold">WhatsApp (Evolution API)</h2>
      </div>

      {!status?.configured && status?.state === "not_configured" && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-300">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            Faltan variables en Railway:{" "}
            <code className="font-mono text-xs">EVOLUTION_API_URL</code>,{" "}
            <code className="font-mono text-xs">EVOLUTION_API_KEY</code>,{" "}
            <code className="font-mono text-xs">EVOLUTION_INSTANCE</code>.
          </div>
        </div>
      )}

      {/* ── Status ── */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-outline-variant/15 bg-surface-container p-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-headline font-bold uppercase tracking-wider text-on-surface-variant/60">
            Estado
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${TONE_CLASSES[stateMeta.tone]}`}
            >
              {isLoading ? <Loader2 size={10} className="animate-spin" /> : null}
              {isLoading ? "Cargando" : stateMeta.label}
            </span>
            {status?.number && (
              <span className="truncate text-xs text-on-surface-variant">
                +{status.number}
              </span>
            )}
          </div>
        </div>

        {status?.configured && (
          <div className="flex flex-shrink-0 items-center gap-2">
            {!status.connected && !showQr && (
              <button
                onClick={() => connectMut.mutate()}
                disabled={connectMut.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold uppercase tracking-wider text-on-primary transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {connectMut.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <QrCode size={12} />
                )}
                Conectar
              </button>
            )}
            {status.connected && (
              <button
                onClick={() => {
                  if (confirm("¿Desvincular WhatsApp del negocio?")) {
                    logoutMut.mutate();
                  }
                }}
                disabled={logoutMut.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/30 px-3 py-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant transition-all hover:border-error/50 hover:text-error disabled:opacity-50"
              >
                {logoutMut.isPending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <LogOut size={12} />
                )}
                Desvincular
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── QR ── */}
      {showQr && qr && (
        <div className="mb-4 rounded-xl border border-primary/25 bg-surface-container p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-headline text-sm font-bold uppercase tracking-wider text-tertiary">
              Escanea el QR con el WhatsApp del negocio
            </p>
            <button
              onClick={() => {
                setShowQr(false);
                setQr(null);
              }}
              aria-label="Cerrar"
              className="rounded-md p-1 text-on-surface-variant hover:bg-surface-variant hover:text-tertiary"
            >
              <X size={14} />
            </button>
          </div>
          {qrSrc ? (
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrSrc}
                alt="QR WhatsApp"
                className="h-56 w-56 rounded-lg bg-white p-2"
              />
              {qr.pairingCode && (
                <p className="text-xs text-on-surface-variant">
                  O usa el código:{" "}
                  <code className="rounded bg-surface px-2 py-0.5 font-mono text-sm font-bold text-primary">
                    {qr.pairingCode}
                  </code>
                </p>
              )}
              <p className="text-center text-[11px] text-on-surface-variant/70">
                WhatsApp → Ajustes → Dispositivos vinculados → Vincular un dispositivo.
                <br />
                La página se actualiza sola al detectar la conexión.
              </p>
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant">
              No se generó un QR. Reintenta o revisa los logs.
            </p>
          )}
        </div>
      )}

      {/* ── Test message ── */}
      {status?.connected && (
        <div className="rounded-xl border border-outline-variant/15 bg-surface-container p-4">
          <p className="mb-2 text-xs font-headline font-bold uppercase tracking-wider text-on-surface-variant/60">
            Enviar mensaje de prueba
          </p>
          <div className="flex flex-wrap items-stretch gap-2">
            <div className="flex flex-1 items-stretch overflow-hidden rounded-lg border border-outline-variant/30 bg-surface-container-high focus-within:border-primary/60">
              <span className="flex items-center bg-surface-container px-3 text-xs font-semibold text-on-surface-variant">
                +52
              </span>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="10 dígitos"
                value={testPhone}
                onChange={(e) =>
                  setTestPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                className="flex-1 bg-transparent px-3 py-2 text-sm text-on-surface outline-none"
              />
            </div>
            <button
              onClick={handleTest}
              disabled={testMut.isPending}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-on-primary transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {testMut.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Send size={12} />
              )}
              Enviar
            </button>
          </div>

          {testResult && (
            <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-green-400">
              <Check size={12} />
              {testResult}
            </p>
          )}
          {testError && (
            <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-error">
              <AlertTriangle size={12} />
              {testError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
