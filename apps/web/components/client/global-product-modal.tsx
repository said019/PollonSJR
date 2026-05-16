"use client";

import { ProductOptionsModal } from "./product-options-modal";
import { useProductModal } from "@/store/product-modal";
import { useCart } from "@/hooks/useCart";
import { useCartFeedback } from "@/store/cart-feedback";

/**
 * ÚNICA instancia del modal de opciones de producto en toda la app.
 * Montar exactamente una vez (lo hace MenuPage). Todos los flujos
 * (tarjeta del menú, editar desde el carrito, sugerencias del carrito
 * vacío) abren ESTE modal vía useProductModal.open(...). Centraliza
 * agregar vs editar-reemplazar para que la lógica sea una sola.
 */
export function GlobalProductModal() {
  const req = useProductModal((s) => s.req);
  const close = useProductModal((s) => s.close);
  const { addItem, removeItem } = useCart();
  const notify = useCartFeedback((s) => s.notify);

  return (
    <ProductOptionsModal
      open={!!req}
      product={req?.product ?? null}
      editing={req?.editing}
      defaultVariant={req?.defaultVariant ?? null}
      defaultModifiers={req?.defaultModifiers}
      defaultQty={req?.defaultQty}
      defaultNotes={req?.defaultNotes}
      imageUrl={req?.imageUrl ?? ""}
      onClose={close}
      onConfirm={({ variant, modifiers, qty, notes, finalUnitPrice }) => {
        if (!req) return;

        if (req.editing && req.editKey) {
          // Reemplazo: quita la línea original y agrega la editada.
          removeItem(
            req.editKey.productId,
            req.editKey.variant,
            req.editKey.modifiers
          );
          addItem({
            productId: req.editKey.productId,
            name: req.editName ?? req.product.name,
            price: finalUnitPrice,
            qty,
            variant,
            notes,
            imageUrl: req.editImageUrl ?? req.imageUrl,
            modifiers,
          });
        } else {
          addItem({
            productId: req.product.id,
            name: req.product.name,
            price: finalUnitPrice,
            qty,
            variant,
            notes,
            imageUrl: req.imageUrl,
            modifiers,
          });
          notify(
            `${qty}× ${req.product.name}${variant ? ` (${variant})` : ""}`
          );
        }

        close();
      }}
    />
  );
}
