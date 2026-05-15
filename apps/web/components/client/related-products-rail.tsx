"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ProductPublic } from "@pollon/types";
import { formatCents } from "@pollon/utils";
import { useCart } from "@/hooks/useCart";
import { resolveProductImage } from "@/lib/product-images";
import { Plus, Sparkles, Check } from "lucide-react";
import { useState } from "react";

/**
 * "Va bien con esto" — collaborative filtering simple.
 * Pega a /api/menu/recommendations/with/:productId y lista hasta 4 productos
 * que la gente pide junto con éste.
 *
 * El click agrega directo al carrito con el precio base (sin variant ni mods).
 * Si el producto requiere modificadores obligatorios, la validación del carrito
 * lo va a marcar y el cliente lo configura ahí o al checkout. Es la fricción
 * más baja para upsell — un tap, listo.
 */
export function RelatedProductsRail({ productId }: { productId: string }) {
  const { addItem } = useCart();
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["recs-with", productId],
    queryFn: () =>
      api.get<{ items: ProductPublic[] }>(
        `/api/menu/recommendations/with/${productId}`
      ),
    staleTime: 5 * 60_000,
  });

  if (isLoading || !data || data.items.length === 0) return null;

  const handleAdd = (p: ProductPublic) => {
    // Precio base si no hay variants (si hay, usamos el primero).
    const price =
      Array.isArray(p.variants) && p.variants.length > 0
        ? p.variants[0].price
        : p.price;
    addItem({
      productId: p.id,
      name: p.name,
      price,
      qty: 1,
      variant: Array.isArray(p.variants) && p.variants.length > 0 ? p.variants[0].label : null,
      notes: "",
      imageUrl: resolveProductImage(p.name, p.imageUrl) ?? null,
    });
    setJustAdded((prev) => new Set(prev).add(p.id));
    setTimeout(() => {
      setJustAdded((prev) => {
        const next = new Set(prev);
        next.delete(p.id);
        return next;
      });
    }, 1500);
  };

  return (
    <div className="border-t border-outline-variant/15 px-4 py-4 sm:px-5">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Sparkles size={13} className="text-secondary" />
        <h3 className="font-headline text-[11px] font-bold uppercase tracking-[0.2em] text-tertiary">
          Va bien con esto
        </h3>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-2.5">
          {data.items.map((p) => {
            const added = justAdded.has(p.id);
            const img = resolveProductImage(p.name, p.imageUrl);
            return (
              <div
                key={p.id}
                className="flex w-32 flex-shrink-0 flex-col overflow-hidden rounded-2xl border border-outline-variant/15 bg-surface-container"
              >
                <div className="relative aspect-square w-full overflow-hidden bg-surface-container-high">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl">
                      {p.emoji || "🍴"}
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                  <p className="line-clamp-2 text-[11px] font-bold leading-tight text-on-surface">
                    {p.name}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-1">
                    <span className="font-headline text-[11px] font-extrabold text-primary">
                      {formatCents(p.price)}
                    </span>
                    <button
                      onClick={() => handleAdd(p)}
                      aria-label={`Agregar ${p.name}`}
                      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full transition-all active:scale-90 ${
                        added
                          ? "bg-emerald-500 text-white"
                          : "bg-primary text-on-primary shadow-md shadow-primary/30"
                      }`}
                    >
                      {added ? <Check size={13} /> : <Plus size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
