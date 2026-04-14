import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@pollon/types";

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, variant: string | null) => void;
  updateQty: (productId: string, variant: string | null, qty: number) => void;
  clearCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        set((state) => {
          const existing = state.items.find(
            (i) => i.productId === item.productId && i.variant === item.variant
          );

          if (existing) {
            return {
              items: state.items.map((i) =>
                i.productId === item.productId && i.variant === item.variant
                  ? { ...i, qty: i.qty + item.qty }
                  : i
              ),
            };
          }

          return { items: [...state.items, item] };
        });
      },

      removeItem: (productId, variant) => {
        set((state) => ({
          items: state.items.filter(
            (i) => !(i.productId === productId && i.variant === variant)
          ),
        }));
      },

      updateQty: (productId, variant, qty) => {
        if (qty <= 0) {
          get().removeItem(productId, variant);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId && i.variant === variant
              ? { ...i, qty }
              : i
          ),
        }));
      },

      clearCart: () => set({ items: [] }),

      getTotal: () => get().items.reduce((sum, i) => sum + i.price * i.qty, 0),

      getItemCount: () => get().items.reduce((sum, i) => sum + i.qty, 0),
    }),
    { name: "pollon-cart" }
  )
);
