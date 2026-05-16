"use client";

/**
 * EmptyCartSuggestions — shown when cart is empty.
 *
 * Psychology: Anchoring + Reciprocity.
 * Presenting 3 curated "starter" picks removes the blank-slate paralysis
 * and shortcuts the user into the order funnel immediately.
 * We pick one from each high-conversion category (combo, pollo, bebida).
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import Image from "next/image";
import { Plus, Flame } from "lucide-react";
import { motion } from "framer-motion";

import { api } from "@/lib/api";
import { formatCents } from "@pollon/utils";
import type { MenuByCategory, ProductPublic } from "@pollon/types";
import { useCart } from "@/hooks/useCart";
import { resolveProductImage } from "@/lib/product-images";
import { productNeedsOptions } from "@/lib/cart-validation";
import { useProductModal } from "@/store/product-modal";

const STARTER_CATEGORIES = ["COMBOS", "POLLO_FRITO", "BEBIDAS", "HAMBURGUESAS"];
const STARTER_PICKS = new Set([
  "Combo Familiar",
  "Combo Duo",
  "Pollo Frito",
  "Boneless",
  "Malteada",
  "Soda Italiana",
  "Hamburguesa",
]);

function pickStarters(menu: MenuByCategory[]): ProductPublic[] {
  const seen = new Set<string>();
  const picks: ProductPublic[] = [];

  // First pass: named picks
  for (const catKey of STARTER_CATEGORIES) {
    const cat = menu.find((c) => c.category === catKey);
    if (!cat) continue;
    const pick = cat.products.find(
      (p) => !p.soldOut && (STARTER_PICKS.has(p.name) || [...STARTER_PICKS].some((n) => p.name.startsWith(n)))
    ) ?? cat.products.find((p) => !p.soldOut);
    if (pick && !seen.has(pick.id)) {
      seen.add(pick.id);
      picks.push(pick);
    }
    if (picks.length >= 3) break;
  }

  // Fill remaining with first available products
  if (picks.length < 3) {
    for (const cat of menu) {
      for (const p of cat.products) {
        if (!p.soldOut && !seen.has(p.id)) {
          seen.add(p.id);
          picks.push(p);
          if (picks.length >= 3) break;
        }
      }
      if (picks.length >= 3) break;
    }
  }

  return picks.slice(0, 3);
}

export function EmptyCartSuggestions({ onClose }: { onClose: () => void }) {
  const { addItem } = useCart();
  const openProductModal = useProductModal((s) => s.open);

  const { data: menu } = useQuery({
    queryKey: ["menu"],
    queryFn: () => api.get<MenuByCategory[]>("/api/menu"),
    staleTime: 5 * 60 * 1000,
  });

  const starters = useMemo(() => {
    if (!menu) return [];
    return pickStarters(menu);
  }, [menu]);

  if (starters.length === 0) return null;

  const handleAdd = (product: ProductPublic) => {
    // If the product has required options (modifiers, quota, variants),
    // open the options modal first instead of adding straight to the cart.
    if (productNeedsOptions(product)) {
      openProductModal({
        product,
        imageUrl: resolveProductImage(product.name, product.imageUrl),
      });
      return;
    }
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
    <div className="px-4 pb-4">
      <div className="mb-3 flex items-center gap-2">
        <Flame size={14} className="text-primary" />
        <h3 className="font-headline text-xs font-extrabold uppercase tracking-widest text-on-surface-variant/70">
          Populares para empezar
        </h3>
      </div>

      <div className="space-y-2.5">
        {starters.map((product, idx) => {
          const imageUrl = resolveProductImage(product.name, product.imageUrl);
          return (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.07, duration: 0.3 }}
              className="group flex items-center gap-3 rounded-2xl border border-outline-variant/10 bg-surface-container-high p-3 hover:border-primary/25 transition-all"
            >
              {/* Thumbnail */}
              <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl">
                {imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt={product.name}
                    fill
                    sizes="56px"
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 to-surface-container text-xl">
                    🍗
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <p className="font-headline text-sm font-bold text-tertiary leading-tight">
                  {product.name}
                </p>
                {product.description && (
                  <p className="line-clamp-1 text-[10px] text-on-surface-variant/60 mt-0.5">
                    {product.description}
                  </p>
                )}
                <p className="font-headline text-sm font-extrabold text-primary mt-1">
                  {formatCents(product.price)}
                </p>
              </div>

              {/* Add button */}
              <motion.button
                onClick={() => handleAdd(product)}
                whileTap={{ scale: 0.88 }}
                whileHover={{ scale: 1.08 }}
                aria-label={`Agregar ${product.name}`}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary shadow-md shadow-primary/30"
              >
                <Plus size={16} strokeWidth={2.8} />
              </motion.button>
            </motion.div>
          );
        })}
      </div>

      {/* Las opciones se eligen en el modal ÚNICO global. */}
    </div>
  );
}
