import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CartItem,
  CartItemModifier,
  CartPromotionMeta,
} from "@pollon/types";

export const PROMO_PRODUCT_PREFIX = "promo:";
export const promoCartKey = (promoId: string) => `${PROMO_PRODUCT_PREFIX}${promoId}`;
export const isPromoCartItem = (item: { productId: string }) =>
  item.productId.startsWith(PROMO_PRODUCT_PREFIX);

function modifierSignature(mods?: CartItemModifier[] | null): string {
  if (!mods || mods.length === 0) return "";
  return mods
    .map((m) => `${m.name}:${m.option}:${m.qty ?? 1}`)
    .sort()
    .join("|");
}

function itemKey(item: { productId: string; variant: string | null; modifiers?: CartItemModifier[] }) {
  return `${item.productId}::${item.variant ?? ""}::${modifierSignature(item.modifiers)}`;
}

interface CartState {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  addPromotion: (promo: CartPromotionMeta) => void;
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

      addPromotion: (promo) => {
        const cartEntry: CartItem = {
          productId: promoCartKey(promo.id),
          name: promo.name,
          price: promo.price,
          qty: 1,
          variant: null,
          notes: "",
          imageUrl: null,
          promotion: promo,
        };
        set((state) => {
          const key = itemKey(cartEntry);
          const existing = state.items.find((i) => itemKey(i) === key);
          if (existing) {
            return {
              items: state.items.map((i) =>
                itemKey(i) === key ? { ...i, qty: i.qty + 1 } : i
              ),
            };
          }
          return { items: [...state.items, cartEntry] };
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
