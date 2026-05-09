import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem, CartItemModifier } from "@pollon/types";

function modifierSignature(mods?: CartItemModifier[] | null): string {
  if (!mods || mods.length === 0) return "";
  return mods
    .map((m) => `${m.name}:${m.option}`)
    .sort()
    .join("|");
}

function itemKey(item: { productId: string; variant: string | null; modifiers?: CartItemModifier[] }) {
  return `${item.productId}::${item.variant ?? ""}::${modifierSignature(item.modifiers)}`;
}

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, variant: string | null, modifiers?: CartItemModifier[]) => void;
  updateQty: (productId: string, variant: string | null, qty: number, modifiers?: CartItemModifier[]) => void;
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
          const key = itemKey(item);
          const existing = state.items.find((i) => itemKey(i) === key);

          if (existing) {
            return {
              items: state.items.map((i) =>
                itemKey(i) === key ? { ...i, qty: i.qty + item.qty } : i
              ),
            };
          }

          return { items: [...state.items, item] };
        });
      },

      removeItem: (productId, variant, modifiers) => {
        const key = itemKey({ productId, variant, modifiers });
        set((state) => ({
          items: state.items.filter((i) => itemKey(i) !== key),
        }));
      },

      updateQty: (productId, variant, qty, modifiers) => {
        if (qty <= 0) {
          get().removeItem(productId, variant, modifiers);
          return;
        }
        const key = itemKey({ productId, variant, modifiers });
        set((state) => ({
          items: state.items.map((i) =>
            itemKey(i) === key ? { ...i, qty } : i
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
