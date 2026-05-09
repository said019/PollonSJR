"use client";

import type { ProductPublic } from "@pollon/types";
import { ProductCard } from "./product-card";
import { Heart } from "lucide-react";

export function FavoritesSection({ products }: { products: ProductPublic[] }) {
  if (products.length === 0) return null;
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <Heart size={16} className="fill-error text-error" />
        <h2 className="font-headline text-sm font-bold uppercase tracking-[0.2em] text-tertiary">
          Tus favoritos
        </h2>
        <span className="rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-bold text-error">
          {products.length}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.slice(0, 6).map((p) => (
          <ProductCard key={p.id} product={p} variant="grid" />
        ))}
      </div>
    </section>
  );
}
