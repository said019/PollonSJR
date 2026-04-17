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
  CreditCard,
  Landmark,
  MapPin,
  Package,
  Phone,
  Truck,
  User,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

const STATUS_META: Record<
  OrderStatusType,
  { label: string; icon: React.ReactNode; color: string }
> = {
  PENDING_PAYMENT: { label: "Pendiente de pago", icon: <Clock size={14} />, color: "text-amber-400 bg-amber-400/15" },
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
                                  Paga con: {formatCents(Math.round(order.cashAmount * 100))}
                                </p>
                              )}
                            {order.payment && (
                              <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">
                                {order.payment.status}
                              </p>
                            )}
                          </div>
                        </div>
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
                        {order.deliveryFee > 0 && (
                          <div className="flex justify-between text-sm text-on-surface-variant">
                            <span>Envío</span>
                            <span>{formatCents(order.deliveryFee)}</span>
                          </div>
                        )}
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
