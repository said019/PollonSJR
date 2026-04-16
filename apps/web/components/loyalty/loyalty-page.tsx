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
  Plus,
  QrCode,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Wallet,
} from "lucide-react";

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
      className={`flex min-h-14 items-center justify-center gap-3 rounded-lg px-4 py-3 text-left transition-all active:scale-[0.98] disabled:cursor-wait disabled:opacity-70 ${
        isApple
          ? "border border-tertiary/20 bg-tertiary text-surface hover:bg-tertiary-dim"
          : "border border-outline-variant/30 bg-surface-container-high text-tertiary hover:border-primary/40 hover:bg-surface-bright"
      }`}
    >
      {loading ? (
        <Loader2 size={20} className="animate-spin" />
      ) : (
        <Plus size={20} className={isApple ? "text-surface" : "text-primary"} />
      )}
      <span className="leading-tight">
        <span className="block text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">
          Agregar a
        </span>
        <span className="block font-headline text-base font-extrabold">
          {isApple ? "Apple Wallet" : "Google Wallet"}
        </span>
      </span>
    </button>
  );
}

export function LoyaltyPage() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [walletLoading, setWalletLoading] = useState<WalletProvider | null>(null);
  const [walletStatus, setWalletStatus] = useState<WalletStatus>(null);

  useEffect(() => {
    setToken(getToken());
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
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-lg border border-primary/30 bg-surface">
                      <Image
                        src="/pollon-logo.jpg"
                        alt="Pollón"
                        width={64}
                        height={64}
                        className="h-full w-full object-cover"
                        priority
                      />
                    </div>
                    <div>
                      <p className="font-headline text-xl font-extrabold tracking-tight text-tertiary">
                        POLLÓN
                      </p>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
                        Tarjeta de lealtad
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-secondary/30 bg-secondary/10 px-3 py-2 text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-secondary">
                      Estado
                    </p>
                    <p className="text-sm font-extrabold text-tertiary">
                      {info.pendingReward ? "Lista" : "Activa"}
                    </p>
                  </div>
                </div>

                <div className="mt-10">
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
