"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCart } from "@/hooks/useCart";
import { useDelivery } from "@/hooks/useDelivery";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import type {
  CreateOrderResponse,
  LoyaltyInfo,
  PaymentMethodType,
} from "@pollon/types";
import { formatCents } from "@pollon/utils";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  CreditCard,
  Gift,
  Landmark,
  Loader2,
  ShieldCheck,
  Lock,
  ExternalLink,
  Ticket,
  Heart,
  Check,
} from "lucide-react";
import { DeliveryMap } from "./delivery-map";

const checkoutSchema = z.object({
  type: z.enum(["DELIVERY", "PICKUP"]),
  paymentMethod: z.enum(["CARD", "CASH", "TRANSFER"]),
  address: z.string().optional(),
  notes: z.string().max(500).optional(),
});

type CheckoutData = z.infer<typeof checkoutSchema>;

interface CheckoutFormProps {
  onBack: () => void;
  onSuccess: () => void;
}

const PAYMENT_METHODS: Array<{
  value: PaymentMethodType;
  title: string;
  description: (orderType: CheckoutData["type"]) => string;
  badge?: string;
  icon: ReactNode;
}> = [
  {
    value: "CARD",
    title: "Tarjeta de crédito / débito",
    description: () => "Mercado Pago · Acepta todas las tarjetas · +4% uso de aplicación",
    badge: "Recomendado",
    icon: <CreditCard size={17} />,
  },
  {
    value: "CASH",
    title: "Efectivo",
    description: (orderType) =>
      orderType === "PICKUP"
        ? "Paga en sucursal al recoger · Sin cargos extra"
        : "Paga al recibir tu pedido · Sin cargos extra",
    icon: <Banknote size={17} />,
  },
  {
    value: "TRANSFER",
    title: "Transferencia bancaria",
    description: () => "CLABE + concepto · Sin comisión · SPEI 24/7",
    icon: <Landmark size={17} />,
  },
];

/** Mercado Pago logotype in SVG — displays inline in the button */
function MercadoPagoLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 60 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M5.7 0C2.55 0 0 2.55 0 5.7c0 3.15 2.55 5.7 5.7 5.7 1.08 0 2.1-.3 2.97-.82L11.4 11.4V8.55A5.68 5.68 0 0 0 11.4 5.7C11.4 2.55 8.85 0 5.7 0z"
        fill="#009EE3"
      />
      <path
        d="M5.7 2.28a3.42 3.42 0 1 1 0 6.84 3.42 3.42 0 0 1 0-6.84z"
        fill="white"
      />
      <text x="14" y="9.5" fontFamily="system-ui,sans-serif" fontSize="8.5" fontWeight="700" fill="currentColor" letterSpacing="0">
        MercadoPago
      </text>
    </svg>
  );
}

