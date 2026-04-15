"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCart } from "@/hooks/useCart";
import { useDelivery } from "@/hooks/useDelivery";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type {
  CardPaymentPayload,
  CreateCardPaymentResponse,
  CreateOrderResponse,
  PaymentMethodType,
} from "@pollon/types";
import { formatCents } from "@pollon/utils";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Banknote, CreditCard, Landmark, Loader2 } from "lucide-react";
import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react";
import type {
  ICardPaymentBrickPayer,
  ICardPaymentFormData,
} from "@mercadopago/sdk-react/esm/bricks/cardPayment/type";
import { DeliveryMap } from "./delivery-map";

const STATIC_MP_PUBLIC_KEY = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY || "";

const checkoutSchema = z.object({
  type: z.enum(["DELIVERY", "PICKUP"]),
  paymentMethod: z.enum(["CARD", "CASH", "TRANSFER"]),
  address: z.string().optional(),
  notes: z.string().max(500).optional(),
});

type CheckoutData = z.infer<typeof checkoutSchema>;
type CardPaymentFormData = ICardPaymentFormData<ICardPaymentBrickPayer>;

interface CheckoutFormProps {
  onBack: () => void;
  onSuccess: () => void;
}

const PAYMENT_METHODS: Array<{
  value: PaymentMethodType;
  title: string;
  description: (orderType: CheckoutData["type"]) => string;
  icon: ReactNode;
}> = [
  {
    value: "CARD",
    title: "Pago con tarjeta",
    description: () => "Tarjeta de crédito o débito",
    icon: <CreditCard size={17} />,
  },
  {
    value: "CASH",
    title: "Efectivo",
    description: (orderType) =>
      orderType === "PICKUP" ? "Paga en sucursal al recoger" : "Paga al recibir tu pedido",
    icon: <Banknote size={17} />,
  },
  {
    value: "TRANSFER",
    title: "Transferencia",
    description: () => "Te damos CLABE y concepto del pedido",
    icon: <Landmark size={17} />,
  },
];

export function CheckoutForm({ onBack, onSuccess }: CheckoutFormProps) {
  const { items, total, clearCart } = useCart();
  const { delivery, onDeliveryChange } = useDelivery();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mpPublicKey, setMpPublicKey] = useState(STATIC_MP_PUBLIC_KEY);

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
    paymentMethod === "CARD"
      ? "Pagar con tarjeta"
      : paymentMethod === "TRANSFER"
        ? "Confirmar transferencia"
        : orderType === "PICKUP"
          ? "Confirmar y pagar en sucursal"
          : "Confirmar pedido en efectivo";

  useEffect(() => {
    if (STATIC_MP_PUBLIC_KEY) return;

    let active = true;
    fetch("/api/public-config", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((config: { mpPublicKey?: string } | null) => {
        if (active && config?.mpPublicKey) {
          setMpPublicKey(config.mpPublicKey);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (mpPublicKey) {
      initMercadoPago(mpPublicKey, { locale: "es-MX" });
    }
  }, [mpPublicKey]);

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

    if (data.paymentMethod === "CARD") {
      setError("Completa los datos de tu tarjeta en el formulario de Mercado Pago.");
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

  const handleCardPayment = useCallback(
    async (cardData: CardPaymentFormData) => {
      const token = getToken();
      if (!token) {
        const message = "Necesitas iniciar sesión primero";
        setError(message);
        throw new Error(message);
      }

      setLoading(true);
      setError(null);

      try {
        const data = await getCheckoutData();

        if (data.type === "DELIVERY" && !delivery.available) {
          throw new Error("Selecciona una ubicación de entrega válida");
        }

        const order = await createOrder(data, token);
        const payload: CardPaymentPayload = {
          orderId: order.orderId,
          token: cardData.token,
          paymentMethodId: cardData.payment_method_id,
          issuerId: cardData.issuer_id,
          installments: cardData.installments,
          transactionAmount: cardData.transaction_amount,
          idempotencyKey:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${order.orderId}-${Date.now()}`,
          payer: {
            email: cardData.payer?.email,
            identification: cardData.payer?.identification,
          },
        };

        const payment = await api.post<CreateCardPaymentResponse>(
          "/api/payments/card",
          payload,
          token
        );

        if (payment.status === "REJECTED") {
          throw new Error(payment.message || "No pudimos procesar tu tarjeta.");
        }

        clearCart();
        window.location.href = `/order/${order.orderId}?pago=${
          payment.mpStatus || payment.status.toLowerCase()
        }`;
      } catch (err: any) {
        const message = err.message || "No pudimos procesar tu tarjeta.";
        setError(message);
        throw new Error(message);
      } finally {
        setLoading(false);
      }
    },
    [clearCart, createOrder, delivery.available, getCheckoutData]
  );

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
                  <span className="block text-sm font-semibold text-on-surface">
                    {method.title}
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
              className="w-full border border-outline-variant bg-surface-container-high text-on-surface rounded-xl p-3 text-sm resize-none placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary focus:border-primary"
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
          className="w-full border border-outline-variant bg-surface-container-high text-on-surface rounded-xl p-3 text-sm placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary focus:border-primary"
        />
      </div>

      {error && <p className="text-error text-sm mb-3">{error}</p>}

      {paymentMethod === "CARD" && (
        <div className="mb-4 space-y-3">
          <div className="rounded-lg border border-outline-variant bg-surface-container-high p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
              Pago seguro con Mercado Pago
            </p>
            <p className="mt-1 text-sm text-on-surface">
              Total a pagar:{" "}
              <span className="font-headline font-bold text-primary">
                {formatCents(totalCents)}
              </span>
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">
              Los datos de tu tarjeta se capturan directamente en Mercado Pago.
            </p>
          </div>

          {cardBlocked ? (
            <p className="rounded-lg bg-surface-container-high p-3 text-sm text-on-surface-variant">
              Selecciona una dirección de entrega válida para mostrar el formulario de tarjeta.
            </p>
          ) : totalCents <= 0 ? (
            <p className="rounded-lg bg-surface-container-high p-3 text-sm text-on-surface-variant">
              Agrega productos al carrito para pagar con tarjeta.
            </p>
          ) : mpPublicKey ? (
            <div className="overflow-hidden rounded-lg border border-outline-variant bg-white p-2">
              <CardPayment
                key={`${orderType}-${totalCents}-${delivery.zoneId || "pickup"}`}
                initialization={{
                  amount: totalCents / 100,
                }}
                customization={{
                  paymentMethods: {
                    minInstallments: 1,
                    maxInstallments: 1,
                    types: {
                      included: ["credit_card", "debit_card"],
                    },
                  },
                  visual: {
                    hideFormTitle: true,
                  },
                }}
                locale="es-MX"
                onSubmit={handleCardPayment}
                onError={() => {
                  setError("No pude cargar el formulario de tarjeta. Intenta de nuevo.");
                }}
              />
            </div>
          ) : (
            <p className="rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-error">
              Falta configurar la llave pública de Mercado Pago.
            </p>
          )}
        </div>
      )}

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
        </div>
      )}
    </div>
  );
}
