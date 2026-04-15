"use client";

import { useEffect, useState } from "react";
import { useCartStore } from "@/store/cart";

export function useCart() {
  // Guard against server/client mismatch: Zustand's persist middleware rehydrates
  // from localStorage synchronously on the client, so the first client render
  // would differ from the server-rendered HTML → React hydration errors #418 / #423.
  // We return empty/zero values until after mount, then expose the real state.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQty = useCartStore((s) => s.updateQty);
  const clearCart = useCartStore((s) => s.clearCart);
  // Derive totals inline from state to avoid calling get() inside a selector
  const total = useCartStore((s) =>
    s.items.reduce((sum, i) => sum + i.price * i.qty, 0)
  );
  const itemCount = useCartStore((s) =>
    s.items.reduce((sum, i) => sum + i.qty, 0)
  );

  return {
    items: hydrated ? items : [],
    addItem,
    removeItem,
    updateQty,
    clearCart,
    total: hydrated ? total : 0,
    itemCount: hydrated ? itemCount : 0,
  };
}
