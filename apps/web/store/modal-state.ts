import { create } from "zustand";

/**
 * Contador global de modales de producto abiertos.
 *
 * Resuelve dos cosas:
 *  1. La barra fija "Ver carrito" del menú se ocultaba cuando había un modal
 *     abierto — antes se quedaba al fondo y el usuario pensaba que ESE era el
 *     botón de agregar, sin ver el "Agregar al carrito" verdadero del modal.
 *  2. Soporta varios modales anidados (raro pero posible si un día abrimos uno
 *     desde otro): mientras count > 0 hay al menos uno abierto.
 */
interface ModalState {
  productModalCount: number;
  openProductModal: () => void;
  closeProductModal: () => void;
}

export const useModalState = create<ModalState>((set) => ({
  productModalCount: 0,
  openProductModal: () =>
    set((s) => ({ productModalCount: s.productModalCount + 1 })),
  closeProductModal: () =>
    set((s) => ({
      productModalCount: Math.max(0, s.productModalCount - 1),
    })),
}));
