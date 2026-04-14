"use client";

import { useCartStore } from "@/store/cart";

export function useCart() {
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const updateQty = useCartStore((s) => s.updateQty);
  const clearCart = useCartStore((s) => s.clearCart);
  const total = useCartStore((s) => s.getTotal());
  const itemCount = useCartStore((s) => s.getItemCount());

  return { items, addItem, removeItem, updateQty, clearCart, total, itemCount };
}
