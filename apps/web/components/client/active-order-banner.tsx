"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { motion, AnimatePresence } from "framer-motion";
import { ChefHat, CheckCircle, Package, Truck, Loader2, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { OrderStatusType } from "@pollon/types";

interface ActiveOrder {
  id: string;
  orderNumber: number;
  status: OrderStatusType;
  type: "PICKUP" | "DELIVERY";
  total: number;
}

const STATUS_META: Record<string, { label: string; icon: React.ReactNode; pulse: boolean }> = {
  PENDING_PAYMENT: { label: "Procesando pago…",   icon: <Loader2 size={14} className="animate-spin" />, pulse: false },
  RECEIVED:        { label: "Pedido recibido",      icon: <CheckCircle size={14} />,                       pulse: true  },
  PREPARING:       { label: "Preparando tu pedido", icon: <ChefHat size={14} />,                           pulse: true  },
  READY:           { label: "¡Tu pedido está listo!", icon: <Package size={14} />,                          pulse: true  },
  ON_THE_WAY:      { label: "Tu pedido en camino",  icon: <Truck size={14} />,                             pulse: true  },
};

export function ActiveOrderBanner() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(getToken());
  }, []);

  const { data: orders } = useQuery<ActiveOrder[]>({
    queryKey: ["my-active-orders"],
    queryFn: () => api.get<ActiveOrder[]>("/api/orders/my-active", token || undefined),
    enabled: !!token,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const order = orders?.[0];
  if (!order) return null;

  const meta = STATUS_META[order.status] ?? STATUS_META.RECEIVED;

  return (
    <AnimatePresence>
      <motion.div
        key={order.id}
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", damping: 26, stiffness: 220 }}
        className="pointer-events-auto"
      >
        <Link
          href={`/order/${order.id}`}
          className="group flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-surface-container/95 px-4 py-3 shadow-xl shadow-black/20 backdrop-blur-xl transition-all hover:border-primary/60 active:scale-[0.98]"
        >
          {/* Animated icon */}
          <div className="relative flex-shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-on-primary shadow-md shadow-primary/30">
              {meta.icon}
            </div>
            {meta.pulse && (
              <motion.span
                className="absolute inset-0 rounded-xl border-2 border-primary"
                animate={{ scale: [1, 1.4, 1], opacity: [0.7, 0, 0.7] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
              />
            )}
          </div>

          {/* Text */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-headline text-[10px] font-bold uppercase tracking-wider text-primary">
                Pedido #{order.orderNumber}
              </span>
              {meta.pulse && (
                <motion.span
                  className="h-1.5 w-1.5 rounded-full bg-primary"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
              )}
            </div>
            <p className="truncate font-headline text-sm font-bold text-tertiary leading-tight">
              {meta.label}
            </p>
          </div>

          {/* CTA arrow */}
          <motion.div
            animate={{ x: [0, 3, 0] }}
            transition={{ duration: 1.6, repeat: Infinity }}
            className="flex-shrink-0 text-primary"
          >
            <ChevronRight size={18} />
          </motion.div>
        </Link>
      </motion.div>
    </AnimatePresence>
  );
}
