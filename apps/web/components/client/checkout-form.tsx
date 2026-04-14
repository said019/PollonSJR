"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCart } from "@/hooks/useCart";
import { useDelivery } from "@/hooks/useDelivery";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { CreatePaymentResponse } from "@pollon/types";
import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { DeliveryMap } from "./delivery-map";

const checkoutSchema = z.object({
  type: z.enum(["DELIVERY", "PICKUP"]),
  address: z.string().optional(),
  notes: z.string().max(500).optional(),
});

type CheckoutData = z.infer<typeof checkoutSchema>;

interface CheckoutFormProps {
  onBack: () => void;
  onSuccess: () => void;
}

export function CheckoutForm({ onBack, onSuccess }: CheckoutFormProps) {
  const { items, clearCart } = useCart();
  const { delivery, onDeliveryChange } = useDelivery();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, watch } = useForm<CheckoutData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { type: "PICKUP" },
  });

  const orderType = watch("type");

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
      const { orderId } = await api.post<{ orderId: string }>(
        "/api/orders",
        {
          type: data.type,
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
      );

      const payment = await api.post<CreatePaymentResponse>(
        "/api/payments/create",
        { orderId },
        token
      );

      clearCart();
      window.location.href = payment.checkoutUrl;
    } catch (err: any) {
      setError(err.message || "Error al procesar el pedido");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col p-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-on-surface-variant mb-4">
        <ArrowLeft size={16} /> Volver al carrito
      </button>

      <h3 className="text-lg font-headline font-bold mb-4 text-on-surface">Datos del pedido</h3>

      {/* Order type */}
      <div className="mb-4">
        <label className="text-sm font-medium mb-2 block text-on-surface">Tipo de pedido</label>
        <div className="flex gap-3">
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

      {/* Delivery map & address */}
      {orderType === "DELIVERY" && (
        <div className="mb-4 space-y-3">
          <DeliveryMap onDeliveryChange={onDeliveryChange} />
          <div>
            <label className="text-sm font-medium mb-1 block text-on-surface">Dirección (detalles)</label>
            <textarea
              {...register("address")}
              placeholder="Calle, número, referencias..."
              className="w-full border border-outline-variant bg-surface-container-high text-on-surface rounded-xl p-3 text-sm resize-none placeholder:text-on-surface-variant/50 focus:ring-2 focus:ring-primary focus:border-primary"
              rows={2}
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

      <div className="mt-auto">
        <button
          type="submit"
          disabled={loading || (orderType === "DELIVERY" && !delivery.available)}
          className="w-full bg-primary text-on-primary py-3 rounded-xl font-headline font-bold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 size={18} className="animate-spin" /> Procesando...
            </>
          ) : (
            "Pagar con Mercado Pago"
          )}
        </button>
      </div>
    </form>
  );
}
