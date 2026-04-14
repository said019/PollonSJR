"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useSocket } from "@/hooks/useSocket";
import type { OrderDetail, OrderStatusType } from "@pollon/types";
import { formatCents } from "@pollon/utils";
import { useState, useEffect } from "react";
import { CheckCircle, Clock, ChefHat, Package, Truck } from "lucide-react";
import { motion } from "framer-motion";

const STATUS_STEPS: { status: OrderStatusType; label: string; icon: React.ReactNode }[] = [
  { status: "RECEIVED", label: "Recibido", icon: <CheckCircle size={20} /> },
  { status: "PREPARING", label: "Preparando", icon: <ChefHat size={20} /> },
  { status: "READY", label: "Listo", icon: <Package size={20} /> },
  { status: "ON_THE_WAY", label: "En camino", icon: <Truck size={20} /> },
  { status: "DELIVERED", label: "Entregado", icon: <CheckCircle size={20} /> },
];

export function OrderTracker({ orderId }: { orderId: string }) {
  const token = getToken();
  const [currentStatus, setCurrentStatus] = useState<OrderStatusType | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api.get<OrderDetail>(`/api/orders/${orderId}`, token || undefined),
    enabled: !!token,
  });

  useEffect(() => {
    if (order) setCurrentStatus(order.status);
  }, [order]);

  useSocket("order:status", ({ orderId: id, status }) => {
    if (id === orderId) setCurrentStatus(status);
  });

  const activeStep = STATUS_STEPS.findIndex((s) => s.status === currentStatus);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <p className="text-on-surface-variant">Pedido no encontrado</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-surface-container-low/90 backdrop-blur-md border-b border-outline-variant/20 p-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-lg font-headline font-bold text-on-surface">Pedido #{order.orderNumber}</h1>
          <p className="text-sm text-on-surface-variant">{order.type === "DELIVERY" ? "Envío a domicilio" : "Recoger en tienda"}</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Status tracker */}
        {currentStatus !== "PENDING_PAYMENT" && currentStatus !== "CANCELLED" && (
          <div className="bg-surface-container-high rounded-xl p-6 mb-6 border border-outline-variant/20">
            <h2 className="font-headline font-bold mb-4 text-on-surface">Estado del pedido</h2>
            <div className="space-y-4">
              {STATUS_STEPS.map((step, i) => {
                const isActive = i <= activeStep;
                const isCurrent = i === activeStep;
                return (
                  <motion.div
                    key={step.status}
                    className="flex items-center gap-3"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        isActive ? "bg-primary text-on-primary" : "bg-surface-variant text-on-surface-variant"
                      } ${isCurrent ? "ring-2 ring-secondary" : ""}`}
                    >
                      {step.icon}
                    </div>
                    <span className={`text-sm ${isActive ? "font-semibold text-on-surface" : "text-on-surface-variant"}`}>
                      {step.label}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Items */}
        <div className="bg-surface-container-high rounded-xl p-6 border border-outline-variant/20">
          <h2 className="font-headline font-bold mb-3 text-on-surface">Detalle</h2>
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between py-2 border-b border-outline-variant/10 last:border-0">
              <div>
                <p className="text-sm font-medium text-on-surface">
                  {item.qty}x {item.productName}
                  {item.variant && <span className="text-on-surface-variant ml-1">({item.variant})</span>}
                </p>
              </div>
              <p className="text-sm font-bold text-on-surface">{formatCents(item.unitPrice * item.qty)}</p>
            </div>
          ))}

          <div className="mt-4 space-y-1">
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
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-outline-variant/20">
              <span className="text-on-surface">Total</span>
              <span className="text-primary">{formatCents(order.total)}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
