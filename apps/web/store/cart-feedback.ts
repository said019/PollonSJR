import { create } from "zustand";

/**
 * Feedback ephemero cuando el cliente agrega items al carrito.
 *
 * Por qué existe: las apps de delivery serias (Rappi, UberEats, DiDi) NUNCA
 * abren el carrito al agregar. Te dejan en el menú con un micro-toast y la
 * barra inferior actualizada. Antes nuestro flujo abría el cart drawer al
 * darle "Pedir lo mismo" o agregar una promo → la persona quedaba forzada
 * al checkout sin terminar de comprar.
 *
 * Patrón: cualquier acción de agregar llama notifyCartAdd(...). El consumer
 * (toast + animación del icono carrito) lee este store y se anima.
 */
interface FeedbackEvent {
  /** Id incremental, ayuda a forzar re-render del toast aunque sea el mismo texto */
  id: number;
  /** "1× Combo Familiar" o "2 items agregados" */
  label: string;
  ts: number;
}

interface CartFeedbackState {
  last: FeedbackEvent | null;
  /** Counter que se incrementa cada add, para animar el icono del header */
  pulseTick: number;
  notify: (label: string) => void;
  clear: () => void;
}

export const useCartFeedback = create<CartFeedbackState>((set, get) => ({
  last: null,
  pulseTick: 0,
  notify: (label) =>
    set({
      last: { id: get().pulseTick + 1, label, ts: Date.now() },
      pulseTick: get().pulseTick + 1,
    }),
  clear: () => set({ last: null }),
}));
