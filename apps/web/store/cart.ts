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

/* ─── TEMPORAL: registro de eventos del carrito (debug bug combo) ───
   Store separado, NO persistido. Anota cada add/remove/clear con hora
   y conteo antes→después para atrapar el fallo intermitente en mobile
   aunque el estado se borre justo después. Se quita con el panel. */
export const useCartLog = create<{
  lines: string[];
  push: (s: string) => void;
}>((set) => ({
  lines: [],
  push: (s) =>
    set((st) => ({
      lines: [...st.lines.slice(-7), s],
    })),
}));

function logCart(s: string) {
  const t = new Date().toTimeString().slice(0, 8);
  useCartLog.getState().push(`${t} ${s}`);
}

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
        const before = get().items.length;
        let merged = false;
        set((state) => {
          const key = itemKey(item);
          const existing = state.items.find((i) => itemKey(i) === key);

          if (existing) {
            merged = true;
            return {
              items: state.items.map((i) =>
                itemKey(i) === key ? { ...i, qty: i.qty + item.qty } : i
              ),
            };
          }

          return { items: [...state.items, item] };
        });
        const after = get().items.length;
        const sig =
          item.modifiers && item.modifiers.length
            ? item.modifiers
                .map((m) => `${m.name}:${m.option}:${m.qty ?? 1}`)
                .join("|")
            : "—";
        logCart(
          `ADD ${item.name} q${item.qty} mods=${sig} | ${before}->${after}${
            merged ? " (MERGE)" : ""
          }`
        );
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
        const before = get().items.length;
        const key = itemKey({ productId, variant, modifiers });
        set((state) => ({
          items: state.items.filter((i) => itemKey(i) !== key),
        }));
        logCart(`REMOVE ${productId} | ${before}->${get().items.length}`);
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

      clearCart: () => {
        const before = get().items.length;
        set({ items: [] });
        logCart(`CLEAR | ${before}->0`);
      },

      getTotal: () => get().items.reduce((sum, i) => sum + i.price * i.qty, 0),

      getItemCount: () => get().items.reduce((sum, i) => sum + i.qty, 0),
    }),
    {
      name: "pollon-cart",
      // TEMPORAL: si una rehidratación tardía pisa el combo recién
      // agregado, el log mostrará "ADD ... 1->2" seguido de
      // "REHYDRATE -> 1" — esa es la prueba del bug.
      onRehydrateStorage: () => (state) => {
        logCart(`REHYDRATE -> ${state?.items.length ?? "?"} lines`);
      },
    }
  )
);
