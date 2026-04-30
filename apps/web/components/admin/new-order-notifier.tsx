"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, ShoppingBag, Store, Truck, X } from "lucide-react";
import { useSocket } from "@/hooks/useSocket";
import { getAdminToken } from "@/lib/auth";
import { formatCents } from "@pollon/utils";
import {
  preloadNewOrderSound,
  playNewOrderSound,
} from "@/lib/notification-sound";

type Toast = {
  id: string;
  orderId: string;
  orderNumber: number;
  total: number;
  type: "DELIVERY" | "PICKUP";
  paymentMethod?: "CARD" | "CASH" | "TRANSFER";
};

const VISIBLE_MS = 8000;

/**
 * Mounted once in AdminLayout. Plays the new-order sound and shows a toast
 * for any incoming order:new event, regardless of which admin page is open.
 * Page-level components (kanban, dashboard) keep their own listeners for
 * query invalidation; this component only handles audio + global UI.
 */
export function AdminNewOrderNotifier() {
  const adminToken = getAdminToken();
  const router = useRouter();
  const qc = useQueryClient();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    preloadNewOrderSound();
  }, []);

  useSocket(
    "order:new",
    (order: any) => {
      playNewOrderSound();

      // Refresh global admin caches even if the page-level component isn't mounted.
      qc.invalidateQueries({ queryKey: ["admin-active-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });

      const id = `${order.id}-${Date.now()}`;
      setToasts((prev) => [
        ...prev,
        {
          id,
          orderId: order.id,
          orderNumber: order.orderNumber,
          total: order.total,
          type: order.type,
          paymentMethod: order.paymentMethod,
        },
      ]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, VISIBLE_MS);
    },
    { token: adminToken || undefined, role: "admin" }
  );

  const dismiss = (id: string) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            initial={{ opacity: 0, x: 30, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 30, scale: 0.95 }}
            transition={{ type: "spring", damping: 22, stiffness: 260 }}
            onClick={() => {
              dismiss(t.id);
              router.push("/admin/orders");
            }}
            className="pointer-events-auto group flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-primary/30 bg-surface-container-high p-3 text-left shadow-2xl shadow-black/40 transition-colors hover:border-primary/60"
          >
            <div className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary">
              <ShoppingBag size={18} />
              <motion.span
                className="absolute inset-0 rounded-xl border-2 border-primary"
                animate={{ scale: [1, 1.3, 1], opacity: [0.7, 0, 0.7] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <Bell size={11} className="text-primary" />
                <span className="font-headline text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                  Nuevo pedido
                </span>
              </div>
              <p className="truncate font-headline text-sm font-extrabold text-tertiary">
                #{t.orderNumber} ·{" "}
                <span className="text-primary">{formatCents(t.total)}</span>
              </p>
              <p className="flex items-center gap-1 text-[11px] text-on-surface-variant/80">
                {t.type === "DELIVERY" ? (
                  <Truck size={11} />
                ) : (
                  <Store size={11} />
                )}
                {t.type === "DELIVERY" ? "Envío" : "Sucursal"}
                {t.paymentMethod === "TRANSFER" && (
                  <span className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                    Transferencia
                  </span>
                )}
              </p>
            </div>
            <span
              role="button"
              tabIndex={-1}
              aria-label="Cerrar"
              onClick={(e) => {
                e.stopPropagation();
                dismiss(t.id);
              }}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-on-surface-variant/60 transition-colors hover:bg-surface-variant hover:text-tertiary"
            >
              <X size={14} />
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
