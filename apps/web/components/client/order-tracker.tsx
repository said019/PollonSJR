"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useSocket } from "@/hooks/useSocket";
import type { OrderDetail, OrderStatusType } from "@pollon/types";
import { formatCents } from "@pollon/utils";
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Banknote,
  Bell,
  CheckCircle,
  ChefHat,
  Clock,
  CreditCard,
  FileCheck2,
  Home,
  Landmark,
  Loader2,
  Package,
  Share2,
  ShoppingBag,
  Sparkles,
  Truck,
  Upload,
  X,
  Star,
  RotateCcw,
  RefreshCw,
  MessageCircle,
} from "lucide-react";
import {
  notificationPermission,
  requestNotificationPermission,
} from "@/lib/customer-notifications";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

type Step = {
  status: OrderStatusType;
  label: string;
  short: string;
  icon: React.ReactNode;
  vibe: string; // short tagline shown on the Rappi-style pill
};

const STATUS_STEPS: Step[] = [
  { status: "RECEIVED",   label: "Recibido",   short: "Recibido",   icon: <CheckCircle size={18} />, vibe: "Recibimos tu pedido" },
  { status: "PREPARING",  label: "Preparando", short: "Cocinando",  icon: <ChefHat size={18} />,     vibe: "Estamos cocinando con fuego" },
  { status: "READY",      label: "Listo",      short: "Listo",      icon: <Package size={18} />,     vibe: "Tu pedido está listo" },
  { status: "ON_THE_WAY", label: "En camino",  short: "En camino",  icon: <Truck size={18} />,       vibe: "Tu pedido ya va en camino" },
  { status: "DELIVERED",  label: "Entregado",  short: "Entregado",  icon: <CheckCircle size={18} />, vibe: "Disfruta tu pedido" },
];

const PAYMENT_LABELS = {
  CARD: "Pago con tarjeta",
  CASH: "Efectivo",
  TRANSFER: "Transferencia",
} as const;

