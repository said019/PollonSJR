"use client";

import { useCart } from "@/hooks/useCart";
import { formatCents } from "@pollon/utils";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { LoyaltyInfo } from "@pollon/types";
import { X, Minus, Plus, Trash2, ShoppingBag, Bike, Gift } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckoutForm } from "./checkout-form";
import { UpsellRecommendations } from "./upsell-recommendations";
import { EmptyCartSuggestions } from "./empty-cart-suggestions";
import { useState, useEffect } from "react";
import { getToken } from "@/lib/auth";

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  onRequireAuth?: () => void;
}

export function CartDrawer({ open, onClose, onRequireAuth }: CartDrawerProps) {
  const { items, updateQty, removeItem, total, clearCart } = useCart();
  const [showCheckout, setShowCheckout] = useState(false);

  // Hydration-safe token for loyalty query
  const [loyaltyToken, setLoyaltyToken] = useState<string | null>(null);
  useEffect(() => {
    setLoyaltyToken(getToken());
  }, []);

  const { data: loyaltyInfo } = useQuery({
    queryKey: ["loyalty-cart"],
    queryFn: () => api.get<LoyaltyInfo>("/api/loyalty/me", loyaltyToken || undefined),
    enabled: !!loyaltyToken,
  });

  const hasPendingReward = loyaltyInfo?.pendingReward ?? false;

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
              /* ─── Empty cart: quick suggestions ─── */
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="flex flex-col items-center px-5 pt-8 pb-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary mb-3">
                    <ShoppingBag size={28} />
                  </div>
                  <h3 className="font-headline text-lg font-extrabold text-tertiary">Tu carrito está vacío</h3>
                  <p className="mt-1 text-sm text-on-surface-variant/70">
                    ¿Qué se te antoja hoy?
                  </p>
                </div>
                <EmptyCartSuggestions onClose={onClose} />
              </div>
            ) : showCheckout ? (
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <CheckoutForm onBack={() => setShowCheckout(false)} onSuccess={onClose} />
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
                  {items.map((item, idx) => (
                    <div
                      key={`${item.productId}-${item.variant}-${idx}`}
                      className="flex items-start gap-3 bg-surface-container-high rounded-xl p-3.5 border border-outline-variant/10"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-headline font-semibold text-sm text-tertiary">
                          {item.name}
                          {item.variant && (
                            <span className="text-xs text-on-surface-variant/60 ml-1 font-body">({item.variant})</span>
                          )}
                        </p>
                        {item.modifiers && item.modifiers.length > 0 && (
                          <p className="text-[11px] text-on-surface-variant/70 mt-0.5">
                            {item.modifiers
                              .map((m) =>
                                (m.qty ?? 1) > 1
                                  ? `${m.qty}× ${m.option}`
                                  : m.option
                              )
                              .join(" · ")}
                          </p>
                        )}
                        <p className="text-sm text-primary font-headline font-bold mt-0.5">
                          {formatCents(item.price * item.qty)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateQty(item.productId, item.variant, item.qty - 1, item.modifiers)}
                          className="w-7 h-7 rounded-lg bg-surface-variant flex items-center justify-center text-on-surface-variant hover:bg-outline-variant transition-colors"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="text-sm font-headline font-bold w-6 text-center text-tertiary">{item.qty}</span>
                        <button
                          onClick={() => updateQty(item.productId, item.variant, item.qty + 1, item.modifiers)}
                          className="w-7 h-7 rounded-lg bg-primary text-on-primary flex items-center justify-center hover:brightness-110 transition-all"
                        >
                          <Plus size={13} />
                        </button>
                        <button
                          onClick={() => removeItem(item.productId, item.variant, item.modifiers)}
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
                      <span className="text-on-surface-variant font-headline font-semibold">Subtotal</span>
                      <span className="text-xl font-headline font-extrabold text-primary">{formatCents(total)}</span>
                    </div>

                    {hasPendingReward && (
                      <p className="text-xs text-green-400 flex items-center gap-1 mt-1">
                        <Gift size={12} /> Tienes un producto gratis — se aplica al pagar
                      </p>
                    )}

                    {/* Delivery fee hint */}
                    <div className="flex items-center gap-2 rounded-lg bg-surface-container-high px-3 py-2 text-[11px] text-on-surface-variant/70">
                      <Bike size={13} className="text-primary flex-shrink-0" />
                      <span>Envío a domicilio desde <strong className="text-primary">$25</strong> · Gratis en combos grandes</span>
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
