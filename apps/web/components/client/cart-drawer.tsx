"use client";

import { useCart } from "@/hooks/useCart";
import { formatCents } from "@pollon/utils";
import { X, Minus, Plus, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckoutForm } from "./checkout-form";
import { UpsellRecommendations } from "./upsell-recommendations";
import { useState } from "react";
import { getToken } from "@/lib/auth";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  onRequireAuth?: () => void;
}

export function CartDrawer({ open, onClose, onRequireAuth }: CartDrawerProps) {
  const { items, updateQty, removeItem, total, clearCart } = useCart();
  const [showCheckout, setShowCheckout] = useState(false);

  const handleCheckout = () => {
    if (!getToken()) {
      onRequireAuth?.();
      return;
    }
    setShowCheckout(true);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-40"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            className="fixed right-0 top-0 z-50 flex h-dvh min-h-0 w-full max-w-sm flex-col overflow-hidden border-l border-outline-variant/10 bg-surface-container shadow-2xl sm:max-w-md"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-outline-variant/10 p-5">
              <h2 className="text-lg font-headline font-extrabold text-tertiary">Tu carrito</h2>
              <button onClick={onClose} className="p-1.5 text-on-surface-variant hover:text-tertiary rounded-lg hover:bg-surface-variant transition-colors">
                <X size={18} />
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-on-surface-variant">
                <p>Tu carrito está vacío</p>
              </div>
            ) : showCheckout ? (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <CheckoutForm onBack={() => setShowCheckout(false)} onSuccess={onClose} />
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
                  {items.map((item) => (
                    <div key={`${item.productId}-${item.variant}`} className="flex items-center gap-3 bg-surface-container-high rounded-xl p-3.5 border border-outline-variant/10">
                      <div className="flex-1 min-w-0">
                        <p className="font-headline font-semibold text-sm text-tertiary">
                          {item.name}
                          {item.variant && (
                            <span className="text-xs text-on-surface-variant/60 ml-1 font-body">({item.variant})</span>
                          )}
                        </p>
                        <p className="text-sm text-primary font-headline font-bold mt-0.5">
                          {formatCents(item.price * item.qty)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateQty(item.productId, item.variant, item.qty - 1)}
                          className="w-7 h-7 rounded-lg bg-surface-variant flex items-center justify-center text-on-surface-variant hover:bg-outline-variant transition-colors"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="text-sm font-headline font-bold w-6 text-center text-tertiary">{item.qty}</span>
                        <button
                          onClick={() => updateQty(item.productId, item.variant, item.qty + 1)}
                          className="w-7 h-7 rounded-lg bg-primary text-on-primary flex items-center justify-center hover:brightness-110 transition-all"
                        >
                          <Plus size={13} />
                        </button>
                        <button
                          onClick={() => removeItem(item.productId, item.variant)}
                          className="ml-1 text-on-surface-variant/40 hover:text-error transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="shrink-0">
                  {/* Upsell strip — pre-checkout recommendations */}
                  <UpsellRecommendations />

                  <div className="space-y-3 border-t border-outline-variant/10 p-5">
                    <div className="flex justify-between items-center">
                      <span className="text-on-surface-variant font-headline font-semibold">Total</span>
                      <span className="text-xl font-headline font-extrabold text-primary">{formatCents(total)}</span>
                    </div>
                    <button
                      onClick={handleCheckout}
                      className="w-full bg-primary text-on-primary py-3.5 rounded-2xl font-headline font-bold hover:brightness-110 transition-all active:scale-[0.98] glow-primary"
                    >
                      Proceder al pago
                    </button>
                    <button
                      onClick={clearCart}
                      className="w-full text-on-surface-variant/50 text-sm py-2 hover:text-error transition-colors font-medium"
                    >
                      Vaciar carrito
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
