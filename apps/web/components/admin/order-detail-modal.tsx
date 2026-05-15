"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import type { OrderDetail, OrderStatusType } from "@pollon/types";
import { formatCents } from "@pollon/utils";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Banknote,
  CheckCircle,
  ChefHat,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  FileCheck2,
  Landmark,
  MapPin,
  Navigation,
  Package,
  Phone,
  Share2,
  Truck,
  User,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const STATUS_META: Record<
  OrderStatusType,
  { label: string; icon: React.ReactNode; color: string }
> = {
  PENDING_PAYMENT: { label: "Pendiente de pago", icon: <Clock size={14} />, color: "text-amber-400 bg-amber-400/15" },
  SCHEDULED: { label: "Programado", icon: <Clock size={14} />, color: "text-sky-400 bg-sky-400/15" },
  RECEIVED: { label: "Recibido", icon: <CheckCircle size={14} />, color: "text-blue-400 bg-blue-400/15" },
  PREPARING: { label: "Preparando", icon: <ChefHat size={14} />, color: "text-orange-400 bg-orange-400/15" },
  READY: { label: "Listo", icon: <Package size={14} />, color: "text-green-400 bg-green-400/15" },
  ON_THE_WAY: { label: "En camino", icon: <Truck size={14} />, color: "text-purple-400 bg-purple-400/15" },
  DELIVERED: { label: "Entregado", icon: <CheckCircle size={14} />, color: "text-gray-400 bg-gray-400/15" },
  CANCELLED: { label: "Cancelado", icon: <X size={14} />, color: "text-red-400 bg-red-400/15" },
};

const NEXT_STATUS: Record<string, OrderStatusType | null> = {
  RECEIVED: "PREPARING",
  PREPARING: "READY",
  READY: "ON_THE_WAY",
  ON_THE_WAY: "DELIVERED",
  DELIVERED: null,
};

const CANCELLABLE: Set<string> = new Set([
  "PENDING_PAYMENT",
  "RECEIVED",
  "PREPARING",
  "READY",
  "ON_THE_WAY",
]);

const PAYMENT_LABELS = {
  CARD: "Tarjeta",
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
} as const;

