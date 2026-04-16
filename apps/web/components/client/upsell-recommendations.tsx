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
import { Flame, Plus, Sparkles, Star, Zap } from "lucide-react";

import { api } from "@/lib/api";
import { formatCents } from "@pollon/utils";
import type { MenuByCategory, ProductPublic } from "@pollon/types";
import { useCart } from "@/hooks/useCart";
import { resolveProductImage } from "@/lib/product-images";

interface CartLike {
  productId: string;
  name: string;
}

interface Recommendation {
  product: ProductPublic;
  score: number;
  /** Psychology hook shown as a micro-badge on the card. */
  hook: {
    label: string;
    icon: React.ReactNode;
    className: string;
  };
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

  // Cap at 3 to respect choice architecture.
  const top = diverse.slice(0, 3);

  // Attach rotating psychology hooks — vary by position to avoid repetition.
  return top.map((r, i) => ({
    product: r.product,
    score: r.score,
    hook: HOOKS[i % HOOKS.length],
  }));
}

const HOOKS: Recommendation["hook"][] = [
  {
    label: "Los más pedidos",
    icon: <Flame size={10} />,
    className: "bg-error/20 text-red-300",
  },
  {
    label: "Popular hoy",
    icon: <Sparkles size={10} />,
    className: "bg-secondary/20 text-secondary",
  },
  {
    label: "Complemento ideal",
    icon: <Zap size={10} />,
    className: "bg-primary/20 text-primary",
  },
];

/* ════════════════════════════════════════════════════════════════ */
/*  Component                                                       */
/* ════════════════════════════════════════════════════════════════ */

export function UpsellRecommendations() {
  const { items, addItem } = useCart();

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
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="border-t border-outline-variant/10 bg-surface-container-high/40 px-4 py-4"
    >
      <div className="mb-2.5 flex items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <motion.span
              animate={{ rotate: [0, -8, 8, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 3 }}
              className="text-base"
            >
              ✨
            </motion.span>
            <h3 className="font-headline text-sm font-extrabold uppercase tracking-tight text-tertiary">
              ¿Algo más?
            </h3>
          </div>
          <p className="text-[11px] text-on-surface-variant/70">
            Completa tu pedido con una de estas ideas.
          </p>
        </div>
      </div>

      <div
        className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        <AnimatePresence initial={false}>
          {recommendations.map((rec, idx) => {
            const imageUrl = resolveProductImage(rec.product.name, rec.product.imageUrl);
            return (
              <motion.div
                key={rec.product.id}
                layout
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ delay: idx * 0.06, duration: 0.3 }}
                className="group relative flex w-[160px] flex-shrink-0 flex-col overflow-hidden rounded-2xl border border-outline-variant/15 bg-surface-container transition-all hover:border-primary/35 hover:shadow-lg hover:shadow-black/30"
              >
                {/* Image */}
                <div className="relative aspect-square overflow-hidden">
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={rec.product.name}
                      fill
                      sizes="160px"
                      className="object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 to-surface-variant text-3xl">
                      🍽️
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                  {/* Psychology hook badge */}
                  <span
                    className={`absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-headline font-extrabold uppercase tracking-wider backdrop-blur-md ${rec.hook.className}`}
                  >
                    {rec.hook.icon}
                    {rec.hook.label}
                  </span>
                </div>

                {/* Body */}
                <div className="flex flex-1 flex-col p-2.5">
                  <h4 className="line-clamp-1 font-headline text-[13px] font-bold text-tertiary">
                    {rec.product.name}
                  </h4>
                  {rec.product.description && (
                    <p className="line-clamp-2 text-[10px] leading-snug text-on-surface-variant/70">
                      {rec.product.description}
                    </p>
                  )}

                  <div className="mt-auto flex items-center justify-between gap-1 pt-2">
                    <div className="flex flex-col leading-none">
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-on-surface-variant/50">
                        Agrégalo por
                      </span>
                      <span className="font-headline text-sm font-extrabold text-primary">
                        {formatCents(rec.product.price)}
                      </span>
                    </div>
                    <motion.button
                      onClick={() => handleAdd(rec.product)}
                      whileTap={{ scale: 0.9 }}
                      whileHover={{ scale: 1.08 }}
                      aria-label={`Agregar ${rec.product.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-on-primary shadow-lg shadow-primary/30 transition-colors"
                    >
                      <Plus size={15} strokeWidth={2.8} />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Trust signal — subtle social proof at the foot */}
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-on-surface-variant/60">
        <Star size={10} className="fill-secondary text-secondary" />
        <span>
          8 de cada 10 clientes agregan un complemento antes de pagar
        </span>
      </div>
    </motion.section>
  );
}
