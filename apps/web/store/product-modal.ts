import { create } from "zustand";
import type { ProductPublic, CartItemModifier } from "@pollon/types";

/**
 * Modal de opciones de producto ÚNICO y global.
 *
 * Antes cada ProductCard montaba su propio <ProductOptionsModal> (vimos 11+
 * montados a la vez en el menú) y el carrito montaba otro para editar. Con
 * varios modales montados, en móvil el toque "Agregar al carrito" cruzaba al
 * modal equivocado: el cliente configuraba un combo pero se confirmaba otro,
 * o no se confirmaba nada. Ahora hay UN solo modal en toda la app, manejado
 * por este store. Imposible encimar o cruzar.
 */
export interface ProductModalRequest {
  product: ProductPublic;
  imageUrl: string | null;
  defaultVariant?: string | null;
  /** Cuando se edita una línea existente del carrito. */
  editing?: boolean;
  /** Clave de la línea original a reemplazar (solo edición). */
  editKey?: {
    productId: string;
    variant: string | null;
    modifiers?: CartItemModifier[];
  };
  defaultModifiers?: CartItemModifier[];
  defaultQty?: number;
  defaultNotes?: string;
  /** Nombre/imagen a conservar al re-agregar en edición. */
  editName?: string;
  editImageUrl?: string | null;
}

interface ProductModalState {
  req: ProductModalRequest | null;
  open: (r: ProductModalRequest) => void;
  close: () => void;
}

export const useProductModal = create<ProductModalState>((set) => ({
  req: null,
  open: (r) => set({ req: r }),
  close: () => set({ req: null }),
}));