export function OrderTracker({ orderId }: { orderId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    setToken(getToken());
  }, []);
  const pagoParam = searchParams.get("pago"); // "exitoso" | "error" | "pendiente" | null
  const [currentStatus, setCurrentStatus] = useState<OrderStatusType | null>(null);
  const [showExpandedTracker, setShowExpandedTracker] = useState(false);

  const isPendingPayment = currentStatus === "PENDING_PAYMENT";

  const { data: order, isLoading, refetch } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api.get<OrderDetail>(`/api/orders/${orderId}`, token || undefined),
    enabled: !!token,
    refetchOnMount: "always",
    // Auto-poll while still waiting for payment confirmation
    refetchInterval: isPendingPayment ? 3_000 : false,
  });

  useEffect(() => {
    if (order) setCurrentStatus(order.status);
  }, [order]);

  useSocket("order:status", ({ orderId: id, status }) => {
    if (id === orderId) {
      setCurrentStatus(status);
      // Refetch full order to get cancelReason and updated details
      void refetch();
    }
  });

  const activeStep = STATUS_STEPS.findIndex((s) => s.status === currentStatus);
  const currentStep = activeStep >= 0 ? STATUS_STEPS[activeStep] : STATUS_STEPS[0];
  const progressPct = activeStep < 0 ? 0 : ((activeStep + 1) / STATUS_STEPS.length) * 100;
  const isDelivered = currentStatus === "DELIVERED";
  const isCancelled = currentStatus === "CANCELLED";
  const isActive =
    !!currentStatus && !["DELIVERED", "CANCELLED"].includes(currentStatus);
  // Customer can self-cancel only before the kitchen picks it up.
  const canCustomerCancel =
    currentStatus === "PENDING_PAYMENT" || currentStatus === "RECEIVED";

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
        <div className="text-5xl opacity-50">🤔</div>
        <p className="text-on-surface-variant">Pedido no encontrado.</p>
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-2 rounded-2xl border border-outline-variant/30 bg-surface-container px-5 py-3 font-headline text-sm font-bold uppercase tracking-wider text-tertiary transition-all hover:border-primary hover:text-primary"
        >
          <Home size={16} />
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-surface">
      <div className="pointer-events-none fixed inset-0 z-0 grain" />

      {/* Header with back + home navigation */}
      <header className="sticky top-0 z-30 border-b border-outline-variant/10 bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              aria-label="Volver al inicio"
              className="flex-shrink-0 rounded-xl border border-outline-variant/20 bg-surface-container p-2 text-on-surface-variant transition-all hover:border-primary/40 hover:text-primary"
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="min-w-0">
              <h1 className="font-headline text-base font-extrabold leading-tight tracking-tight text-tertiary">
                Pedido #{order.orderNumber}
              </h1>
              <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
                {order.type === "DELIVERY" ? "Envío a domicilio" : "Recoger en tienda"}
              </p>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-1.5">
            {isActive && <ShareTrackingButton orderNumber={order.orderNumber} />}
            <Link
              href="/menu"
              className="flex items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 font-headline text-xs font-bold uppercase tracking-wider text-primary transition-all hover:bg-primary/20"
            >
              <ShoppingBag size={14} />
              <span className="hidden sm:inline">Seguir</span>
              <span className="sm:hidden">Menú</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-2xl px-4 pb-32 pt-6">
        {isActive && <NotificationOptInBanner />}

        {/* ═══════════════════════════════════════════════════════ */}
        {/*  PENDING_PAYMENT — waiting for MP webhook (CARD only)   */}
        {/* ═══════════════════════════════════════════════════════ */}
        {currentStatus === "PENDING_PAYMENT" && order.paymentMethod === "CARD" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mb-5 overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-surface-container-high to-surface-container"
          >
            <div className="flex items-center gap-4 p-5">
              <div className="relative flex-shrink-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-dim shadow-lg shadow-primary/30">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  >
                    <Loader2 size={22} className="text-on-primary" />
                  </motion.div>
                </div>
                <motion.span
                  className="absolute inset-0 rounded-2xl border-2 border-primary"
                  animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-headline text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                  {pagoParam === "exitoso" ? "Pago recibido" : "Procesando"}
                </span>
                <p className="mt-0.5 font-headline text-lg font-extrabold leading-tight text-tertiary">
                  {pagoParam === "exitoso"
                    ? "Confirmando tu pago…"
                    : pagoParam === "pendiente"
                      ? "Tu pago está en revisión"
                      : "Procesando tu pago…"}
                </p>
                <p className="mt-0.5 text-[11px] text-on-surface-variant/70">
                  {pagoParam === "exitoso"
                    ? "Mercado Pago confirmó el pago. Activando tu pedido."
                    : "En unos segundos te confirmamos el estado."}
                </p>
              </div>
            </div>
            {/* Shimmer progress bar */}
            <div className="relative h-1 w-full overflow-hidden bg-surface-variant/50">
              <motion.div
                className="absolute inset-y-0 h-full w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent"
                animate={{ x: ["-100%", "400%"] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
              />
            </div>

            {/* Retry payment button — shown only if pago=error or after 30s */}
            {(pagoParam === "error" || pagoParam === "fallido") && (
              <RetryPaymentButton orderId={order.id} />
            )}
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/*  TRANSFER + PENDING_PAYMENT — comprobante upload flow   */}
        {/* ═══════════════════════════════════════════════════════ */}
        {currentStatus === "PENDING_PAYMENT" &&
          order.paymentMethod === "TRANSFER" && (
            <TransferPendingBanner
              hasProof={!!order.transferProofUrl}
              uploadedAt={order.transferProofUploadedAt ?? null}
            />
          )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/*  Rappi-style status pill — clickable to open full view  */}
        {/* ═══════════════════════════════════════════════════════ */}
        {!isCancelled && currentStatus !== "PENDING_PAYMENT" && (
          <motion.button
            layout
            onClick={() => setShowExpandedTracker(true)}
            className="group mb-5 w-full overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-surface-container-high to-surface-container text-left transition-all hover:border-primary/40"
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
          >
            <div className="flex items-center gap-4 p-4 sm:p-5">
              {/* Animated status icon */}
              <div className="relative flex-shrink-0">
                <motion.div
                  key={currentStatus}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", damping: 15, stiffness: 220 }}
                  className={`relative flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg ${
                    isDelivered
                      ? "bg-gradient-to-br from-green-400 to-green-600 text-white"
                      : "bg-gradient-to-br from-primary to-primary-dim text-on-primary"
                  }`}
                >
                  <motion.div
                    animate={
                      isDelivered
                        ? { rotate: 0 }
                        : { rotate: [0, -8, 8, -5, 5, 0] }
                    }
                    transition={
                      isDelivered
                        ? { duration: 0 }
                        : { duration: 1.8, repeat: Infinity, repeatDelay: 1.5 }
                    }
                  >
                    {currentStep.icon}
                  </motion.div>
                </motion.div>

                {/* Pulse ring for in-progress states */}
                {!isDelivered && (
                  <motion.span
                    className="absolute inset-0 rounded-2xl border-2 border-primary"
                    animate={{
                      scale: [1, 1.25, 1],
                      opacity: [0.6, 0, 0.6],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeOut",
                    }}
                  />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-headline text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                    {isDelivered ? "Completado" : "En curso"}
                  </span>
                  {!isDelivered && (
                    <motion.span
                      className="flex h-1.5 w-1.5 rounded-full bg-primary"
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    />
                  )}
                  {!isDelivered &&
                    !isCancelled &&
                    typeof (order as any).estimatedMinutes === "number" &&
                    (order as any).estimatedMinutes > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 font-headline text-[10px] font-bold uppercase tracking-wider text-primary">
                        <Clock size={10} />
                        ~{(order as any).estimatedMinutes} min
                      </span>
                    )}
                </div>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={currentStatus}
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -8, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="mt-0.5 font-headline text-lg font-extrabold leading-tight text-tertiary sm:text-xl"
                  >
                    {currentStep.vibe}
                  </motion.p>
                </AnimatePresence>
                <p className="mt-0.5 text-[11px] font-medium text-on-surface-variant/70">
                  Toca para ver el detalle del estado
                </p>
              </div>

              <motion.div
                className="flex-shrink-0 text-on-surface-variant/50 transition-colors group-hover:text-primary"
                animate={{ x: [0, 3, 0] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              >
                <Sparkles size={18} />
              </motion.div>
            </div>

            {/* Progress bar */}
            <div className="relative h-1.5 w-full bg-surface-variant/50">
              <motion.div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-primary to-secondary"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
              {!isDelivered && (
                <motion.div
                  className="absolute inset-y-0 h-full w-16 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  animate={{ x: ["-100%", "400%"] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
                />
              )}
            </div>

            {/* Step icons */}
            <div className="flex items-center justify-between px-4 py-2.5 sm:px-5">
              {STATUS_STEPS.map((step, i) => {
                const done = i <= activeStep;
                return (
                  <div
                    key={step.status}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                        done
                          ? "bg-primary text-on-primary"
                          : "bg-surface-variant/50 text-on-surface-variant/40"
                      }`}
                    >
                      {step.icon}
                    </div>
                    <span
                      className={`text-[9px] font-bold uppercase tracking-wider ${
                        done ? "text-primary" : "text-on-surface-variant/40"
                      }`}
                    >
                      {step.short}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.button>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/*  Post-delivery celebration — shown when DELIVERED       */}
        {/* ═══════════════════════════════════════════════════════ */}
        {isDelivered && order && (
          <CelebrationCard order={order} token={token} />
        )}

        {/* Cancelled banner */}
        {isCancelled && (
          <div className="mb-5 overflow-hidden rounded-2xl border border-error/30 bg-error/10">
            <div className="flex items-center gap-3 p-5">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-error/20 text-error">
                <X size={22} />
              </div>
              <div>
                <h2 className="font-headline font-bold text-error">Pedido cancelado</h2>
                <p className="text-sm text-on-surface-variant/70">
                  Si fue un error, contáctanos por WhatsApp.
                </p>
              </div>
            </div>
            {order?.cancelReason && (
              <div className="border-t border-error/15 bg-error/5 px-5 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-error/60">
                  Motivo
                </p>
                <p className="mt-0.5 text-sm font-medium text-on-surface">
                  {order.cancelReason}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Payment card */}
        {order.paymentMethod && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-5 rounded-2xl border border-outline-variant/15 bg-surface-container p-5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                {order.paymentMethod === "CARD" ? (
                  <CreditCard size={19} />
                ) : order.paymentMethod === "TRANSFER" ? (
                  <Landmark size={19} />
                ) : (
                  <Banknote size={19} />
                )}
              </div>
              <div>
                <h2 className="font-headline font-bold text-tertiary">
                  {PAYMENT_LABELS[order.paymentMethod]}
                </h2>
                <p className="text-sm text-on-surface-variant/80">
                  {order.paymentMethod === "TRANSFER"
                    ? "Usa estos datos para completar tu pago."
                    : order.paymentMethod === "CASH"
                      ? order.type === "PICKUP"
                        ? "Paga en sucursal al recoger."
                        : "Paga en efectivo al recibir."
                      : "Tu pago se procesa con tarjeta."}
                </p>
              </div>
            </div>

            {order.paymentMethod === "TRANSFER" && order.transferInfo && (
              <div className="mt-4 grid gap-2 rounded-xl bg-surface p-3.5 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-on-surface-variant">Banco</span>
                  <span className="font-semibold text-on-surface">{order.transferInfo.bank}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-on-surface-variant">Titular</span>
                  <span className="text-right font-semibold text-on-surface">
                    {order.transferInfo.accountHolder}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-on-surface-variant">CLABE</span>
                  <span className="font-mono font-semibold text-on-surface">
                    {order.transferInfo.clabe || "Configurar CLABE"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-on-surface-variant">Concepto</span>
                  <span className="font-semibold text-on-surface">{order.transferInfo.concept}</span>
                </div>
                <div className="flex justify-between gap-3 border-t border-outline-variant/20 pt-2">
                  <span className="text-on-surface-variant">Monto</span>
                  <span className="font-headline font-bold text-primary">
                    {formatCents(Math.round(order.transferInfo.amount * 100))}
                  </span>
                </div>
              </div>
            )}

            {order.paymentMethod === "TRANSFER" &&
              currentStatus === "PENDING_PAYMENT" && (
                <TransferProofUploader
                  orderId={order.id}
                  token={token}
                  initialProofUrl={order.transferProofUrl ?? null}
                  onUploaded={() => void refetch()}
                />
              )}
          </motion.div>
        )}

        {/* Items detail */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border border-outline-variant/15 bg-surface-container p-5"
        >
          <h2 className="mb-3 font-headline font-bold text-tertiary">Detalle</h2>
          {order.items.map((item) => (
            <div
              key={item.id}
              className="flex justify-between border-b border-outline-variant/10 py-2 last:border-0"
            >
              <div>
                <p className="text-sm font-medium text-on-surface">
                  {item.qty}x {item.productName}
                  {item.variant && (
                    <span className="ml-1 text-on-surface-variant">({item.variant})</span>
                  )}
                </p>
              </div>
              <p className="text-sm font-bold text-on-surface">
                {formatCents(item.unitPrice * item.qty)}
              </p>
            </div>
          ))}

          <div className="mt-4 space-y-1">
            <div className="flex justify-between text-sm text-on-surface-variant">
              <span>Subtotal</span>
              <span>{formatCents(order.subtotal)}</span>
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-sm text-green-400">
                <span>Descuento</span>
                <span>-{formatCents(order.discountAmount)}</span>
              </div>
            )}
            {order.deliveryFee > 0 && (
              <div className="flex justify-between text-sm text-on-surface-variant">
                <span>Envío</span>
                <span>{formatCents(order.deliveryFee)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-outline-variant/20 pt-2 text-lg font-bold">
              <span className="text-on-surface">Total</span>
              <span className="text-primary">{formatCents(order.total)}</span>
            </div>
          </div>
        </motion.div>

        {canCustomerCancel && (
          <CancelOrderButton
            orderId={order.id}
            orderNumber={order.orderNumber}
            token={token}
            onCancelled={() => void refetch()}
          />
        )}
      </main>

      {/* Sticky bottom CTA — always-visible exit */}
      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-surface via-surface/95 to-transparent p-4 pt-10">
        <div className="pointer-events-auto mx-auto flex max-w-2xl gap-2.5">
          <Link
            href="/"
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-outline-variant/25 bg-surface-container/90 py-3.5 font-headline text-sm font-bold uppercase tracking-wider text-tertiary backdrop-blur-xl transition-all hover:border-primary/40 hover:text-primary"
          >
            <Home size={16} />
            Inicio
          </Link>
          <Link
            href="/menu"
            className="flex flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 font-headline text-sm font-bold uppercase tracking-wider text-on-primary shadow-xl shadow-primary/30 transition-all active:scale-[0.98]"
          >
            <ShoppingBag size={16} />
            Seguir comprando
          </Link>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  Expanded Rappi-style modal — full status progression       */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <ExpandedTrackerModal
        open={showExpandedTracker}
        onClose={() => setShowExpandedTracker(false)}
        activeStep={activeStep}
        currentStep={currentStep}
        isDelivered={isDelivered}
        orderNumber={order.orderNumber}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  CelebrationCard — rating + share for delivered orders          */
/* ────────────────────────────────────────────────────────────── */

function CelebrationCard({ order, token }: { order: OrderDetail; token: string | null }) {
  const [selectedRating, setSelectedRating] = useState<number>(order.rating ?? 0);
  const [hoverRating, setHoverRating] = useState(0);
  const [ratingDone, setRatingDone] = useState(!!order.rating);
  const [submitting, setSubmitting] = useState(false);

  const handleRate = async (stars: number) => {
    setSelectedRating(stars);
    const t = token || getToken();
    if (!t) return;
    setSubmitting(true);
    try {
      await api.post(`/api/orders/${order.id}/rate`, { rating: stars }, t);
      setRatingDone(true);
    } catch (err) {
      console.error("Rating error:", err);
      // Show the stars as selected anyway for UX
      setRatingDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  const shareText = `Pedí en Pollón SJR y estuvo increíble 🍗🔥 El mejor pollo frito de San Juan del Río. ¡Pide el tuyo!`;
  const shareUrl = typeof window !== "undefined" ? window.location.origin + "/menu" : "";

  const handleShare = async () => {
    // Use Web Share API if available (mobile)
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: "Pollón SJR — Pollo Frito",
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch {
        // User cancelled or not supported — fall through to WhatsApp
      }
    }
    // Fallback: WhatsApp
    window.open(
      `https://wa.me/?text=${encodeURIComponent(shareText + "\n\n" + shareUrl)}`,
      "_blank"
    );
  };

  const displayRating = hoverRating || selectedRating;

  const ratingLabels = ["", "Malo", "Regular", "Bien", "Muy bien", "Excelente"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.1 }}
      className="mb-5 overflow-hidden rounded-3xl border border-secondary/30 bg-gradient-to-br from-surface-container-high to-surface-container"
    >
      <div className="h-1.5 w-full bg-[linear-gradient(90deg,#F97316,#FACC15,#22c55e,#F97316)]" />

      <div className="px-5 py-6 text-center">
        <motion.div
          initial={{ scale: 0.5, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", damping: 10, stiffness: 200, delay: 0.2 }}
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-secondary/30 to-secondary/10 text-3xl"
        >
          🎉
        </motion.div>

        <h2 className="font-headline text-2xl font-extrabold uppercase tracking-tighter text-tertiary">
          ¡Buen provecho!
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant/80">
          Tu pedido fue entregado. Esperamos que lo disfrutes mucho.
        </p>

        {/* ── Rating stars ── */}
        <div className="mt-5">
          {ratingDone ? (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-1"
            >
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    size={22}
                    className={n <= selectedRating ? "fill-secondary text-secondary" : "text-on-surface-variant/20"}
                  />
                ))}
              </div>
              <p className="text-xs font-semibold text-secondary">
                {ratingLabels[selectedRating]} — Gracias por tu calificación
              </p>
            </motion.div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-on-surface-variant/60">¿Qué tal estuvo?</p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <motion.button
                    key={n}
                    whileTap={{ scale: 0.8 }}
                    onMouseEnter={() => setHoverRating(n)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => void handleRate(n)}
                    disabled={submitting}
                    aria-label={`${n} estrellas`}
                    className="p-1 transition-colors disabled:opacity-50"
                  >
                    <Star
                      size={28}
                      className={
                        n <= displayRating
                          ? "fill-secondary text-secondary"
                          : "text-on-surface-variant/25 hover:text-secondary/50"
                      }
                    />
                  </motion.button>
                ))}
              </div>
              {displayRating > 0 && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-xs font-semibold text-secondary"
                >
                  {ratingLabels[displayRating]}
                </motion.p>
              )}
            </div>
          )}
        </div>

        {/* ── CTAs ── */}
        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
          <Link
            href="/menu"
            className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 font-headline text-sm font-bold uppercase tracking-wider text-on-primary shadow-lg shadow-primary/25 transition-all active:scale-[0.98]"
          >
            <RotateCcw size={15} />
            Pedir de nuevo
          </Link>
          <button
            onClick={handleShare}
            className="flex items-center justify-center gap-2 rounded-2xl border border-outline-variant/25 bg-surface-container px-5 py-3 font-headline text-sm font-bold uppercase tracking-wider text-tertiary transition-all hover:border-primary/40 active:scale-[0.98]"
          >
            <MessageCircle size={15} />
            Recomendar
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  ExpandedTrackerModal — bottom sheet with animated timeline    */
/* ────────────────────────────────────────────────────────────── */
function ExpandedTrackerModal({
  open,
  onClose,
  activeStep,
  currentStep,
  isDelivered,
  orderNumber,
}: {
  open: boolean;
  onClose: () => void;
  activeStep: number;
  currentStep: Step;
  isDelivered: boolean;
  orderNumber: number;
}) {
  // Escape to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-40 bg-black"
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-label="Estado del pedido"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 240 }}
            className="fixed bottom-0 left-0 right-0 z-50 mx-auto flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-outline-variant/15 bg-surface-container shadow-2xl"
          >
            {/* Grabber */}
            <div className="flex justify-center pt-3">
              <div className="h-1 w-10 rounded-full bg-outline-variant/40" />
            </div>

            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <span className="font-headline text-[10px] font-bold uppercase tracking-[0.25em] text-primary">
                  Pedido #{orderNumber}
                </span>
                <h2 className="font-headline text-xl font-extrabold uppercase tracking-tighter text-tertiary">
                  Estado del pedido
                </h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="rounded-xl border border-outline-variant/20 p-2 text-on-surface-variant transition-colors hover:bg-surface-variant hover:text-tertiary"
              >
                <X size={18} />
              </button>
            </div>

            {/* Vibe quote */}
            <div className="mx-5 mb-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 to-primary/5 p-4">
              <div className="flex items-center gap-3">
                <motion.div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    isDelivered
                      ? "bg-green-500/20 text-green-400"
                      : "bg-primary/25 text-primary"
                  }`}
                  animate={
                    isDelivered
                      ? { scale: 1 }
                      : { scale: [1, 1.08, 1] }
                  }
                  transition={{ duration: 1.6, repeat: Infinity }}
                >
                  {currentStep.icon}
                </motion.div>
                <p className="font-headline text-sm font-bold text-tertiary sm:text-base">
                  {currentStep.vibe}
                </p>
              </div>
            </div>

            {/* Timeline */}
            <div className="scrollbar-hide overflow-y-auto px-5 pb-6">
              <div className="relative">
                {/* Connecting line */}
                <div className="absolute left-[22px] top-6 bottom-6 w-0.5 bg-outline-variant/20" />
                <motion.div
                  className="absolute left-[22px] top-6 w-0.5 bg-gradient-to-b from-primary to-primary-dim"
                  initial={{ height: 0 }}
                  animate={{
                    height: `calc(${(activeStep / (STATUS_STEPS.length - 1)) * 100}% - 12px)`,
                  }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />

                <div className="space-y-5">
                  {STATUS_STEPS.map((step, i) => {
                    const isActive = i <= activeStep;
                    const isCurrent = i === activeStep;
                    return (
                      <motion.div
                        key={step.status}
                        className="relative flex items-start gap-4"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.08 * i, duration: 0.35 }}
                      >
                        <div className="relative z-10 flex-shrink-0">
                          <motion.div
                            initial={false}
                            animate={{
                              scale: isActive ? 1 : 0.88,
                            }}
                            className={`flex h-11 w-11 items-center justify-center rounded-xl border-2 transition-colors ${
                              isActive
                                ? "border-primary bg-primary text-on-primary shadow-lg shadow-primary/40"
                                : "border-outline-variant/30 bg-surface-container-high text-on-surface-variant/50"
                            }`}
                          >
                            {step.icon}
                          </motion.div>

                          {isCurrent && !isDelivered && (
                            <motion.span
                              className="absolute inset-0 rounded-xl border-2 border-primary"
                              animate={{
                                scale: [1, 1.5, 1],
                                opacity: [0.8, 0, 0.8],
                              }}
                              transition={{
                                duration: 1.8,
                                repeat: Infinity,
                                ease: "easeOut",
                              }}
                            />
                          )}
                        </div>

                        <div className="min-w-0 flex-1 pt-1.5">
                          <h3
                            className={`font-headline text-sm font-bold uppercase tracking-tight ${
                              isActive ? "text-tertiary" : "text-on-surface-variant/50"
                            }`}
                          >
                            {step.label}
                          </h3>
                          <p
                            className={`mt-0.5 text-[12px] ${
                              isActive ? "text-on-surface-variant/80" : "text-on-surface-variant/40"
                            }`}
                          >
                            {step.vibe}
                          </p>
                          {isCurrent && !isDelivered && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.2 }}
                              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-headline font-bold uppercase tracking-wider text-primary"
                            >
                              <motion.span
                                className="h-1.5 w-1.5 rounded-full bg-primary"
                                animate={{ opacity: [1, 0.3, 1] }}
                                transition={{ duration: 1.2, repeat: Infinity }}
                              />
                              Actualmente
                            </motion.div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              {/* Footer tip */}
              <p className="mt-6 text-center text-[11px] text-on-surface-variant/50">
                El estado se actualiza en tiempo real
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Notification opt-in banner — Rappi-style status alerts         */
/* ────────────────────────────────────────────────────────────── */

function NotificationOptInBanner() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported" | null>(
    null
  );
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    setPerm(notificationPermission());
  }, []);

  if (perm !== "default") return null;

  const handleEnable = async () => {
    setRequesting(true);
    const next = await requestNotificationPermission();
    setPerm(next);
    setRequesting(false);
  };

  return (
    <motion.button
      type="button"
      onClick={handleEnable}
      disabled={requesting}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 p-3 text-left transition-colors hover:border-primary/45 active:scale-[0.99] disabled:opacity-60"
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
        <Bell size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-headline text-sm font-bold text-tertiary">
          Activa los avisos de tu pedido
        </p>
        <p className="text-[11px] text-on-surface-variant/80">
          Te avisamos cuando esté en cocina, listo y en camino.
        </p>
      </div>
      <span className="flex-shrink-0 rounded-lg bg-primary px-3 py-1.5 font-headline text-[10px] font-bold uppercase tracking-wider text-on-primary">
        {requesting ? "..." : "Activar"}
      </span>
    </motion.button>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Transfer payment — pending banner + proof uploader            */
/* ────────────────────────────────────────────────────────────── */

function TransferPendingBanner({
  hasProof,
  uploadedAt,
}: {
  hasProof: boolean;
  uploadedAt: string | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mb-5 overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-surface-container-high to-surface-container"
    >
      <div className="flex items-center gap-4 p-5">
        <div className="relative flex-shrink-0">
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg ${
              hasProof
                ? "bg-gradient-to-br from-green-500 to-green-600 shadow-green-500/30"
                : "bg-gradient-to-br from-primary to-primary-dim shadow-primary/30"
            }`}
          >
            {hasProof ? (
              <FileCheck2 size={22} className="text-white" />
            ) : (
              <Upload size={22} className="text-on-primary" />
            )}
          </div>
          {!hasProof && (
            <motion.span
              className="absolute inset-0 rounded-2xl border-2 border-primary"
              animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span
            className={`font-headline text-[10px] font-bold uppercase tracking-[0.2em] ${
              hasProof ? "text-green-400" : "text-primary"
            }`}
          >
            {hasProof ? "Comprobante recibido" : "Esperando comprobante"}
          </span>
          <p className="mt-0.5 font-headline text-lg font-extrabold leading-tight text-tertiary">
            {hasProof
              ? "Estamos verificando tu pago"
              : "Sube tu comprobante de transferencia"}
          </p>
          <p className="mt-0.5 text-[11px] text-on-surface-variant/70">
            {hasProof
              ? uploadedAt
                ? `Recibido ${new Date(uploadedAt).toLocaleString("es-MX", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}. En cuanto lo confirmemos, tu pedido entra a cocina.`
                : "En cuanto lo confirmemos, tu pedido entra a cocina."
              : "Tu pedido empezará a prepararse cuando confirmemos el pago."}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function TransferProofUploader({
  orderId,
  token,
  initialProofUrl,
  onUploaded,
}: {
  orderId: string;
  token: string | null;
  initialProofUrl: string | null;
  onUploaded: () => void;
}) {
  const [proofUrl, setProofUrl] = useState<string | null>(initialProofUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProofUrl(initialProofUrl);
  }, [initialProofUrl]);

  const apiBase =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const fullProofUrl = proofUrl
    ? proofUrl.startsWith("http")
      ? proofUrl
      : `${apiBase}${proofUrl}`
    : null;

  const handleFile = useCallback(
    async (file: File) => {
      if (!token) return;
      setError(null);

      const allowed = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/heic",
        "application/pdf",
      ];
      if (!allowed.includes(file.type)) {
        setError("Sube una imagen (JPG/PNG/WEBP) o PDF.");
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        setError("El archivo no puede pesar más de 8 MB.");
        return;
      }

      const form = new FormData();
      form.append("file", file);

      setUploading(true);
      try {
        const res = await fetch(
          `${apiBase}/api/orders/${orderId}/transfer-proof`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Error ${res.status}`);
        }
        setProofUrl(data.transferProofUrl);
        onUploaded();
      } catch (err: any) {
        setError(err.message || "No se pudo subir el comprobante");
      } finally {
        setUploading(false);
      }
    },
    [apiBase, orderId, token, onUploaded]
  );

  const inputId = `transfer-proof-${orderId}`;

  return (
    <div className="mt-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
            proofUrl
              ? "bg-green-500/15 text-green-400"
              : "bg-primary/15 text-primary"
          }`}
        >
          {proofUrl ? <FileCheck2 size={19} /> : <Upload size={19} />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-headline text-sm font-bold uppercase tracking-tight text-tertiary">
            {proofUrl ? "Comprobante enviado" : "Sube tu comprobante"}
          </h3>
          <p className="mt-0.5 text-[12px] text-on-surface-variant/80">
            {proofUrl
              ? "Estamos verificando tu pago. Puedes reemplazarlo si te equivocaste."
              : "JPG, PNG, WEBP o PDF. Máximo 8 MB."}
          </p>

          {fullProofUrl && (
            <a
              href={fullProofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/25 bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-on-surface transition-colors hover:border-primary/40 hover:text-primary"
            >
              <FileCheck2 size={12} />
              Ver comprobante
            </a>
          )}

          {error && (
            <p className="mt-2 text-[11px] font-semibold text-error">{error}</p>
          )}

          <label
            htmlFor={inputId}
            className={`mt-3 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 font-headline text-xs font-bold uppercase tracking-wider transition-all ${
              uploading
                ? "cursor-wait bg-surface-variant/50 text-on-surface-variant/60"
                : proofUrl
                  ? "cursor-pointer border border-outline-variant/25 bg-surface-container text-tertiary hover:border-primary/40"
                  : "cursor-pointer bg-primary text-on-primary shadow-lg shadow-primary/25 active:scale-[0.98]"
            }`}
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Subiendo…
              </>
            ) : (
              <>
                <Upload size={14} />
                {proofUrl ? "Reemplazar" : "Subir comprobante"}
              </>
            )}
          </label>
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            className="hidden"
            disabled={uploading || !token}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  CancelOrderButton — customer self-cancel before kitchen takes  */
/* ────────────────────────────────────────────────────────────── */

function CancelOrderButton({
  orderId,
  orderNumber,
  token,
  onCancelled,
}: {
  orderId: string;
  orderNumber: number;
  token: string | null;
  onCancelled: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async () => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(
        `/api/orders/${orderId}/cancel`,
        { reason: reason.trim() || undefined },
        token
      );
      setConfirming(false);
      setReason("");
      onCancelled();
    } catch (err: any) {
      setError(err.message || "No se pudo cancelar el pedido");
    } finally {
      setSubmitting(false);
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-outline-variant/25 bg-surface-container/70 py-3 font-headline text-xs font-bold uppercase tracking-wider text-on-surface-variant transition-all hover:border-error/40 hover:text-error"
      >
        <Ban size={14} />
        Cancelar pedido
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-4 rounded-2xl border border-error/30 bg-error/5 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-error/15 text-error">
          <Ban size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-headline text-sm font-bold uppercase tracking-tight text-tertiary">
            ¿Cancelar el pedido #{orderNumber}?
          </h3>
          <p className="mt-0.5 text-[12px] text-on-surface-variant/80">
            Esto no se puede deshacer. Sólo puedes cancelar antes de que tu
            pedido pase a cocina.
          </p>

          <textarea
            rows={2}
            maxLength={200}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="¿Motivo? (opcional)"
            className="mt-3 w-full rounded-lg border border-outline-variant/25 bg-surface-container p-2.5 text-sm text-on-surface outline-none focus:border-error/50"
          />

          {error && (
            <p className="mt-2 text-[12px] font-semibold text-error">{error}</p>
          )}

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setReason("");
                setError(null);
              }}
              disabled={submitting}
              className="rounded-xl border border-outline-variant/25 px-3 py-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant"
            >
              No, conservar
            </button>
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-error px-3 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-error/25 active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Ban size={12} />
              )}
              Sí, cancelar
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Retry payment (CARD) ────────────────────────────────── */

function RetryPaymentButton({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRetry = async () => {
    const token = getToken();
    if (!token) {
      setError("Inicia sesión para reintentar el pago");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { checkoutUrl } = await api.post<{
        preferenceId: string;
        checkoutUrl: string;
      }>("/api/payments/create", { orderId }, token);
      window.location.href = checkoutUrl;
    } catch (err: any) {
      setError(err.message || "No se pudo generar el link de pago.");
      setLoading(false);
    }
  };

  return (
    <div className="border-t border-outline-variant/15 p-4">
      <button
        type="button"
        onClick={handleRetry}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#009EE3] py-2.5 font-headline text-sm font-bold text-white shadow-lg shadow-[#009EE3]/25 active:scale-[0.98] disabled:opacity-60"
      >
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <RefreshCw size={14} />
        )}
        Reintentar pago
      </button>
      {error && <p className="mt-2 text-center text-xs text-error">{error}</p>}
    </div>
  );
}

/* ─── Share tracking link ─────────────────────────────────── */

function ShareTrackingButton({ orderNumber }: { orderNumber: number }) {
  const handleShare = async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const text = `Sigue mi pedido #${orderNumber} de Pollón SJR en tiempo real`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Mi pedido Pollón", text, url });
        return;
      } catch {
        // user cancelled — fall through to WhatsApp
      }
    }
    const wa = `https://wa.me/?text=${encodeURIComponent(text + "\n" + url)}`;
    window.open(wa, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className="inline-flex items-center gap-1.5 rounded-xl border border-outline-variant/25 bg-surface-container px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-on-surface-variant hover:border-primary/40 hover:text-primary"
    >
      <Share2 size={12} />
      Compartir mi pedido
    </button>
  );
}
