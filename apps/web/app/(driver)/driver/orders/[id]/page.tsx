"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getDriverToken } from "@/lib/auth";
import { formatCents } from "@pollon/utils";
import type { DriverOrderDetail } from "@pollon/types";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  CreditCard,
  Landmark,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  Truck,
  User,
  FileText,
} from "lucide-react";

// La cocina avanza RECEIVED → PREPARING → READY. El driver toma cuando READY.
// Si el driver intenta avanzar antes (RECEIVED/PREPARING), el backend lo
// rechaza (drivers.service.ts.updateMyOrderStatus). Mostrar UI honesta del
// estado de espera en lugar de un botón que va a fallar.
type StatusAction =
  | { kind: "advance"; next: "ON_THE_WAY" | "DELIVERED"; label: string }
  | { kind: "waiting"; label: string; hint: string }
  | { kind: "done" };

const STATUS_ACTION: Record<string, StatusAction> = {
  RECEIVED: {
    kind: "waiting",
    label: "Esperando cocina",
    hint: "El restaurante apenas confirmó el pedido. Te avisamos cuando esté listo.",
  },
  PREPARING: {
    kind: "waiting",
    label: "Cocinando",
    hint: "El pedido está en la freidora. Te avisamos cuando esté listo para recoger.",
  },
  READY: { kind: "advance", next: "ON_THE_WAY", label: "Salí con el pedido" },
  ON_THE_WAY: { kind: "advance", next: "DELIVERED", label: "Marcar como entregado" },
  DELIVERED: { kind: "done" },
};

