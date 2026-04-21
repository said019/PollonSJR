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
import { ArrowLeft, Banknote, CreditCard, Gift, Landmark, Loader2, ShieldCheck, Lock, ExternalLink } from "lucide-react";
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
    description: () => "Paga de forma segura con Mercado Pago · Acepta todas las tarjetas",
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
  const totalCents = useMemo(
    () => total + (orderType === "DELIVERY" ? delivery.fee || 0 : 0),
    [delivery.fee, orderType, total]
  );
  const cardBlocked = orderType === "DELIVERY" && delivery.available !== true;

  const submitLabel =
    paymentMethod === "TRANSFER"
      ? "Confirmar transferencia"
      : orderType === "PICKUP"
        ? "Confirmar y pagar en sucursal"
        : "Confirmar pedido en efectivo";

  const createOrder = useCallback(
    async (data: CheckoutData, token: string) =>
      api.post<CreateOrderResponse>(
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
          items: items.map((i) => ({
            productId: i.productId,
            qty: i.qty,
            variant: i.variant || undefined,
          })),
        },
        token
      ),
    [delivery.fee, delivery.lat, delivery.lng, delivery.zoneId, delivery.zoneName, items]
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

      {/* ── CARD: Checkout Pro redirect button ── */}
      {paymentMethod === "CARD" && (
        <div className="mt-auto space-y-3">
          {/* Amount preview */}
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-high px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-surface-variant">Total a pagar</span>
              <span className="font-headline text-lg font-extrabold text-primary">
                {formatCents(totalCents)}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-on-surface-variant/60">
              Incluye {orderType === "DELIVERY" && delivery.fee ? `envío ($${(delivery.fee / 100).toFixed(0)}) + ` : ""}todos los productos
            </p>
          </div>

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

          <div className="flex items-center justify-center gap-3 text-[10px] text-on-surface-variant/50">
            <span className="flex items-center gap-1"><Lock size={9} /> Cifrado 256-bit</span>
            <span>·</span>
            <span className="flex items-center gap-1"><ShieldCheck size={9} /> Pago seguro</span>
            <span>·</span>
            <span>Acepta tarjetas y saldo MP</span>
          </div>
        </div>
      )}

      {/* ── CASH / TRANSFER ── */}
      {paymentMethod !== "CARD" && (
        <div className="mt-auto pt-2">
          <button
            type="button"
            onClick={() => void handleSubmit(onSubmit)()}
            disabled={loading || (orderType === "DELIVERY" && !delivery.available)}
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
          <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-on-surface-variant/50">
            <span className="flex items-center gap-1"><Lock size={9} /> Conexión segura</span>
            <span>·</span>
            <span className="flex items-center gap-1"><ShieldCheck size={9} /> Datos protegidos</span>
          </div>
        </div>
      )}
    </div>
  );
}