function DeliveryMap({
  address,
  orderNumber,
  customerName,
  customerPhone,
  adminToken,
}: {
  address: string;
  orderNumber: number;
  customerName: string;
  customerPhone: string;
  adminToken: string;
}) {
  const [copied, setCopied] = useState(false);

  // Fetch the real business location configured in the admin delivery settings
  const { data: storeLoc } = useQuery({
    queryKey: ["admin-store-location"],
    queryFn: () =>
      api.get<{ lat: number; lng: number; address: string }>(
        "/api/admin/delivery/store",
        adminToken
      ),
    staleTime: 5 * 60 * 1000, // 5 min — rarely changes
  });

  const bizLat = storeLoc?.lat ?? 20.5881;
  const bizLng = storeLoc?.lng ?? -99.9953;

  const encodedDest = encodeURIComponent(address);
  const mapSrc = `https://maps.google.com/maps?f=d&source=s_d&saddr=${bizLat},${bizLng}&daddr=${encodedDest}&output=embed&hl=es`;
  const mapsUrl = `https://www.google.com/maps/dir/${bizLat},${bizLng}/${encodedDest}`;

  // WhatsApp message for the delivery person
  const waText = encodeURIComponent(
    `🛵 *Pedido #${orderNumber}* — Pollón SJR\n\n📍 Entregar en:\n${address}\n\n👤 Cliente: ${customerName}\n📞 Tel: ${customerPhone}\n\n🗺️ Ruta: ${mapsUrl}`
  );
  const waUrl = `https://wa.me/?text=${waText}`;

  function copyAddress() {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="rounded-2xl border border-purple-500/30 bg-purple-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-purple-500/15">
        <div className="flex items-center gap-2">
          <Navigation size={14} className="text-purple-400" />
          <h3 className="font-headline text-[10px] font-bold uppercase tracking-[0.25em] text-purple-400">
            Ruta de entrega
          </h3>
        </div>
        {/* Share buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={copyAddress}
            title="Copiar dirección"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border border-outline-variant/20 text-on-surface-variant hover:border-purple-400/40 hover:text-purple-400 transition-all"
          >
            {copied ? (
              <CheckCircle size={11} className="text-green-400" />
            ) : (
              <Copy size={11} />
            )}
            {copied ? "Copiado" : "Copiar"}
          </button>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Compartir por WhatsApp"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-[#25D366]/15 border border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/25 transition-all"
          >
            <Share2 size={11} />
            WhatsApp
          </a>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir en Google Maps"
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-blue-500/10 border border-blue-400/30 text-blue-400 hover:bg-blue-500/20 transition-all"
          >
            <ExternalLink size={11} />
            Maps
          </a>
        </div>
      </div>

      {/* Embedded map */}
      <div className="relative w-full" style={{ height: 220 }}>
        <iframe
          src={mapSrc}
          title="Ruta de entrega"
          width="100%"
          height="100%"
          style={{ border: 0, display: "block" }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      {/* Address text */}
      <div className="px-4 py-2.5 flex items-start gap-2">
        <MapPin size={12} className="mt-0.5 flex-shrink-0 text-purple-400" />
        <p className="text-xs text-on-surface-variant leading-relaxed">{address}</p>
      </div>
    </section>
  );
}

interface OrderDetailModalProps {
  orderId: string | null;
  onClose: () => void;
}

export function OrderDetailModal({ orderId, onClose }: OrderDetailModalProps) {
  const adminToken = getAdminToken();
  const qc = useQueryClient();
  const open = !!orderId;
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cashReceived, setCashReceived] = useState("");

  const { data: order, isLoading } = useQuery({
    queryKey: ["admin-order-detail", orderId],
    queryFn: () => api.get<OrderDetail>(`/api/orders/${orderId}`, adminToken || undefined),
    enabled: open && !!adminToken,
  });

  const advanceMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatusType }) =>
      api.patch(`/api/admin/orders/${id}/status`, { status }, adminToken || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-active-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-order-detail", orderId] });
    },
  });

  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.patch(
        `/api/admin/orders/${id}/status`,
        { status: "CANCELLED", cancelReason: reason || undefined },
        adminToken || undefined
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-active-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-order-detail", orderId] });
      setConfirmingCancel(false);
      setCancelReason("");
      onClose();
    },
  });

  const confirmPaymentMut = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/api/admin/orders/${id}/confirm-payment`, {}, adminToken || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-active-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-order-detail", orderId] });
    },
  });

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmingCancel) { setConfirmingCancel(false); return; }
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, confirmingCancel]);

  // Reset confirm state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setConfirmingCancel(false);
      setCancelReason("");
      setCashReceived("");
    }
  }, [open]);

  const next = order?.status ? NEXT_STATUS[order.status] : null;
  const canCancel = order ? CANCELLABLE.has(order.status) : false;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.55 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-label="Detalle del pedido"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-outline-variant/15 bg-surface-container shadow-2xl sm:rounded-3xl"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 border-b border-outline-variant/10 p-5 sm:p-6">
                {isLoading || !order ? (
                  <div className="flex-1">
                    <div className="h-3 w-20 animate-pulse rounded bg-surface-variant" />
                    <div className="mt-2 h-6 w-40 animate-pulse rounded bg-surface-variant" />
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-headline text-[10px] font-bold uppercase tracking-[0.25em] text-primary">
                        Pedido
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-headline font-bold uppercase tracking-wider ${
                          STATUS_META[order.status].color
                        }`}
                      >
                        {STATUS_META[order.status].icon}
                        {STATUS_META[order.status].label}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-0.5 text-[10px] font-headline font-bold uppercase tracking-wider text-on-surface-variant">
                        {order.type === "DELIVERY" ? (
                          <>
                            <Truck size={10} /> Envío
                          </>
                        ) : (
                          <>
                            <Package size={10} /> Recoger
                          </>
                        )}
                      </span>
                    </div>
                    <h2 className="mt-1 font-headline text-2xl font-extrabold uppercase leading-none tracking-tighter text-tertiary sm:text-3xl">
                      #{order.orderNumber}
                    </h2>
                    <p className="mt-1 text-xs text-on-surface-variant/70">
                      Creado{" "}
                      {new Date(order.createdAt).toLocaleString("es-MX", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                )}

                <button
                  onClick={onClose}
                  aria-label="Cerrar"
                  className="flex-shrink-0 rounded-xl border border-outline-variant/20 p-2 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-tertiary"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="scrollbar-hide flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                {isLoading || !order ? (
                  <div className="space-y-3">
                    <div className="h-20 animate-pulse rounded-2xl bg-surface-container-high" />
                    <div className="h-32 animate-pulse rounded-2xl bg-surface-container-high" />
                    <div className="h-40 animate-pulse rounded-2xl bg-surface-container-high" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Customer */}
                    <section className="rounded-2xl border border-outline-variant/10 bg-surface-container-high p-4">
                      <h3 className="mb-3 font-headline text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant/60">
                        Cliente
                      </h3>
                      <div className="space-y-2.5 text-sm">
                        <div className="flex items-start gap-2.5">
                          <User size={15} className="mt-0.5 flex-shrink-0 text-on-surface-variant/60" />
                          <span className="font-semibold text-on-surface">
                            {order.customerName || "Sin nombre"}
                          </span>
                        </div>
                        <div className="flex items-start gap-2.5">
                          <Phone size={15} className="mt-0.5 flex-shrink-0 text-on-surface-variant/60" />
                          <a
                            href={`tel:${order.customerPhone}`}
                            className="font-mono font-medium text-on-surface hover:text-primary"
                          >
                            {order.customerPhone}
                          </a>
                        </div>
                        {order.address && (
                          <div className="flex items-start gap-2.5">
                            <MapPin size={15} className="mt-0.5 flex-shrink-0 text-on-surface-variant/60" />
                            <span className="text-on-surface">{order.address}</span>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* Driver assignment — for DELIVERY orders only */}
                    {order.type === "DELIVERY" &&
                      ["RECEIVED", "PREPARING", "READY", "ON_THE_WAY"].includes(
                        order.status
                      ) && (
                        <DriverAssignmentSection
                          orderId={order.id}
                          driver={(order as any).driver ?? null}
                          adminToken={adminToken ?? ""}
                        />
                      )}

                    {/* Delivery map — only when ON_THE_WAY and has address */}
                    {order.status === "ON_THE_WAY" &&
                      order.type === "DELIVERY" &&
                      order.address && (
                        <DeliveryMap
                          address={order.address}
                          orderNumber={order.orderNumber}
                          customerName={order.customerName ?? "Cliente"}
                          customerPhone={order.customerPhone ?? ""}
                          adminToken={adminToken ?? ""}
                        />
                      )}

                    {/* Payment */}
                    {order.paymentMethod && (
                      <section className="rounded-2xl border border-outline-variant/10 bg-surface-container-high p-4">
                        <h3 className="mb-3 font-headline text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant/60">
                          Pago
                        </h3>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                            {order.paymentMethod === "CARD" ? (
                              <CreditCard size={17} />
                            ) : order.paymentMethod === "TRANSFER" ? (
                              <Landmark size={17} />
                            ) : (
                              <Banknote size={17} />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="font-headline text-sm font-bold text-tertiary">
                              {PAYMENT_LABELS[order.paymentMethod]}
                            </p>
                            {order.paymentMethod === "CASH" &&
                              order.cashAmount !== undefined &&
                              order.cashAmount !== null && (
                                <p className="text-xs text-on-surface-variant/70">
                                  Cliente indicó pagar con: {formatCents(order.cashAmount)}
                                  {order.cashAmount > order.total && (
                                    <span className="ml-1 font-semibold text-emerald-400">
                                      · Cambio: {formatCents(order.cashAmount - order.total)}
                                    </span>
                                  )}
                                </p>
                              )}
                            {order.payment && (
                              <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">
                                {order.payment.status}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Transfer proof + confirm payment */}
                        {order.paymentMethod === "TRANSFER" && (
                          <div className="mt-4 rounded-xl border border-outline-variant/15 bg-surface-container p-3">
                            <div className="flex items-center gap-2 text-xs font-headline font-bold uppercase tracking-wider text-on-surface-variant/60">
                              <FileCheck2 size={13} />
                              Comprobante
                            </div>
                            <TransferProofPreview
                              proofUrl={order.transferProofUrl ?? null}
                              uploadedAt={order.transferProofUploadedAt ?? null}
                            />
                            {order.status === "PENDING_PAYMENT" && (
                              <button
                                disabled={
                                  !order.transferProofUrl ||
                                  confirmPaymentMut.isPending
                                }
                                onClick={() => confirmPaymentMut.mutate(order.id)}
                                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-4 py-2.5 font-headline text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-green-500/25 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-surface-variant disabled:text-on-surface-variant/40 disabled:shadow-none"
                              >
                                <CheckCircle size={14} />
                                {confirmPaymentMut.isPending
                                  ? "Confirmando…"
                                  : order.transferProofUrl
                                    ? "Confirmar pago y pasar a cocina"
                                    : "Esperando comprobante"}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Cash change calculator */}
                        {order.paymentMethod === "CASH" && (
                          <div className="mt-4 rounded-xl border border-outline-variant/15 bg-surface-container p-3 space-y-2.5">
                            <div className="flex items-center gap-2 text-xs font-headline font-bold uppercase tracking-wider text-on-surface-variant/60">
                              <Banknote size={13} />
                              Calculadora de cambio
                            </div>

                            <div className="flex items-center gap-2">
                              <label className="text-xs text-on-surface-variant whitespace-nowrap">
                                ¿Cuánto te dieron?
                              </label>
                              <div className="relative flex-1">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant/50 font-bold">$</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="any"
                                  placeholder={
                                    order.cashAmount
                                      ? String(order.cashAmount / 100)
                                      : String(order.total / 100)
                                  }
                                  value={cashReceived}
                                  onChange={(e) => setCashReceived(e.target.value)}
                                  className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-highest pl-6 pr-3 py-2 text-sm font-bold text-on-surface focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                              </div>
                            </div>

                            {(() => {
                              const received = cashReceived
                                ? parseFloat(cashReceived)
                                : order.cashAmount
                                  ? order.cashAmount / 100
                                  : 0;
                              const totalPesos = order.total / 100;
                              const change = received - totalPesos;

                              if (!received) return null;

                              return (
                                <div className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 border border-outline-variant/10">
                                  <div className="flex items-center gap-4 text-xs">
                                    <span className="text-on-surface-variant">
                                      Total: <span className="font-bold text-on-surface">{formatCents(order.total)}</span>
                                    </span>
                                    <span className="text-on-surface-variant">
                                      Recibido: <span className="font-bold text-on-surface">${received.toFixed(2)}</span>
                                    </span>
                                  </div>
                                  <div className={`text-sm font-headline font-extrabold ${
                                    change >= 0 ? "text-green-400" : "text-error"
                                  }`}>
                                    {change >= 0
                                      ? `Cambio: $${change.toFixed(2)}`
                                      : `Faltan: $${Math.abs(change).toFixed(2)}`}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </section>
                    )}

                    {/* Items */}
                    <section className="rounded-2xl border border-outline-variant/10 bg-surface-container-high p-4">
                      <h3 className="mb-3 font-headline text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant/60">
                        Productos ({order.items.length})
                      </h3>
                      <ul className="divide-y divide-outline-variant/10">
                        {order.items.map((item) => (
                          <li key={item.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-on-surface">
                                <span className="font-bold text-primary">{item.qty}×</span>{" "}
                                {item.productName}
                                {item.variant && (
                                  <span className="ml-1 text-on-surface-variant">
                                    ({item.variant})
                                  </span>
                                )}
                              </p>
                              {item.modifiers && item.modifiers.length > 0 && (
                                <ul className="mt-1 space-y-0.5">
                                  {(() => {
                                    // Group by modifier name (e.g. "Complementos")
                                    const grouped = item.modifiers.reduce<
                                      Record<string, typeof item.modifiers>
                                    >((acc, m) => {
                                      (acc[m.name] = acc[m.name] || []).push(m);
                                      return acc;
                                    }, {});
                                    return Object.entries(grouped).map(([groupName, mods]) => (
                                      <li
                                        key={groupName}
                                        className="rounded-md bg-surface px-2 py-1 text-[11px]"
                                      >
                                        <span className="font-bold uppercase tracking-wider text-tertiary">
                                          {groupName}:
                                        </span>{" "}
                                        <span className="text-on-surface">
                                          {mods
                                            .map((m) =>
                                              m.qty > 1
                                                ? `${m.qty}× ${m.option}`
                                                : m.option
                                            )
                                            .join(" · ")}
                                        </span>
                                      </li>
                                    ));
                                  })()}
                                </ul>
                              )}
                              {item.notes && (
                                <p className="mt-0.5 text-[11px] italic text-on-surface-variant/70">
                                  “{item.notes}”
                                </p>
                              )}
                            </div>
                            <p className="flex-shrink-0 font-headline text-sm font-bold text-on-surface">
                              {formatCents(item.unitPrice * item.qty)}
                            </p>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-4 space-y-1 border-t border-outline-variant/10 pt-3">
                        <div className="flex justify-between text-sm text-on-surface-variant">
                          <span>Subtotal</span>
                          <span>{formatCents(order.subtotal)}</span>
                        </div>
                        {order.discountAmount > 0 && (
                          <div className="flex justify-between text-sm text-emerald-500">
                            <span>Descuento</span>
                            <span>− {formatCents(order.discountAmount)}</span>
                          </div>
                        )}
                        {order.deliveryFee > 0 && (
                          <div className="flex justify-between text-sm text-on-surface-variant">
                            <span>Envío</span>
                            <span>{formatCents(order.deliveryFee)}</span>
                          </div>
                        )}
                        {order.tipAmount && order.tipAmount > 0 ? (
                          <div className="flex justify-between text-sm text-on-surface-variant">
                            <span>Propina</span>
                            <span>{formatCents(order.tipAmount)}</span>
                          </div>
                        ) : null}
                        {order.appFeeAmount && order.appFeeAmount > 0 ? (
                          <div className="flex justify-between text-sm text-on-surface-variant">
                            <span>Uso de aplicación</span>
                            <span>{formatCents(order.appFeeAmount)}</span>
                          </div>
                        ) : null}
                        <div className="flex justify-between border-t border-outline-variant/20 pt-2 text-base font-bold">
                          <span className="text-on-surface">Total</span>
                          <span className="font-headline text-primary">
                            {formatCents(order.total)}
                          </span>
                        </div>
                      </div>
                    </section>

                    {/* Notes */}
                    {order.notes && (
                      <section className="rounded-2xl border border-secondary/30 bg-secondary/5 p-4">
                        <h3 className="mb-1 font-headline text-[10px] font-bold uppercase tracking-[0.25em] text-secondary">
                          Notas del cliente
                        </h3>
                        <p className="text-sm italic text-on-surface">{order.notes}</p>
                      </section>
                    )}

                    {/* Rating */}
                    {order.rating && (
                      <section className="rounded-2xl border border-secondary/30 bg-secondary/5 p-4">
                        <h3 className="mb-2 font-headline text-[10px] font-bold uppercase tracking-[0.25em] text-secondary">
                          Calificación del cliente
                        </h3>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <span key={n} className={n <= order.rating! ? "text-secondary" : "text-on-surface-variant/20"}>
                                ★
                              </span>
                            ))}
                          </div>
                          <span className="text-sm font-bold text-secondary">
                            {order.rating}/5
                          </span>
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </div>

              {/* Footer actions */}
              {order && (next || canCancel) && (
                <div className="border-t border-outline-variant/10 bg-surface-container-high/50 p-4 sm:p-5">
                  <AnimatePresence mode="wait">
                    {confirmingCancel ? (
                      /* ── Confirm cancel with reason ── */
                      <motion.div
                        key="confirm"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18 }}
                        className="flex flex-col gap-3"
                      >
                        <div className="flex items-center gap-2 rounded-xl bg-error/10 px-3 py-2.5 text-sm text-error">
                          <AlertTriangle size={15} className="flex-shrink-0" />
                          <span className="font-semibold">
                            ¿Cancelar pedido #{order.orderNumber}?
                          </span>
                        </div>

                        {/* Quick reason buttons */}
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            "Producto agotado",
                            "Fuera de zona",
                            "Pedido duplicado",
                            "Cliente solicitó cancelar",
                          ].map((reason) => (
                            <button
                              key={reason}
                              type="button"
                              onClick={() => setCancelReason(reason)}
                              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                                cancelReason === reason
                                  ? "border-error bg-error/15 text-error"
                                  : "border-outline-variant/25 text-on-surface-variant hover:border-error/40 hover:text-error"
                              }`}
                            >
                              {reason}
                            </button>
                          ))}
                        </div>

                        {/* Custom reason input */}
                        <input
                          type="text"
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Motivo de cancelación (se muestra al cliente)..."
                          className="w-full rounded-xl border border-outline-variant/30 bg-surface px-3 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:border-error focus:outline-none focus:ring-1 focus:ring-error"
                        />

                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setConfirmingCancel(false);
                              setCancelReason("");
                            }}
                            disabled={cancelMut.isPending}
                            className="flex-1 rounded-xl border border-outline-variant/25 px-4 py-2.5 font-headline text-xs font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:border-outline-variant hover:text-tertiary disabled:opacity-50"
                          >
                            No, volver
                          </button>
                          <button
                            onClick={() =>
                              cancelMut.mutate({ id: order.id, reason: cancelReason })
                            }
                            disabled={cancelMut.isPending || !cancelReason.trim()}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-error px-4 py-2.5 font-headline text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-error/25 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                          >
                            {cancelMut.isPending ? (
                              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                              <>
                                <X size={13} /> Cancelar pedido
                              </>
                            )}
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      /* ── Normal actions ── */
                      <motion.div
                        key="actions"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.18 }}
                        className="flex items-center gap-2"
                      >
                        {/* Cancel button — left side */}
                        {canCancel && (
                          <button
                            onClick={() => setConfirmingCancel(true)}
                            className="flex items-center gap-1.5 rounded-xl border border-error/30 px-3 py-2.5 font-headline text-xs font-bold uppercase tracking-wider text-error transition-colors hover:bg-error/10"
                          >
                            <X size={13} />
                            Cancelar
                          </button>
                        )}

                        {/* Spacer when no next status */}
                        {!next && <div className="flex-1" />}

                        {/* Close — only when there's no advance button */}
                        {!next && (
                          <button
                            onClick={onClose}
                            className="rounded-xl border border-outline-variant/25 px-4 py-2.5 font-headline text-xs font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:border-outline-variant hover:text-tertiary"
                          >
                            Cerrar
                          </button>
                        )}

                        {/* Advance button */}
                        {next && (
                          <button
                            onClick={() => advanceMut.mutate({ id: order.id, status: next })}
                            disabled={advanceMut.isPending}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-headline text-xs font-bold uppercase tracking-wider text-on-primary shadow-lg shadow-primary/25 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
                          >
                            {advanceMut.isPending ? (
                              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-on-primary border-t-transparent" />
                            ) : (
                              <>Avanzar → {STATUS_META[next].label}</>
                            )}
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function TransferProofPreview({
  proofUrl,
  uploadedAt,
}: {
  proofUrl: string | null;
  uploadedAt: string | null;
}) {
  if (!proofUrl) {
    return (
      <p className="mt-2 text-xs text-on-surface-variant/70">
        El cliente aún no ha subido su comprobante.
      </p>
    );
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
  const fullUrl = proofUrl.startsWith("http") ? proofUrl : `${apiBase}${proofUrl}`;
  const isPdf = /\.pdf(\?|$)/i.test(proofUrl);

  return (
    <div className="mt-2 space-y-2">
      <div className="overflow-hidden rounded-lg border border-outline-variant/20 bg-surface">
        {isPdf ? (
          <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-on-surface-variant/70">
            <FileCheck2 size={16} />
            Comprobante en PDF
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fullUrl}
            alt="Comprobante de transferencia"
            className="block max-h-64 w-full object-contain"
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-on-surface-variant/70">
        {uploadedAt && (
          <span>
            Subido{" "}
            {new Date(uploadedAt).toLocaleString("es-MX", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
        <a
          href={fullUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
        >
          <ExternalLink size={11} />
          Abrir
        </a>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/*  DriverAssignmentSection — admin asigna repartidor a un pedido */
/* ──────────────────────────────────────────────────────────── */

function DriverAssignmentSection({
  orderId,
  driver,
  adminToken,
}: {
  orderId: string;
  driver: {
    id: string;
    name: string;
    phone: string | null;
    photoUrl: string | null;
    vehicle: string | null;
  } | null;
  adminToken: string;
}) {
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);

  const { data: drivers = [] } = useQuery({
    queryKey: ["admin-drivers-active"],
    queryFn: () =>
      api.get<
        Array<{
          id: string;
          name: string;
          vehicle: string | null;
          active: boolean;
          onShift: boolean;
          activeOrderCount?: number;
        }>
      >("/api/admin/drivers", adminToken),
    enabled: picking || !driver,
  });

  const assign = useMutation({
    mutationFn: (driverId: string) =>
      api.post(`/api/admin/orders/${orderId}/driver`, { driverId }, adminToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-order", orderId] });
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      setPicking(false);
    },
  });

  const unassign = useMutation({
    mutationFn: () =>
      api.delete(`/api/admin/orders/${orderId}/driver`, adminToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-order", orderId] });
    },
  });

  if (driver && !picking) {
    return (
      <section className="rounded-2xl border border-outline-variant/10 bg-surface-container-high p-4">
        <h3 className="mb-3 font-headline text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant/60">
          Repartidor asignado
        </h3>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 font-headline text-sm font-bold text-primary">
            {driver.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={driver.photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              driver.name.slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-headline text-sm font-bold text-tertiary">
              {driver.name}
            </p>
            <p className="truncate text-[11px] text-on-surface-variant">
              {driver.vehicle || "Sin vehículo"}
            </p>
          </div>
          {driver.phone && (
            <a
              href={`tel:${driver.phone}`}
              className="rounded-lg border border-outline-variant/20 p-1.5 text-on-surface-variant hover:border-primary/40 hover:text-primary"
              aria-label="Llamar"
            >
              <Phone size={13} />
            </a>
          )}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setPicking(true)}
            className="flex-1 rounded-xl border border-outline-variant/20 px-3 py-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:border-primary/40"
          >
            Cambiar
          </button>
          <button
            onClick={() => {
              if (confirm("¿Quitar repartidor del pedido?")) unassign.mutate();
            }}
            className="rounded-xl border border-outline-variant/20 px-3 py-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:border-error/40 hover:text-error"
          >
            Quitar
          </button>
        </div>
      </section>
    );
  }

  // No assignment, or picking mode
  return (
    <section className="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4">
      <h3 className="mb-3 font-headline text-[10px] font-bold uppercase tracking-[0.25em] text-primary">
        {driver ? "Cambiar repartidor" : "Sin repartidor asignado"}
      </h3>

      {drivers.filter((d) => d.active).length === 0 ? (
        <p className="text-xs text-on-surface-variant">
          No hay repartidores activos. Crea uno desde Repartidores.
        </p>
      ) : (
        <div className="space-y-1.5">
          {drivers
            .filter((d) => d.active)
            .map((d) => (
              <button
                key={d.id}
                onClick={() => assign.mutate(d.id)}
                disabled={assign.isPending || d.id === driver?.id}
                className="flex w-full items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-container px-3 py-2 text-left transition-all hover:border-primary/40 disabled:opacity-40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-on-surface">
                    {d.name}
                  </span>
                  <span className="block truncate text-[10px] text-on-surface-variant">
                    {d.vehicle || "Sin vehículo"} ·{" "}
                    {(d.activeOrderCount ?? 0)} pedidos activos
                  </span>
                </span>
                <span
                  className={`ml-2 flex-shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                    d.onShift
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-on-surface-variant/15 text-on-surface-variant"
                  }`}
                >
                  {d.onShift ? "En turno" : "Offline"}
                </span>
              </button>
            ))}
        </div>
      )}

      {picking && driver && (
        <button
          onClick={() => setPicking(false)}
          className="mt-2 w-full rounded-xl border border-outline-variant/20 px-3 py-1.5 text-xs font-bold text-on-surface-variant"
        >
          Cancelar
        </button>
      )}
    </section>
  );
}
