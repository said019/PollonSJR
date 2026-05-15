"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getDriverToken, removeDriverToken } from "@/lib/auth";
import { formatCents } from "@pollon/utils";
import type { DriverOrderSummary, DriverPublic } from "@pollon/types";
import { useDriverGeolocation } from "@/hooks/useDriverGeolocation";
import { DriverAlerts } from "@/components/client/driver-alerts";
import {
  Bike,
  Loader2,
  LogOut,
  MapPin,
  Phone,
  Power,
  RefreshCw,
  Shield,
  ShieldAlert,
  Banknote,
  CreditCard,
  Landmark,
  Wifi,
  WifiOff,
  ChevronRight,
  ShieldCheck,
} from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Recibido",
  PREPARING: "En cocina",
  READY: "Listo para recoger",
  ON_THE_WAY: "En camino",
};

export default function DriverDashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: me } = useQuery({
    queryKey: ["driver-me"],
    queryFn: () => api.get<DriverPublic>("/api/drivers/me", getDriverToken() || undefined),
  });

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ["driver-orders"],
    queryFn: () =>
      api.get<DriverOrderSummary[]>("/api/drivers/orders", getDriverToken() || undefined),
    refetchInterval: 15_000,
  });

  const shiftMut = useMutation({
    mutationFn: (onShift: boolean) =>
      api.post("/api/drivers/shift", { onShift }, getDriverToken() || undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["driver-me"] }),
  });

  const onShift = !!me?.onShift;

  // Pedido activo para anunciarlo al backend en cada ping GPS.
  const activeOrder = useMemo(
    () =>
      orders.find((o) => o.status === "ON_THE_WAY") ??
      orders.find((o) => o.status === "READY") ??
      null,
    [orders]
  );

  const geo = useDriverGeolocation(onShift, {
    activeOrderId: activeOrder?.id ?? null,
  });

  // Si el turno está abierto y aún no se concedió permiso, pedirlo automáticamente.
  useEffect(() => {
    if (onShift && geo.perm === "prompt") {
      geo.requestPermission();
    }
  }, [onShift, geo.perm, geo]);

  const logout = () => {
    if (onShift) shiftMut.mutate(false);
    removeDriverToken();
    router.replace("/driver/login");
  };

  return (
    <div className="min-h-screen bg-surface pb-32">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-outline-variant/10 bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 font-headline text-base font-bold text-primary">
              {me?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={me.photoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                (me?.name || "?").slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-headline text-sm font-bold text-tertiary">
                {me?.name || "—"}
              </p>
              <p className="truncate text-[10px] uppercase tracking-wider text-on-surface-variant/70">
                {me?.vehicle || "Sin vehículo"}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            aria-label="Cerrar sesión"
            className="rounded-xl border border-outline-variant/25 p-2 text-on-surface-variant hover:border-error/40 hover:text-error"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">
        {/* Alerts, install card, notification permission */}
        <DriverAlerts />

        {/* Shift toggle + GPS */}
        <section
          className={`mb-4 overflow-hidden rounded-3xl border ${
            onShift
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-outline-variant/20 bg-surface-container"
          }`}
        >
          <div className="flex items-center gap-4 p-4">
            <div
              className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl ${
                onShift
                  ? "bg-emerald-500 text-white"
                  : "bg-surface-variant text-on-surface-variant"
              }`}
            >
              <Power size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-headline text-base font-extrabold text-tertiary">
                {onShift ? "Estás en turno" : "Fuera de turno"}
              </p>
              <p className="text-[11px] text-on-surface-variant">
                {onShift
                  ? "Recibirás pedidos y compartirás tu ubicación."
                  : "Inicia turno para empezar a recibir pedidos."}
              </p>
            </div>
            <button
              onClick={() => shiftMut.mutate(!onShift)}
              disabled={shiftMut.isPending}
              className={`flex-shrink-0 rounded-xl px-4 py-2.5 font-headline text-xs font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 ${
                onShift
                  ? "border border-error/40 bg-error/10 text-error"
                  : "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
              }`}
            >
              {shiftMut.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : onShift ? (
                "Cerrar"
              ) : (
                "Iniciar"
              )}
            </button>
          </div>

          {onShift && (
            <div className="border-t border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-[11px]">
              <GpsStatusRow geo={geo} />
            </div>
          )}
        </section>

        {/* Orders */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-headline text-sm font-bold uppercase tracking-wider text-on-surface-variant">
            Mis pedidos
          </h2>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant hover:border-primary/40 hover:text-primary"
          >
            <RefreshCw size={11} />
            Refrescar
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-outline-variant/30 bg-surface-container p-8 text-center">
            <Bike size={26} className="mx-auto mb-2 text-on-surface-variant/40" />
            <p className="text-sm font-semibold text-on-surface">Sin pedidos asignados</p>
            <p className="mt-1 text-[11px] text-on-surface-variant">
              Cuando el admin te asigne uno aparecerá aquí.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {orders.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function GpsStatusRow({
  geo,
}: {
  geo: ReturnType<typeof useDriverGeolocation>;
}) {
  const lastAgo = geo.lastCoords
    ? Math.round((Date.now() - geo.lastCoords.ts) / 1000)
    : null;
  if (geo.perm === "denied") {
    return (
      <div className="flex items-center gap-2 text-error">
        <ShieldAlert size={13} />
        <span className="font-semibold">
          GPS bloqueado. Activa Ubicación en tu navegador para que el admin pueda
          verte.
        </span>
      </div>
    );
  }
  if (geo.perm === "unsupported") {
    return (
      <div className="flex items-center gap-2 text-on-surface-variant">
        <WifiOff size={13} />
        Este dispositivo no soporta GPS.
      </div>
    );
  }
  if (geo.perm === "prompt") {
    return (
      <button
        onClick={geo.requestPermission}
        className="flex items-center gap-2 font-semibold text-primary"
      >
        <Shield size={13} />
        Permitir acceso a tu ubicación
      </button>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 text-emerald-400">
      <span className="flex items-center gap-2 font-semibold">
        <ShieldCheck size={13} />
        GPS activo
      </span>
      {lastAgo !== null && (
        <span className="text-on-surface-variant">
          <Wifi size={11} className="mr-1 inline" />
          Último ping hace {lastAgo}s
        </span>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: DriverOrderSummary }) {
  const paymentIcon =
    order.paymentMethod === "CARD" ? (
      <CreditCard size={12} />
    ) : order.paymentMethod === "TRANSFER" ? (
      <Landmark size={12} />
    ) : (
      <Banknote size={12} />
    );

  const changeCents =
    order.paymentMethod === "CASH" &&
    order.cashAmount &&
    order.cashAmount > order.total
      ? order.cashAmount - order.total
      : null;

  return (
    <Link
      href={`/driver/orders/${order.id}`}
      className="block rounded-2xl border border-outline-variant/15 bg-surface-container p-4 transition-all hover:border-primary/40 active:scale-[0.99]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-headline font-bold uppercase tracking-wider text-primary">
          {STATUS_LABELS[order.status] || order.status}
        </span>
        <span className="font-headline text-xs font-bold text-on-surface-variant">
          #{order.orderNumber}
        </span>
      </div>

      <div className="mt-2.5 flex items-start gap-2">
        <MapPin size={14} className="mt-0.5 flex-shrink-0 text-on-surface-variant" />
        <p className="line-clamp-2 text-sm font-semibold text-on-surface">
          {order.deliveryAddress || "Dirección no especificada"}
        </p>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-outline-variant/10 pt-2.5 text-xs">
        <div className="flex items-center gap-2 text-on-surface-variant">
          <Phone size={12} />
          <span className="font-mono">{order.customerPhone}</span>
        </div>
        <div className="flex items-center gap-1.5 font-headline font-bold text-tertiary">
          {paymentIcon}
          {formatCents(order.total)}
        </div>
      </div>

      {changeCents !== null && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-headline font-bold uppercase tracking-wider text-emerald-400">
          Cambio: {formatCents(changeCents)}
        </div>
      )}

      <div className="mt-2 flex items-center justify-end text-[10px] font-bold uppercase tracking-wider text-primary">
        Ver detalle <ChevronRight size={12} />
      </div>
    </Link>
  );
}
