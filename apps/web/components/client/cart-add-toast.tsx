"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useCartFeedback } from "@/store/cart-feedback";

/**
 * Toast flotante "Agregado al carrito" — patrón Rappi/UberEats. Aparece
 * por la parte superior, desaparece a los 1.6s. No interrumpe ni navega.
 *
 * Se monta una sola vez en el menú (o globalmente). Cada llamada a
 * useCartFeedback().notify() lo dispara.
 */
export function CartAddToast() {
  const last = useCartFeedback((s) => s.last);
  const clear = useCartFeedback((s) => s.clear);
  const [visibleId, setVisibleId] = useState<number | null>(null);

  useEffect(() => {
    if (!last) return;
    setVisibleId(last.id);
    const t = setTimeout(() => {
      setVisibleId(null);
      // Mantener el evento en el store por un momento más para evitar flicker
      // si llegan dos adds seguidos.
      setTimeout(() => clear(), 200);
    }, 1600);
    return () => clearTimeout(t);
  }, [last, clear]);

  const show = !!last && visibleId === last.id;

  return (
    <AnimatePresence>
      {show && last && (
        <motion.div
          key={last.id}
          initial={{ y: -16, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -8, opacity: 0, scale: 0.96 }}
          transition={{ type: "spring", damping: 22, stiffness: 320 }}
          className="pointer-events-none fixed left-1/2 top-3 z-[90] -translate-x-1/2"
        >
          <div className="pointer-events-auto flex max-w-[calc(100vw-1.5rem)] items-center gap-2.5 rounded-2xl border border-emerald-500/30 bg-surface-container px-4 py-2.5 shadow-2xl backdrop-blur-xl">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check size={14} strokeWidth={3} />
            </div>
            <div className="min-w-0">
              <p className="font-headline text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">
                Agregado al carrito
              </p>
              <p className="truncate text-xs font-semibold text-on-surface">
                {last.label}
              </p>
            </div>
            <ShoppingBag size={14} className="flex-shrink-0 text-on-surface-variant" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
