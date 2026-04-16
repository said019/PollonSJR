"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useSocket } from "@/hooks/useSocket";
import type { LoyaltyEventItem, LoyaltyInfo } from "@pollon/types";
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  Clock3,
  Gift,
  Loader2,
  ShoppingBag,
  Sparkles,
  TimerReset,
} from "lucide-react";

const FALLBACK_TARGET = 5;

function formatDate(date: string | null) {
  if (!date) return null;

  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

function getHistoryLabel(reason: string) {
  if (reason.startsWith("order:#")) {
    return `Compra ${reason.replace("order:", "")}`;
  }

  if (reason.startsWith("admin:")) {
    return reason.replace("admin:", "Ajuste: ");
  }

  if (reason.startsWith("expire:")) {
    return "Recompensa vencida";
  }

  return reason;
}

function getRewardTitle(info: LoyaltyInfo) {
  if (!info.pendingReward) return "Tu próxima recompensa";
  if (!info.pendingProduct) return "Producto gratis listo";
  return `${info.pendingProduct.emoji ?? ""} ${info.pendingProduct.name} gratis`.trim();
}

export function LoyaltyPage() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

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

  if (!isAuthReady) {
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
        <div className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col justify-center">
          <Link
            href="/menu"
            className="mb-8 inline-flex w-fit items-center gap-2 text-sm font-semibold text-on-surface-variant transition-colors hover:text-primary"
          >
            <ArrowLeft size={18} />
            Volver al menú
          </Link>

          <div className="rounded-lg border border-outline-variant/20 bg-surface-container p-6">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Gift size={26} />
            </div>
            <h1 className="font-headline text-3xl font-extrabold text-tertiary">
              Tarjeta de lealtad
            </h1>
            <p className="mt-3 leading-relaxed text-on-surface-variant">
              Inicia sesión para ver tus compras acumuladas, recompensas listas y
              vencimientos en tiempo real.
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

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface text-on-surface">
        <div className="flex items-center gap-3 text-on-surface-variant">
          <Loader2 size={24} className="animate-spin text-primary" />
          Cargando tu tarjeta
        </div>
      </main>
    );
  }

  if (isError || !info) {
    return (
      <main className="min-h-screen bg-surface px-5 py-8 text-on-surface">
        <div className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col justify-center">
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
  const earnedAt = formatDate(info.rewardEarnedAt);
  const usedRewards = Math.max(info.freeProductsUsed, 0);
  const earnedRewards = Math.max(info.freeProductsEarned, 0);

  return (
    <main className="min-h-screen bg-surface text-on-surface">
      <section className="border-b border-outline-variant/10 bg-surface-container-low px-5 py-6">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/menu"
            className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-on-surface-variant transition-colors hover:text-primary"
          >
            <ArrowLeft size={18} />
            Volver al menú
          </Link>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <p className="mb-3 inline-flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-bold uppercase text-primary">
                <Sparkles size={14} />
                Tarjeta de lealtad
              </p>
              <h1 className="font-headline text-4xl font-extrabold leading-tight text-tertiary sm:text-5xl">
                5 compras y tu siguiente premio va por la casa.
              </h1>
              <p className="mt-4 max-w-2xl leading-relaxed text-on-surface-variant">
                Acumula compras entregadas. Al completar cinco, Pollón elige un
                producto gratis basado en lo que más pides y lo aplica en tu
                próximo pedido.
              </p>
            </div>

            <div className="rounded-lg border border-outline-variant/20 bg-surface-container p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-on-surface-variant">
                    Compras acumuladas
                  </p>
                  <p className="mt-1 font-headline text-4xl font-extrabold text-primary">
                    {info.completedOrders}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
                  <ShoppingBag size={25} />
                </div>
              </div>
              <div className="mt-5 h-3 overflow-hidden rounded bg-surface-variant">
                <div
                  className="h-full rounded bg-primary transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-sm text-on-surface-variant">
                <span>
                  {progress} de {target}
                </span>
                <span>
                  {info.pendingReward
                    ? "Recompensa lista"
                    : `Faltan ${info.ordersToNext} compra${info.ordersToNext === 1 ? "" : "s"}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-5 px-5 py-8 lg:grid-cols-[1fr_0.8fr]">
        <div className="space-y-5">
          <article className="rounded-lg border border-outline-variant/20 bg-surface-container p-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Gift size={26} />
                </div>
                <p className="text-sm font-bold uppercase text-primary">
                  {info.pendingReward ? "Disponible ahora" : "En progreso"}
                </p>
                <h2 className="mt-2 font-headline text-2xl font-extrabold text-tertiary">
                  {getRewardTitle(info)}
                </h2>
                <p className="mt-3 max-w-xl leading-relaxed text-on-surface-variant">
                  {info.pendingReward
                    ? "Tu producto gratis se descuenta automáticamente cuando hagas tu próximo pedido."
                    : `Completa ${info.ordersToNext} compra${info.ordersToNext === 1 ? "" : "s"} más para desbloquear tu producto gratis.`}
                </p>
              </div>

              <div className="rounded-lg border border-outline-variant/20 bg-surface-container-high p-4 sm:min-w-48">
                <div className="flex items-center gap-2 text-sm font-bold text-secondary">
                  <TimerReset size={17} />
                  Vigencia
                </div>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                  {expiresAt
                    ? `Vence el ${expiresAt}.`
                    : "Cada recompensa vence 6 meses después de ganarla."}
                </p>
                {earnedAt && (
                  <p className="mt-2 text-xs text-on-surface-variant/70">
                    Ganada el {earnedAt}.
                  </p>
                )}
              </div>
            </div>
          </article>

          <article className="rounded-lg border border-outline-variant/20 bg-surface-container p-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-headline text-xl font-extrabold text-tertiary">
                  Historial
                </h2>
                <p className="text-sm text-on-surface-variant">
                  Movimientos de tu tarjeta.
                </p>
              </div>
              <Clock3 size={22} className="text-on-surface-variant" />
            </div>

            {history.length > 0 ? (
              <div className="divide-y divide-outline-variant/15">
                {history.map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-4 py-4">
                    <div>
                      <p className="font-semibold text-tertiary">
                        {getHistoryLabel(event.reason)}
                      </p>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {formatDate(event.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`rounded px-2.5 py-1 text-sm font-bold ${
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
              <div className="rounded-lg border border-dashed border-outline-variant/30 bg-surface-container-high p-5 text-sm text-on-surface-variant">
                Aún no hay movimientos. Tu primera compra entregada aparecerá aquí.
              </div>
            )}
          </article>
        </div>

        <aside className="space-y-5">
          <div className="rounded-lg border border-outline-variant/20 bg-surface-container p-5">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-secondary/15 text-secondary">
              <Award size={24} />
            </div>
            <h2 className="font-headline text-xl font-extrabold text-tertiary">
              Reglas claras
            </h2>
            <div className="mt-5 space-y-4">
              <div className="flex gap-3">
                <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-primary" />
                <p className="text-sm leading-relaxed text-on-surface-variant">
                  Cada pedido entregado suma una compra.
                </p>
              </div>
              <div className="flex gap-3">
                <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-primary" />
                <p className="text-sm leading-relaxed text-on-surface-variant">
                  Cada cinco compras desbloquean un producto gratis.
                </p>
              </div>
              <div className="flex gap-3">
                <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-primary" />
                <p className="text-sm leading-relaxed text-on-surface-variant">
                  Las recompensas vencen a los seis meses.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-outline-variant/20 bg-surface-container p-4">
              <p className="text-xs font-semibold uppercase text-on-surface-variant">
                Ganadas
              </p>
              <p className="mt-2 font-headline text-3xl font-extrabold text-secondary">
                {earnedRewards}
              </p>
            </div>
            <div className="rounded-lg border border-outline-variant/20 bg-surface-container p-4">
              <p className="text-xs font-semibold uppercase text-on-surface-variant">
                Usadas
              </p>
              <p className="mt-2 font-headline text-3xl font-extrabold text-primary">
                {usedRewards}
              </p>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