export function CheckoutForm({ onBack, onSuccess }: CheckoutFormProps) {
  const { items, total, clearCart } = useCart();
  const { delivery, onDeliveryChange } = useDelivery();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Coupon state
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountAmount: number;
  } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  // Schedule state
  const [scheduleMode, setScheduleMode] = useState<"NOW" | "LATER">("NOW");
  const [scheduledTime, setScheduledTime] = useState<string>("13:00"); // HH:MM tomorrow

  // Tip state
  const [tipPercent, setTipPercent] = useState<0 | 10 | 15 | 20 | -1>(0); // -1 = custom
  const [tipCustom, setTipCustom] = useState<string>(""); // pesos as string

  // Hydration-safe token for loyalty query
  const [loyaltyToken, setLoyaltyToken] = useState<string | null>(null);
  useEffect(() => {
    setLoyaltyToken(getToken());
  }, []);

  const { data: loyaltyInfo } = useQuery({
    queryKey: ["loyalty-checkout"],
    queryFn: () => api.get<LoyaltyInfo>("/api/loyalty/me", loyaltyToken || undefined),
    enabled: !!loyaltyToken,
  });

  const { register, handleSubmit, watch, setValue } = useForm<CheckoutData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { type: "PICKUP", paymentMethod: "CARD" },
  });

  const orderType = watch("type");
  const paymentMethod = watch("paymentMethod");

  const subtotalWithDelivery = useMemo(
    () => total + (orderType === "DELIVERY" ? delivery.fee || 0 : 0),
    [delivery.fee, orderType, total]
  );

  const tipCents = useMemo(() => {
    if (tipPercent === -1) {
      const v = parseFloat(tipCustom);
      return isNaN(v) ? 0 : Math.max(0, Math.round(v * 100));
    }
    if (tipPercent === 0) return 0;
    return Math.round((total * tipPercent) / 100);
  }, [tipPercent, tipCustom, total]);

  const couponDiscount = appliedCoupon?.discountAmount ?? 0;
  // 4% "Uso de aplicación" — only on CARD payments. Base = post-discount,
  // post-delivery, post-tip total (everything the customer effectively pays).
  const APP_FEE_RATE = 0.04;
  const preFeeTotal = Math.max(0, subtotalWithDelivery + tipCents - couponDiscount);
  const appFeeCents =
    paymentMethod === "CARD" ? Math.round(preFeeTotal * APP_FEE_RATE) : 0;
  const totalCents = preFeeTotal + appFeeCents;
  const cardBlocked = orderType === "DELIVERY" && delivery.available !== true;

  const validateCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true);
    setCouponError(null);
    try {
      const result = await api.post<{
        valid: boolean;
        couponId?: string;
        discountAmount?: number;
        message?: string;
        error?: string;
      }>(
        "/api/orders/coupons/validate",
        { code, subtotal: total },
        getToken() || undefined
      );
      if (!result.valid) {
        setCouponError(result.error || "Cupón inválido");
        return;
      }
      setAppliedCoupon({ code, discountAmount: result.discountAmount ?? 0 });
    } catch (err: any) {
      setCouponError(err.message || "Cupón inválido");
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponError(null);
  };

  const buildScheduledISO = (): string | undefined => {
    if (scheduleMode !== "LATER") return undefined;
    const [hh, mm] = scheduledTime.split(":").map(Number);
    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(hh ?? 13, mm ?? 0, 0, 0);
    return t.toISOString();
  };

  const submitLabel =
    paymentMethod === "TRANSFER"
      ? "Confirmar transferencia"
      : orderType === "PICKUP"
        ? "Confirmar y pagar en sucursal"
        : "Confirmar pedido en efectivo";

  const createOrder = useCallback(
    async (data: CheckoutData, token: string) => {
      const scheduledFor = buildScheduledISO();
      return api.post<CreateOrderResponse>(
        "/api/orders",
        {
          type: data.type,
          paymentMethod: data.paymentMethod,
          address: data.address || delivery.zoneName,
          deliveryLat: delivery.lat,
          deliveryLng: delivery.lng,
          deliveryZoneId: delivery.zoneId,
          deliveryAddress: data.address || delivery.zoneName,
          deliveryFee: delivery.fee || 0,
          notes: data.notes,
          couponCode: appliedCoupon?.code || undefined,
          tipAmount: tipCents > 0 ? tipCents : undefined,
          isScheduled: scheduleMode === "LATER",
          scheduledFor,
          items: items.map((i) => ({
            productId: i.productId,
            qty: i.qty,
            variant: i.variant || undefined,
            notes: i.notes || undefined,
            modifiers:
              i.modifiers && i.modifiers.length > 0
                ? i.modifiers.map((m) => ({
                    name: m.name,
                    option: m.option,
                    price: m.price,
                  }))
                : undefined,
          })),
        },
        token
      );
    },
    [
      delivery.fee,
      delivery.lat,
      delivery.lng,
      delivery.zoneId,
      delivery.zoneName,
      items,
      appliedCoupon,
      tipCents,
      scheduleMode,
      scheduledTime,
    ]
  );

  const getCheckoutData = useCallback(
    () =>
      new Promise<CheckoutData>((resolve, reject) => {
        void handleSubmit(resolve, () => {
          reject(new Error("Revisa los datos del pedido."));
        })();
      }),
    [handleSubmit]
  );

  /** CARD → Checkout Pro: create order then redirect to Mercado Pago */
  const handleCardRedirect = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setError("Necesitas iniciar sesión primero");
      return;
    }

    let data: CheckoutData;
    try {
      data = await getCheckoutData();
    } catch (err: any) {
      setError(err.message || "Revisa los datos del pedido.");
      return;
    }

    if (data.type === "DELIVERY" && !delivery.available) {
      setError("Selecciona una ubicación de entrega válida");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const order = await createOrder(data, token);
      const { checkoutUrl } = await api.post<{ preferenceId: string; checkoutUrl: string }>(
        "/api/payments/create",
        { orderId: order.orderId },
        token
      );
      clearCart();
      window.location.href = checkoutUrl;
    } catch (err: any) {
      setError(err.message || "No se pudo redirigir a Mercado Pago. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }, [clearCart, createOrder, delivery.available, getCheckoutData]);

  /** CASH / TRANSFER → submit directly */
  const onSubmit = async (data: CheckoutData) => {
    const token = getToken();
    if (!token) {
      setError("Necesitas iniciar sesión primero");
      return;
    }

    if (data.type === "DELIVERY" && !delivery.available) {
      setError("Selecciona una ubicación de entrega válida");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const order = await createOrder(data, token);
      clearCart();
      window.location.href = `/order/${order.orderId}`;
    } catch (err: any) {
      setError(err.message || "Error al procesar el pedido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col p-4 pb-6">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-on-surface-variant mb-4">
        <ArrowLeft size={16} /> Volver al carrito
      </button>

      <h3 className="text-lg font-headline font-bold mb-4 text-on-surface">Datos del pedido</h3>

      {/* Order type */}
      <div className="mb-4">
        <label className="text-sm font-medium mb-2 block text-on-surface">Tipo de pedido</label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex-1">
            <input type="radio" value="PICKUP" {...register("type")} className="sr-only peer" />
            <div className="border-2 border-outline-variant rounded-xl p-3 text-center cursor-pointer peer-checked:border-primary peer-checked:bg-primary/10 transition-colors">
              <p className="font-semibold text-sm text-on-surface">Recoger</p>
              <p className="text-xs text-on-surface-variant">Paso por él</p>
            </div>
          </label>
          <label className="flex-1">
            <input type="radio" value="DELIVERY" {...register("type")} className="sr-only peer" />
            <div className="border-2 border-outline-variant rounded-xl p-3 text-center cursor-pointer peer-checked:border-primary peer-checked:bg-primary/10 transition-colors">
              <p className="font-semibold text-sm text-on-surface">Domicilio</p>
              <p className="text-xs text-on-surface-variant">Enviar a casa</p>
            </div>
          </label>
        </div>
      </div>

      {/* Loyalty reward banner */}
      {loyaltyInfo?.pendingReward && (
        <div className="mb-4 rounded-xl border border-green-500/30 bg-green-500/5 p-3">
          <div className="flex items-center gap-2">
            <Gift size={16} className="text-green-400" />
            <div>
              <p className="text-sm font-bold text-green-400">
                Tienes un {loyaltyInfo.pendingProduct?.name ?? "producto"} gratis
              </p>
              <p className="text-xs text-on-surface-variant">
                Se descuenta automáticamente de tu pedido
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Payment method */}
      <div className="mb-4">
        <label className="text-sm font-medium mb-2 block text-on-surface">Forma de pago</label>
        <div className="grid gap-2">
          {PAYMENT_METHODS.map((method) => (
            <label key={method.value}>
              <input
                type="radio"
                value={method.value}
                {...register("paymentMethod")}
                className="sr-only peer"
              />
              <div className="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-outline-variant p-3 transition-colors peer-checked:border-primary peer-checked:bg-primary/10">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-container-high text-primary">
                  {method.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="block text-sm font-semibold text-on-surface">
                      {method.title}
                    </span>
                    {method.badge && (
                      <span className="inline-flex items-center rounded-full bg-secondary/20 px-1.5 py-0.5 text-[9px] font-headline font-extrabold uppercase tracking-wider text-secondary">
                        {method.badge}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-on-surface-variant">
                    {method.description(orderType)}
                  </span>
                </span>
              </div>
            </label>
          ))}
        </div>
        {paymentMethod === "TRANSFER" && (
          <p className="mt-2 rounded-lg bg-surface-container-high p-2 text-xs text-on-surface-variant">
            Al confirmar te mostraremos banco, CLABE, monto y concepto para transferir.
          </p>
        )}
      </div>

      {/* Delivery map & address */}
      {orderType === "DELIVERY" && (
        <div className="mb-4 space-y-3">
          <DeliveryMap
            onDeliveryChange={onDeliveryChange}
            onAddressChange={(nextAddress) =>
              setValue("address", nextAddress, { shouldDirty: true })
            }
          />
          {delivery.available &&
            delivery.outsideTimeWindow &&
            scheduleMode === "NOW" && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-500">
                <CalendarClock size={14} className="mt-0.5 flex-shrink-0" />
                <p className="text-xs">
                  La zona <strong>{delivery.zoneName}</strong> entrega entre{" "}
                  <strong>
                    {delivery.zoneStartTime ?? "—"} y{" "}
                    {delivery.zoneEndTime ?? "—"}
                  </strong>
                  . Para pedir ahora, cambia a otra zona o usa "Para mañana".
                </p>
              </div>
            )}
          <div>
            <label className="text-sm font-medium mb-1 block text-on-surface">Dirección y referencias</label>
            <textarea
              {...register("address")}
              placeholder="Calle, número, colonia, casa/depto, referencias..."
              className="w-full border border-outline-variant/40 bg-white text-neutral-900 rounded-xl p-3 text-sm resize-none placeholder:text-neutral-400 focus:ring-2 focus:ring-primary focus:border-primary"
              rows={3}
            />
          </div>
        </div>
      )}

      {/* Schedule (today vs tomorrow) */}
      <div className="mb-4">
        <label className="text-sm font-medium mb-2 block text-on-surface">¿Cuándo lo quieres?</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setScheduleMode("NOW")}
            className={`flex items-center justify-center gap-2 rounded-xl border-2 p-3 text-sm font-semibold transition-all ${
              scheduleMode === "NOW"
                ? "border-primary bg-primary/10 text-primary"
                : "border-outline-variant text-on-surface-variant hover:border-primary/40"
            }`}
          >
            Ahora
          </button>
          <button
            type="button"
            onClick={() => setScheduleMode("LATER")}
            className={`flex items-center justify-center gap-2 rounded-xl border-2 p-3 text-sm font-semibold transition-all ${
              scheduleMode === "LATER"
                ? "border-primary bg-primary/10 text-primary"
                : "border-outline-variant text-on-surface-variant hover:border-primary/40"
            }`}
          >
            <CalendarClock size={14} />
            Para mañana
          </button>
        </div>
        {scheduleMode === "LATER" && (
          <div className="mt-2 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
            <label className="block text-[11px] text-on-surface-variant mb-1">
              Hora deseada (mañana)
            </label>
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="w-full rounded-lg border border-outline-variant/40 bg-white text-neutral-900 p-2 text-sm [color-scheme:light]"
            />
            <p className="mt-1 text-[10px] text-on-surface-variant/70">
              Confirmamos por WhatsApp. Pago se procesa hoy, te entregamos mañana.
            </p>
          </div>
        )}
      </div>

      {/* Coupon */}
      <div className="mb-4">
        <label className="text-sm font-medium mb-2 block text-on-surface">
          ¿Tienes un cupón?
        </label>
        {appliedCoupon ? (
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
            <div className="flex items-center gap-2">
              <Check size={14} className="text-emerald-500" />
              <div>
                <p className="text-sm font-bold text-emerald-500">
                  {appliedCoupon.code}
                </p>
                <p className="text-[11px] text-on-surface-variant">
                  Descuento: {formatCents(appliedCoupon.discountAmount)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={removeCoupon}
              className="text-xs text-on-surface-variant hover:text-error"
            >
              Quitar
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Ticket
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
              />
              <input
                value={couponInput}
                onChange={(e) =>
                  setCouponInput(e.target.value.toUpperCase().slice(0, 30))
                }
                placeholder="POLLON10"
                className="w-full rounded-xl border border-outline-variant/40 bg-white text-neutral-900 py-2.5 pl-9 pr-3 text-sm font-mono placeholder:text-neutral-400 focus:border-primary focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              type="button"
              onClick={validateCoupon}
              disabled={couponLoading || !couponInput.trim()}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-50"
            >
              {couponLoading ? <Loader2 size={14} className="animate-spin" /> : "Aplicar"}
            </button>
          </div>
        )}
        {couponError && (
          <p className="mt-1 text-xs text-error">{couponError}</p>
        )}
      </div>

      {/* Tip */}
      <div className="mb-4">
        <label className="text-sm font-medium mb-2 flex items-center gap-1.5 text-on-surface">
          <Heart size={13} className="text-error" />
          Propina (opcional)
        </label>
        <div className="grid grid-cols-5 gap-1.5">
          {([0, 10, 15, 20, -1] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setTipPercent(p)}
              className={`rounded-lg border py-2 text-xs font-semibold transition-all ${
                tipPercent === p
                  ? "border-primary bg-primary text-on-primary"
                  : "border-outline-variant/30 text-on-surface-variant hover:border-primary/40"
              }`}
            >
              {p === 0 ? "Sin" : p === -1 ? "Otro" : `${p}%`}
            </button>
          ))}
        </div>
        {tipPercent === -1 && (
          <div className="relative mt-2">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-on-surface-variant/60">
              $
            </span>
            <input
              type="number"
              min="0"
              step="1"
              value={tipCustom}
              onChange={(e) => setTipCustom(e.target.value)}
              placeholder="20"
              className="w-full rounded-xl border border-outline-variant/40 bg-white text-neutral-900 py-2.5 pl-7 pr-3 text-sm placeholder:text-neutral-400 focus:border-primary focus:ring-2 focus:ring-primary"
            />
          </div>
        )}
        {tipCents > 0 && (
          <p className="mt-1 text-[11px] text-on-surface-variant">
            Propina: {formatCents(tipCents)} para tu repartidor
          </p>
        )}
      </div>

      {/* Notes */}
      <div className="mb-4">
        <label className="text-sm font-medium mb-1 block text-on-surface">Notas (opcional)</label>
        <input
          {...register("notes")}
          placeholder="Instrucciones especiales..."
          className="w-full border border-outline-variant/40 bg-white text-neutral-900 rounded-xl p-3 text-sm placeholder:text-neutral-400 focus:ring-2 focus:ring-primary focus:border-primary"
        />
      </div>

      {error && <p className="text-error text-sm mb-3">{error}</p>}

      {/* ── Total a pagar — SIEMPRE visible (CARD/CASH/TRANSFER) ── */}
      <div className="mt-auto">
        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-high px-4 py-3 mb-3">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-on-surface-variant">
              <span>Subtotal</span>
              <span>{formatCents(total)}</span>
            </div>
            {orderType === "DELIVERY" && delivery.fee ? (
              <div className="flex justify-between text-on-surface-variant">
                <span>Envío ({delivery.zoneName || "—"})</span>
                <span>{formatCents(delivery.fee)}</span>
              </div>
            ) : null}
            {couponDiscount > 0 && (
              <div className="flex justify-between text-emerald-500">
                <span>Cupón {appliedCoupon?.code}</span>
                <span>− {formatCents(couponDiscount)}</span>
              </div>
            )}
            {tipCents > 0 && (
              <div className="flex justify-between text-on-surface-variant">
                <span>Propina</span>
                <span>{formatCents(tipCents)}</span>
              </div>
            )}
            {appFeeCents > 0 && (
              <div className="flex justify-between text-on-surface-variant">
                <span>Uso de aplicación (4%)</span>
                <span>{formatCents(appFeeCents)}</span>
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-outline-variant/20 pt-2">
            <span className="font-headline text-sm font-bold text-on-surface">
              Total a pagar
            </span>
            <span className="font-headline text-xl font-extrabold text-primary">
              {formatCents(totalCents)}
            </span>
          </div>
          {paymentMethod === "TRANSFER" && (
            <p className="mt-1 text-[11px] text-on-surface-variant/70">
              Transfiere exactamente este monto. Te mostramos los datos al confirmar.
            </p>
          )}
        </div>

        {/* CARD button (Mercado Pago) */}
        {paymentMethod === "CARD" && (
          <div className="space-y-3">
            {cardBlocked ? (
              <p className="rounded-xl bg-surface-container-high p-3 text-sm text-on-surface-variant text-center">
                Selecciona una dirección de entrega válida para continuar.
              </p>
            ) : (
              <button
                type="button"
                onClick={handleCardRedirect}
                disabled={loading || totalCents <= 0}
                className="group w-full overflow-hidden rounded-2xl bg-[#009EE3] py-4 font-headline font-bold text-white shadow-lg shadow-[#009EE3]/30 transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Redirigiendo a Mercado Pago...
                  </>
                ) : (
                  <>
                    <ExternalLink size={16} />
                    Pagar con Mercado Pago
                  </>
                )}
              </button>
            )}

            <div className="flex items-center justify-center gap-3 text-[10px] text-on-surface-variant/60">
              <span className="flex items-center gap-1"><Lock size={9} /> Cifrado 256-bit</span>
              <span>·</span>
              <span className="flex items-center gap-1"><ShieldCheck size={9} /> Pago seguro</span>
              <span>·</span>
              <span>Acepta tarjetas y saldo MP</span>
            </div>
          </div>
        )}

        {/* CASH / TRANSFER button */}
        {paymentMethod !== "CARD" && (
          <div>
            <button
              type="button"
              onClick={() => void handleSubmit(onSubmit)()}
              disabled={loading || totalCents <= 0 || (orderType === "DELIVERY" && !delivery.available)}
              className="w-full bg-primary text-on-primary py-3 rounded-xl font-headline font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> Procesando...
                </>
              ) : (
                submitLabel
              )}
            </button>
            <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-on-surface-variant/60">
              <span className="flex items-center gap-1"><Lock size={9} /> Conexión segura</span>
              <span>·</span>
              <span className="flex items-center gap-1"><ShieldCheck size={9} /> Datos protegidos</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