export default function DriverOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: order, isLoading, refetch } = useQuery({
    queryKey: ["driver-order", id],
    queryFn: () =>
      api.get<DriverOrderDetail>(
        `/api/drivers/orders/${id}`,
        getDriverToken() || undefined
      ),
  });

  const advance = useMutation({
    mutationFn: (nextStatus: "ON_THE_WAY" | "DELIVERED") =>
      api.post(
        `/api/drivers/orders/${id}/status`,
        { status: nextStatus },
        getDriverToken() || undefined
      ),
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ["driver-order", id] });
      queryClient.invalidateQueries({ queryKey: ["driver-orders"] });
      if (status === "DELIVERED") {
        // Vuelve al dashboard al entregar.
        setTimeout(() => router.push("/driver"), 600);
      }
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-on-surface-variant">Pedido no encontrado.</p>
        <Link
          href="/driver"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary"
        >
          Volver
        </Link>
      </div>
    );
  }

  const action: StatusAction = STATUS_ACTION[order.status] ?? { kind: "done" };
  const mapsUrl =
    order.deliveryLat && order.deliveryLng
      ? `https://www.google.com/maps/dir/?api=1&destination=${order.deliveryLat},${order.deliveryLng}&travelmode=driving`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          order.deliveryAddress || ""
        )}`;

  const cashChange =
    order.paymentMethod === "CASH" &&
    order.cashAmount &&
    order.cashAmount > order.total
      ? order.cashAmount - order.total
      : null;

  return (
    <div className="min-h-screen bg-surface pb-32">
      <header className="sticky top-0 z-20 border-b border-outline-variant/10 bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.back()}
            className="rounded-xl border border-outline-variant/25 p-2 text-on-surface-variant hover:border-primary/40 hover:text-primary"
            aria-label="Volver"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/70">
              Pedido
            </p>
            <h1 className="truncate font-headline text-base font-extrabold text-tertiary">
              #{order.orderNumber}
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5">
        {/* Customer + map cta */}
        <section className="rounded-2xl border border-outline-variant/15 bg-surface-container p-4">
          <div className="flex items-start gap-3">
            <User size={16} className="mt-0.5 flex-shrink-0 text-on-surface-variant" />
            <div className="min-w-0 flex-1">
              <p className="font-headline text-sm font-bold text-tertiary">
                {order.customerName || "Sin nombre"}
              </p>
              <a
                href={`tel:${order.customerPhone}`}
                className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-mono text-on-surface hover:text-primary"
              >
                <Phone size={11} />
                {order.customerPhone}
              </a>
            </div>
            <a
              href={`tel:${order.customerPhone}`}
              className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-emerald-500/25"
            >
              Llamar
            </a>
          </div>

          <div className="mt-3 flex items-start gap-3 border-t border-outline-variant/10 pt-3">
            <MapPin size={16} className="mt-0.5 flex-shrink-0 text-on-surface-variant" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/70">
                Entregar en
              </p>
              <p className="text-sm font-semibold text-on-surface">
                {order.deliveryAddress || "Sin dirección"}
              </p>
            </div>
          </div>

          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 font-headline text-xs font-bold uppercase tracking-wider text-on-primary shadow-lg shadow-primary/25 active:scale-[0.98]"
          >
            <Navigation size={13} />
            Cómo llegar (Google Maps)
          </a>
        </section>

        {/* Payment + change */}
        <section className="rounded-2xl border border-outline-variant/15 bg-surface-container p-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                order.paymentMethod === "CASH"
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-primary/15 text-primary"
              }`}
            >
              {order.paymentMethod === "CARD" ? (
                <CreditCard size={17} />
              ) : order.paymentMethod === "TRANSFER" ? (
                <Landmark size={17} />
              ) : (
                <Banknote size={17} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-headline text-sm font-bold text-tertiary">
                {order.paymentMethod === "CASH"
                  ? "Cobrar en efectivo"
                  : order.paymentMethod === "CARD"
                    ? "Ya pagó con tarjeta"
                    : "Ya pagó por transferencia"}
              </p>
              <p className="text-[11px] text-on-surface-variant">
                Total a recibir: <strong>{formatCents(order.total)}</strong>
              </p>
            </div>
          </div>

          {order.paymentMethod === "CASH" && order.cashAmount && (
            <div className="mt-3 grid gap-1 rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Paga con</span>
                <span className="font-bold text-on-surface">
                  {formatCents(order.cashAmount)}
                </span>
              </div>
              <div className="flex justify-between border-t border-amber-500/20 pt-1">
                <span className="text-on-surface-variant">Lleva cambio de</span>
                <span className="font-headline font-extrabold text-amber-400">
                  {cashChange !== null ? formatCents(cashChange) : formatCents(0)}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* Items */}
        <section className="rounded-2xl border border-outline-variant/15 bg-surface-container p-4">
          <h2 className="mb-3 font-headline text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant/60">
            Detalle del pedido
          </h2>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex justify-between gap-3 border-b border-outline-variant/10 py-1.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface">
                    {item.qty}× {item.productName}
                    {item.variant && (
                      <span className="ml-1 text-xs text-on-surface-variant">
                        ({item.variant})
                      </span>
                    )}
                  </p>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <p className="text-[11px] text-on-surface-variant">
                      {item.modifiers
                        .map((m) => (m.qty > 1 ? `${m.qty}× ${m.option}` : m.option))
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <p className="text-sm font-bold text-on-surface">
                  {formatCents(item.unitPrice * item.qty)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-1 border-t border-outline-variant/10 pt-2 text-xs">
            <Row label="Subtotal" value={formatCents(order.subtotal)} />
            {order.deliveryFee > 0 && (
              <Row label="Envío" value={formatCents(order.deliveryFee)} />
            )}
            {order.tipAmount > 0 && (
              <Row label="Propina" value={formatCents(order.tipAmount)} />
            )}
            <div className="flex justify-between border-t border-outline-variant/15 pt-1.5 font-headline text-base font-bold">
              <span className="text-on-surface">Total</span>
              <span className="text-primary">{formatCents(order.total)}</span>
            </div>
          </div>
        </section>

        {order.notes && (
          <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-start gap-2">
              <FileText size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
              <div>
                <p className="font-headline text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  Notas del cliente
                </p>
                <p className="mt-0.5 text-sm text-on-surface">{order.notes}</p>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Sticky action bar — adaptado a los 3 estados: esperando, avanzar, hecho.
          Respeta safe-area-inset-bottom para que el botón no quede tapado por el
          home indicator en iPhones modernos. */}
      <div
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-surface via-surface/95 to-transparent px-4 pt-10"
        style={{
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <div className="pointer-events-auto mx-auto max-w-2xl">
          {action.kind === "advance" && (
            <button
              onClick={() => advance.mutate(action.next)}
              disabled={advance.isPending}
              className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-headline text-sm font-extrabold uppercase tracking-wider shadow-xl transition-all active:scale-[0.98] disabled:opacity-60 ${
                action.next === "DELIVERED"
                  ? "bg-emerald-500 text-white shadow-emerald-500/30"
                  : "bg-primary text-on-primary shadow-primary/30"
              }`}
            >
              {advance.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : action.next === "DELIVERED" ? (
                <CheckCircle2 size={16} />
              ) : (
                <Truck size={16} />
              )}
              {action.label}
            </button>
          )}

          {action.kind === "waiting" && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
                  <Loader2 size={16} className="animate-spin" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-headline text-sm font-extrabold uppercase tracking-wider text-amber-400">
                    {action.label}
                  </p>
                  <p className="text-[11px] leading-tight text-on-surface-variant">
                    {action.hint}
                  </p>
                </div>
              </div>
            </div>
          )}

          {action.kind === "done" && (
            <div className="rounded-2xl bg-emerald-500/15 px-4 py-3 text-center text-sm font-bold text-emerald-400">
              <CheckCircle2 size={14} className="mr-1 inline" /> Pedido entregado
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-on-surface-variant">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
