"use client";

import type { ProductPublic } from "@pollon/types";
import { formatCents } from "@pollon/utils";
import { useCart } from "@/hooks/useCart";
import { Plus } from "lucide-react";
import { useState } from "react";

interface ProductCardProps {
  product: ProductPublic;
}

export function ProductCard({ product }: ProductCardProps) {
  const { addItem } = useCart();
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);

  const handleAdd = () => {
    const variant = selectedVariant;
    const price =
      variant && product.variants
        ? product.variants.find((v) => v.label === variant)?.price ?? product.price
        : product.price;

    addItem({
      productId: product.id,
      name: product.name,
      price,
      qty: 1,
      variant,
      notes: "",
      imageUrl: product.imageUrl,
    });
  };

  return (
    <div className={`group bg-surface-container rounded-2xl p-3.5 border border-outline-variant/10 hover:border-primary/20 flex gap-3.5 transition-all duration-300 ${product.soldOut ? "opacity-40" : ""}`}>
      {product.imageUrl && (
        <img
          src={product.imageUrl}
          alt={product.name}
          className="w-20 h-20 rounded-xl object-cover flex-shrink-0 group-hover:scale-[1.03] transition-transform duration-300"
        />
      )}
      <div className="flex-1 min-w-0">
        <h3 className="font-headline font-bold text-sm text-tertiary">{product.name}</h3>
        {product.description && (
          <p className="text-xs text-on-surface-variant/70 mt-0.5 line-clamp-2 leading-relaxed">{product.description}</p>
        )}

        {product.variants && product.variants.length > 0 ? (
          <div className="flex gap-1.5 mt-2.5 flex-wrap">
            {product.variants.map((v) => (
              <button
                key={v.label}
                onClick={() => setSelectedVariant(v.label)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium transition-all ${
                  selectedVariant === v.label
                    ? "bg-primary text-on-primary border-primary shadow-sm"
                    : "border-outline-variant/20 text-on-surface-variant hover:border-primary/30"
                }`}
              >
                {v.label} {formatCents(v.price)}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm font-headline font-bold text-primary mt-1.5">
            {formatCents(product.price)}
          </p>
        )}
      </div>

      <button
        onClick={handleAdd}
        disabled={product.soldOut}
        className="self-center bg-primary/15 text-primary w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 hover:bg-primary hover:text-on-primary transition-all disabled:bg-outline-variant/20 disabled:text-on-surface-variant/40"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
