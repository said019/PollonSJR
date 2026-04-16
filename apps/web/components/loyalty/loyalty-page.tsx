"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useSocket } from "@/hooks/useSocket";
import type { LoyaltyEventItem, LoyaltyInfo } from "@pollon/types";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Gift,
  Loader2,
  QrCode,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Wallet,
} from "lucide-react";
import { parseJwt } from "@/lib/auth";

const FALLBACK_TARGET = 5;

type WalletProvider = "apple" | "google";
type WalletStatus = { tone: "info" | "success" | "error"; message: string } | null;
type WalletPassResponse = {
  url?: string;
  passUrl?: string;
  addUrl?: string;
  message?: string;
};

function formatDate(date: string | null) {
  if (!date) return null;

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function getHistoryLabel(reason: string) {
  if (reason.startsWith("order:#")) return `Compra ${reason.replace("order:", "")}`;
  if (reason.startsWith("admin:")) return reason.replace("admin:", "Ajuste: ");
  if (reason.startsWith("expire:")) return "Recompensa vencida";
  return reason;
}

function getRewardTitle(info: LoyaltyInfo) {
  if (!info.pendingReward) return "Producto gratis";
  if (!info.pendingProduct) return "Producto gratis listo";
  return `${info.pendingProduct.emoji ?? ""} ${info.pendingProduct.name} gratis`.trim();
}

function AppleWalletLogo() {
  return (
    <svg viewBox="0 0 165 42" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Apple Wallet" className="h-[22px] w-auto">
      <path d="M22.3 0C16.8 0 12.4 3.2 9.8 3.2 7 3.2 3 0.1 -0.1 0.2 -0.1 0.2 -0.1 0.2 0 0.2 0 0.2 4.1 3.5 4.1 9c0 7 -5.9 9.5 -5.9 16.2 0 7.6 5.4 13.8 13.5 13.8 3.5 0 6.6 -2.3 9.9 -2.3 3.3 0 5.9 2.3 9.9 2.3 7.5 0 12.2 -6 12.2 -6s-5.1 -2.4 -5.1 -9.3C38.5 16 44 12.3 44 6.2 44 6.2 37.6 3.4 35 3.4 32.5 3.4 27.8 0 22.3 0z" fill="white" transform="translate(0,4) scale(0.85)"/>
      <text x="52" y="28" fontFamily="system-ui, -apple-system, sans-serif" fontSize="20" fontWeight="600" fill="white" letterSpacing="-0.3">Wallet</text>
    </svg>
  );
}

function GoogleWalletLogo() {
  return (
    <svg viewBox="0 0 120 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Google Wallet" className="h-[22px] w-auto">
      <g transform="translate(0,2) scale(0.9)">
        <circle cx="14" cy="14" r="14" fill="#4285F4"/>
        <path d="M14 7a7 7 0 0 0-6.93 6H14v2H7.07A7 7 0 1 0 14 7z" fill="white"/>
        <path d="M14 9v4l3.5 2" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
      </g>
      <text x="34" y="22" fontFamily="'Google Sans', system-ui, sans-serif" fontSize="17" fontWeight="500" fill="white" letterSpacing="0.1">Wallet</text>
    </svg>
  );
}

function WalletButton({
  provider,
  loading,
  onClick,
}: {
  provider: WalletProvider;
  loading: boolean;
  onClick: () => void;
}) {
  const isApple = provider === "apple";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`flex min-h-[52px] items-center justify-center gap-2.5 rounded-xl px-5 py-3 transition-all active:scale-[0.97] disabled:cursor-wait disabled:opacity-60 ${
        isApple
          ? "bg-black text-white border border-white/20 hover:bg-neutral-900"
          : "bg-white text-neutral-900 border border-neutral-200 hover:bg-neutral-50"
      }`}
    >
      {loading ? (
        <Loader2 size={18} className="animate-spin" />
      ) : isApple ? (
        <svg viewBox="0 0 814 1000" className="h-5 w-auto" fill="white">
          <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.7-58.7-155.5-127.4C46 658.5 0 504.4 0 357.3c0-219.2 143.4-335 284.4-335 74.5 0 136.5 49.1 183.4 49.1 44.9 0 115.4-52 201.6-52 32.3 0 134.5 2.6 198.6 97.2z"/>
          <path d="M551.4 73.1c26.7-32.1 45.7-76.3 45.7-120.5 0-6.5-.6-13-1.9-18.4-43.3 1.6-95.1 28.9-126.3 64.5-24.4 27.5-46.9 71.1-46.9 115.9 0 7.1 1.3 14.2 1.9 16.5 2.6.6 6.5 1.3 10.4 1.3 39 0 88.1-25.8 116.1-59.3z"/>
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-auto" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      )}
      <span className="leading-tight">
        <span className={`block text-[9px] font-semibold uppercase tracking-[0.15em] ${isApple ? "text-white/60" : "text-neutral-500"}`}>
          Agregar a
        </span>
        <span className={`block text-sm font-bold ${isApple ? "text-white" : "text-neutral-900"}`}>
          {isApple ? "Apple Wallet" : "Google Wallet"}
        </span>
      </span>
    </button>
  );
}

export function LoyaltyPage() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState<string>("");
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [walletLoading, setWalletLoading] = useState<WalletProvider | null>(null);
  const [walletStatus, setWalletStatus] = useState<WalletStatus>(null);

  useEffect(() => {
    const t = getToken();
    setToken(t);
    if (t) {
      const payload = parseJwt(t);
      const name = (payload?.name as string) || (payload?.phone as string) || "";
      setCustomerName(name);
    }
    setIsAuthReady(true);
  }, []);

  const {
    data: info,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["loyalty"],
    queryFn: () => api.get<LoyaltyInfo>("/api/loyalty/me", token || undefined),
    enabled: isAuthReady && !!token,
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const { data: history = [] } = useQuery({
    queryKey: ["loyalty-history"],
    queryFn: () => api.get<LoyaltyEventItem[]>("/api/loyalty/me/history", token || undefined),
    enabled: isAuthReady && !!token,
    staleTime: 20_000,
  });

  const refreshLoyalty = () => {
    void queryClient.invalidateQueries({ queryKey: ["loyalty"] });
    void queryClient.invalidateQueries({ queryKey: ["loyalty-history"] });
  };

  useSocket("loyalty:points", refreshLoyalty, {
    token: token || undefined,
    role: token ? "customer" : undefined,
  });
  useSocket("loyalty:tier_up", refreshLoyalty, {
    token: token || undefined,
    role: token ? "customer" : undefined,
  });

  async function handleWalletPass(provider: WalletProvider) {
    if (!token) return;

    setWalletLoading(provider);
    setWalletStatus(null);

    try {
      const response = await api.post<WalletPassResponse>(
        `/api/loyalty/pass/${provider}`,
        {},
        token
      );
      const walletUrl = response.url || response.passUrl || response.addUrl;

      if (walletUrl) {
        window.location.assign(walletUrl);
        return;
      }

      setWalletStatus({
        tone: "success",
        message: response.message || "Tu pase de Wallet está listo.",
      });
    } catch {
      setWalletStatus({
        tone: "info",
        message:
          "Los botones ya quedaron listos. Falta conectar certificados de Apple Wallet y Google Wallet para emitir el pase.",
      });
    } finally {
      setWalletLoading(null);
    }
  }

  if (!isAuthReady || isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface text-on-surface">
        <div className="flex items-center gap-3 text-on-surface-variant">
          <Loader2 size={24} className="animate-spin text-primary" />
          Cargando tu tarjeta
        </div>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-surface px-5 py-8 text-on-surface">
        <div className="mx-auto flex min-h-[72vh] w-full max-w-md flex-col justify-center">
          <Link
            href="/menu"
            className="mb-8 inline-flex w-fit items-center gap-2 text-sm font-semibold text-on-surface-variant transition-colors hover:text-primary"
          >
            <ArrowLeft size={18} />
            Volver al menú
          </Link>

          <div className="rounded-lg border border-outline-variant/20 bg-surface-container p-6">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Wallet size={26} />
            </div>
            <h1 className="font-headline text-3xl font-extrabold text-tertiary">
              Tu tarjeta Pollón
            </h1>
            <p className="mt-3 leading-relaxed text-on-surface-variant">
              Entra para ver tus compras, recompensas y Wallet.
            </p>
            <Link
              href="/menu"
              className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-primary px-5 py-3 font-headline font-bold text-on-primary transition-all hover:brightness-110 active:scale-[0.98]"
            >
              Entrar desde el menú
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (isError || !info) {
    return (
      <main className="min-h-screen bg-surface px-5 py-8 text-on-surface">
        <div className="mx-auto flex min-h-[72vh] w-full max-w-md flex-col justify-center">
          <Link
            href="/menu"
            className="mb-8 inline-flex w-fit items-center gap-2 text-sm font-semibold text-on-surface-variant transition-colors hover:text-primary"
          >
            <ArrowLeft size={18} />
            Volver al menú
          </Link>
          <div className="rounded-lg border border-error/30 bg-error/10 p-6">
            <h1 className="font-headline text-2xl font-bold text-on-error-container">
              No pudimos cargar tu tarjeta
            </h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              {error instanceof Error ? error.message : "Intenta de nuevo en unos segundos."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const target = info.target || FALLBACK_TARGET;
  const progress = Math.min(info.pendingReward ? target : info.progress, target);
  const progressPercent = Math.round((progress / target) * 100);
  const expiresAt = formatDate(info.rewardExpiresAt);
  const recentHistory = history.slice(0, 4);
  const rewardLabel = getRewardTitle(info);

  return (
    <main className="min-h-screen overflow-hidden bg-surface text-on-surface">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(115deg,rgba(249,115,22,0.14),transparent_32%),linear-gradient(180deg,rgba(250,204,21,0.08),transparent_42%)]" />
      <div className="pointer-events-none fixed inset-0 grain opacity-70" />

      <section className="relative mx-auto max-w-6xl px-5 py-6 sm:py-8 lg:px-8">
        <Link
          href="/menu"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-on-surface-variant transition-colors hover:text-primary"
        >
          <ArrowLeft size={18} />
          Volver al menú
        </Link>

        <div className="grid gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="max-w-xl">
            <p className="mb-4 inline-flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-bold uppercase text-primary">
              <Sparkles size={14} />
              Club Pollón
            </p>
            <h1 className="font-headline text-4xl font-extrabold leading-[0.95] text-tertiary sm:text-5xl lg:text-6xl">
              Tu tarjeta digital.
            </h1>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-on-surface-variant">
              Cinco compras entregadas desbloquean un producto gratis. La
              recompensa vence en seis meses.
            </p>

            <div className="mt-6 grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-outline-variant/20 bg-surface-container/80 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">
                  Avance
                </p>
                <p className="mt-1 font-headline text-2xl font-extrabold text-primary">
                  {progress}/{target}
                </p>
              </div>
              <div className="rounded-lg border border-outline-variant/20 bg-surface-container/80 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">
                  Ganadas
                </p>
                <p className="mt-1 font-headline text-2xl font-extrabold text-secondary">
                  {info.freeProductsEarned}
                </p>
              </div>
              <div className="rounded-lg border border-outline-variant/20 bg-surface-container/80 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">
                  Usadas
                </p>
                <p className="mt-1 font-headline text-2xl font-extrabold text-tertiary">
                  {info.freeProductsUsed}
                </p>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-lg bg-primary/10 blur-2xl" />
            <div className="relative overflow-hidden rounded-lg border border-primary/30 bg-[linear-gradient(140deg,#3a1706_0%,#17120f_48%,#050505_100%)] p-5 shadow-2xl sm:p-6">
              <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#F97316,#FACC15,#F97316)]" />
              <div className="absolute -right-16 top-10 h-40 w-56 rotate-12 border border-primary/20" />
              <div className="absolute bottom-0 left-0 h-28 w-full bg-[repeating-linear-gradient(135deg,rgba(250,204,21,0.08)_0,rgba(250,204,21,0.08)_1px,transparent_1px,transparent_12px)]" />

              <div className="relative z-10">
                {/* Header row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-10 w-10 overflow-hidden rounded-lg border border-primary/30 bg-surface shrink-0">
                      <Image
                        src="/pollon-logo.jpg"
                        alt="Pollón"
                        width={40}
                        height={40}
                        className="h-full w-full object-cover"
                        priority
                      />
                    </div>
                    <div>
                      <p className="font-headline text-base font-extrabold tracking-tight text-tertiary leading-none">
                        POLLÓN
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant mt-0.5">
                        Tarjeta de lealtad
                      </p>
                    </div>
                  </div>

                  <div className={`rounded-lg border px-3 py-1.5 text-right shrink-0 ${
                    info.pendingReward
                      ? "border-secondary/40 bg-secondary/15"
                      : "border-primary/30 bg-primary/10"
                  }`}>
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">
                      Estado
                    </p>
                    <p className={`text-xs font-extrabold ${
                      info.pendingReward ? "text-secondary" : "text-primary"
                    }`}>
                      {info.pendingReward ? "Premio lista 🎉" : "Activa"}
                    </p>
                  </div>
                </div>

                {/* Customer name */}
                {customerName && (
                  <div className="mt-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/60">
                      Titular
                    </p>
                    <p className="mt-0.5 font-headline text-lg font-extrabold tracking-wide text-tertiary uppercase truncate">
                      {customerName}
                    </p>
                  </div>
                )}

                <div className="mt-6">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary">
                    Próximo premio
                  </p>
                  <h2 className="mt-2 font-headline text-3xl font-extrabold leading-none text-tertiary sm:text-4xl">
                    {rewardLabel}
                  </h2>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-on-surface-variant">
                    {info.pendingReward
                      ? "Se descuenta automáticamente en tu próximo pedido."
                      : `Faltan ${info.ordersToNext} compra${info.ordersToNext === 1 ? "" : "s"} para desbloquearlo.`}
                  </p>
                </div>

                <div className="mt-7">
                  <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-[0.14em] text-on-surface-variant">
                    <span>Compras</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {Array.from({ length: target }).map((_, index) => {
                      const filled = index < progress;
                      return (
                        <div
                          key={index}
                          className={`h-11 rounded-lg border transition-colors ${
                            filled
                              ? "border-primary bg-primary text-on-primary"
                              : "border-outline-variant/40 bg-surface/45 text-on-surface-variant"
                          }`}
                        >
                          <div className="flex h-full items-center justify-center">
                            {filled ? <CheckCircle2 size={18} /> : index + 1}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-7 flex items-end justify-between gap-4 border-t border-outline-variant/20 pt-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-on-surface-variant">
                      Vigencia
                    </p>
                    <p className="mt-1 text-sm font-semibold text-tertiary">
                      {expiresAt ? `Vence ${expiresAt}` : "6 meses al ganar"}
                    </p>
                  </div>
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-tertiary/20 bg-tertiary text-surface">
                    <QrCode size={34} />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <WalletButton
                provider="apple"
                loading={walletLoading === "apple"}
                onClick={() => void handleWalletPass("apple")}
              />
              <WalletButton
                provider="google"
                loading={walletLoading === "google"}
                onClick={() => void handleWalletPass("google")}
              />
            </div>

            {walletStatus && (
              <div
                className={`mt-3 rounded-lg border px-4 py-3 text-sm ${
                  walletStatus.tone === "success"
                    ? "border-primary/30 bg-primary/10 text-tertiary"
                    : "border-outline-variant/30 bg-surface-container text-on-surface-variant"
                }`}
              >
                {walletStatus.message}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="relative mx-auto grid max-w-6xl gap-4 px-5 pb-10 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
        <article className="rounded-lg border border-outline-variant/20 bg-surface-container/90 p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Gift size={22} />
            </div>
            <div>
              <h2 className="font-headline text-xl font-extrabold text-tertiary">
                Resumen
              </h2>
              <p className="text-sm text-on-surface-variant">Lo importante, sin vueltas.</p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-on-surface-variant">
            <p className="flex items-center gap-3">
              <ShoppingBag size={18} className="shrink-0 text-primary" />
              {info.completedOrders} compras acumuladas.
            </p>
            <p className="flex items-center gap-3">
              <Gift size={18} className="shrink-0 text-secondary" />
              {info.pendingReward ? "Tienes recompensa lista." : "Producto gratis cada 5 compras."}
            </p>
            <p className="flex items-center gap-3">
              <Smartphone size={18} className="shrink-0 text-primary" />
              Progreso actualizado en tiempo real.
            </p>
          </div>
        </article>

        <article className="rounded-lg border border-outline-variant/20 bg-surface-container/90 p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-headline text-xl font-extrabold text-tertiary">
                Últimos movimientos
              </h2>
              <p className="text-sm text-on-surface-variant">Tus compras recientes.</p>
            </div>
            <Clock3 size={22} className="text-on-surface-variant" />
          </div>

          {recentHistory.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {recentHistory.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between gap-4 rounded-lg border border-outline-variant/15 bg-surface-container-high p-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-tertiary">
                      {getHistoryLabel(event.reason)}
                    </p>
                    <p className="mt-0.5 text-xs text-on-surface-variant">
                      {formatDate(event.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`rounded px-2 py-1 text-sm font-bold ${
                      event.orderDelta >= 0
                        ? "bg-primary/15 text-primary"
                        : "bg-error/15 text-error"
                    }`}
                  >
                    {event.orderDelta > 0 ? "+" : ""}
                    {event.orderDelta}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-outline-variant/30 bg-surface-container-high p-4 text-sm text-on-surface-variant">
              Tu primera compra entregada aparecerá aquí.
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
