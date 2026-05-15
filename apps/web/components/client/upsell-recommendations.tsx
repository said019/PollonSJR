"use client";

/**
 * Upsell — pre-checkout recommendation strip grounded in marketing psychology.
 *
 * Design principles applied:
 * - Social proof: "Popular" / "Los más pedidos" tags build trust through
 *   perceived majority behavior (Cialdini).
 * - Complementarity bias: a cart with pollo is primed to accept
 *   bebidas/complementos — we score candidates by category fit.
 * - Scarcity & urgency: "Solo hoy" creates a loss-aversion pull
 *   (Kahneman/Tversky prospect theory).
 * - Reciprocity framing: "Agrega por $X" softens the add-on ask vs. a
 *   full-price display.
 * - Choice architecture: cap visible options at 3 to avoid the
 *   paradox-of-choice drop-off (Schwartz).
 * - Anchoring: order cards high→low so the first anchor-sets
 *   "small" perception for cheaper items after it.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";

import { api } from "@/lib/api";
import { formatCents } from "@pollon/utils";
import type { MenuByCategory, ProductPublic } from "@pollon/types";
import { useCart } from "@/hooks/useCart";
import { useCartFeedback } from "@/store/cart-feedback";
import { resolveProductImage } from "@/lib/product-images";

interface CartLike {
  productId: string;
  name: string;
}

interface Recommendation {
  product: ProductPublic;
  score: number;
}

/* ════════════════════════════════════════════════════════════════ */
/*  Scoring & selection                                             */
/* ════════════════════════════════════════════════════════════════ */

/**
 * Score each candidate product against the current cart.
 * Higher = better recommendation.
 */
function scoreCandidate(
  product: ProductPublic,
  cart: CartLike[],
  cartCategories: Set<string>,
): number {
  let score = 0;

  // Hard filters
  if (product.soldOut) return -1;
  if (cart.some((i) => i.productId === product.id)) return -1;

  // Complementarity: what pairs well with what's already in the cart
  const hasPollo = cartCategories.has("POLLO_FRITO");
  const hasCombo = cartCategories.has("COMBOS");
  const hasBurger = cartCategories.has("HAMBURGUESAS");
  const hasDrink = cartCategories.has("BEBIDAS");
  const hasSide = cartCategories.has("COMPLEMENTOS") || cartCategories.has("SNACKS");

  if (product.category === "BEBIDAS" && !hasDrink) score += 45;
  if (product.category === "COMPLEMENTOS" && (hasPollo || hasCombo) && !hasSide) score += 40;
  if (product.category === "SNACKS" && (hasBurger || hasCombo) && !hasSide) score += 35;
  if (product.category === "SNACKS" && hasPollo) score += 25;

  // "Easy add" nudge — cheap items close to impulse price are high-conversion
  if (product.price <= 3000) score += 18;
  else if (product.price <= 6000) score += 10;
  else if (product.price >= 15000) score -= 8;

  // Anchor/flagship boost for curated picks — a malteada, boneless, or bisquet are
  // well-known crowd-pleasers that photograph well.
  const impulseWinners = new Set([
    "Malteada",
    "Boneless",
    "Bisquet",
    "Papas a la Francesa",
    "Soda Italiana",
    "Refresco",
    "Nuggets x6",
  ]);
  if (impulseWinners.has(product.name)) score += 15;

  // Small randomness so repeat views vary slightly (reduces banner blindness).
  score += Math.random() * 2;

  return score;
}

function pickRecommendations(
  menu: MenuByCategory[],
  cart: CartLike[],
): Recommendation[] {
  const cartCategories = new Set<string>();
  const cartProductIds = new Set(cart.map((i) => i.productId));
  for (const cat of menu) {
    for (const p of cat.products) {
      if (cartProductIds.has(p.id)) cartCategories.add(cat.category);
    }
  }

  const scored = menu
    .flatMap((cat) => cat.products)
    .map((product) => ({
      product,
      score: scoreCandidate(product, cart, cartCategories),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);

  // Dedupe by category so we show variety (max 1 per category).
  const seen = new Set<string>();
  const diverse = scored.filter((r) => {
    if (seen.has(r.product.category)) return false;
    seen.add(r.product.category);
    return true;
  });

  // Cap at 4 to respect choice architecture pero sin abrumar.
  return diverse.slice(0, 4).map((r) => ({
    product: r.product,
    score: r.score,
  }));
}

/* ════════════════════════════════════════════════════════════════ */
/*  Component                                                       */
/* ════════════════════════════════════════════════════════════════ */

/**
 * Upsell COMPACTO — patrón Rappi/UberEats/DiDi:
 * - El cart drawer prioriza la lista de productos (lo que el cliente vino a
 *   ver/editar). El upsell es secundario: una fila de chips horizontales
 *   ~70px de alto en total, no cards gigantes.
 * - Sin badges psicológicos amontonados encima de cada imagen, sin "trust
 *   signal" debajo, sin subtítulo. El cliente sabe qué es ese row sin
 *   que se lo expliquemos.
 *
 * El scoring (complementariedad por categoría + precio) sigue siendo el
 * mismo, sólo cambió la presentación.
 */
export function UpsellRecommendations() {
  const { items, addItem } = useCart();
  const notify = useCartFeedback((s) => s.notify);

  const { data: menu } = useQuery({
    queryKey: ["menu"],
    queryFn: () => api.get<MenuByCategory[]>("/api/menu"),
    staleTime: 5 * 60 * 1000,
  });

  const recommendations = useMemo(() => {
    if (!menu || items.length === 0) return [];
    return pickRecommendations(menu, items);
  }, [menu, items]);

  if (recommendations.length === 0) return null;

  const handleAdd = (product: ProductPublic) => {
    const imageUrl = resolveProductImage(product.name, product.imageUrl);
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      qty: 1,
      variant: null,
      notes: "",
      imageUrl,
    });
    notify(`1× ${product.name}`);
  };

  return (
    <section className="border-t border-outline-variant/10 bg-surface-container-high/30 px-4 py-2.5">
      <h3 className="mb-1.5 flex items-center gap-1.5 font-headline text-[11px] font-bold uppercase tracking-[0.18em] text-on-surface-variant/70">
        <span className="text-secondary">✨</span>
        Complementa tu pedido
      </h3>

      <div
        className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4"
        style={{ scrollbarWidth: "none" }}
      >
        <AnimatePresence initial={false}>
          {recommendations.map((rec, idx) => {
            const imageUrl = resolveProductImage(
              rec.product.name,
              rec.product.imageUrl
            );
            return (
              <motion.button
                key={rec.product.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: idx * 0.04, duration: 0.2 }}
                onClick={() => handleAdd(rec.product)}
                aria-label={`Agregar ${rec.product.name}`}
                className="group flex w-[155px] flex-shrink-0 items-center gap-2 rounded-xl border border-outline-variant/15 bg-surface-container px-2 py-1.5 text-left transition-all hover:border-primary/40 active:scale-[0.97]"
              >
                <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg">
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt=""
                      fill
                      sizes="44px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-surface-variant text-base">
                      🍽️
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-[11px] font-bold leading-tight text-on-surface">
                    {rec.product.name}
                  </p>
                  <p className="font-headline text-[11px] font-extrabold text-primary">
                    {formatCents(rec.product.price)}
                  </p>
                </div>
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-primary text-on-primary shadow-sm">
                  <Plus size={12} strokeWidth={3} />
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </section>
  );
}
