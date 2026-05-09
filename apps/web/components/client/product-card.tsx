"use client";

import type { ProductPublic } from "@pollon/types";
import { formatCents } from "@pollon/utils";
import { useCart } from "@/hooks/useCart";
import { useFavorites } from "@/hooks/useFavorites";
import { Plus, Flame, TrendingUp, Heart } from "lucide-react";
import { useState } from "react";
import Image from "next/image";
import { resolveProductImage } from "@/lib/product-images";
import { ProductOptionsModal } from "./product-options-modal";

// Social proof — these are the crowd-pleasers that sell fastest.
// Showing a badge activates herd-behaviour (Cialdini social proof).
const MOST_ORDERED = new Set([
  "Combo Familiar",
  "Pollo Frito",
  "Boneless",
  "Malteada",
  "Papas a la Francesa",
  "Nuggets x6",
  "Soda Italiana",
]);

const POPULAR = new Set([
  "Combo Duo",
  "Bisquet",
  "Hamburguesa Doble",
  "Hamburguesa de Arrachera",
  "Aros de Cebolla",
  "Tiras de Pollo",
]);

function SocialProofBadge({ name }: { name: string }) {
  if (MOST_ORDERED.has(name)) {
    return (
      <span className="absolute right-2.5 top-2.5 z-10 inline-flex items-center gap-0.5 rounded-full bg-error/80 px-2 py-0.5 text-[9px] font-headline font-extrabold uppercase tracking-wider text-white backdrop-blur-md">
        <Flame size={9} className="fill-white" />
        Más pedido
      </span>
    );
  }
  if (POPULAR.has(name)) {
    return (
      <span className="absolute right-2.5 top-2.5 z-10 inline-flex items-center gap-0.5 rounded-full bg-secondary/80 px-2 py-0.5 text-[9px] font-headline font-extrabold uppercase tracking-wider text-on-secondary backdrop-blur-md">
        <TrendingUp size={9} />
        Popular
      </span>
    );
  }
  return null;
}

type Variant = "row" | "grid" | "hero";

interface ProductCardProps {
  product: ProductPublic;
  variant?: Variant;
  featured?: boolean;
}

export function ProductCard({ product, variant = "row", featured = false }: ProductCardProps) {
  const { addItem } = useCart();
  const { isAuthenticated, isFavorite, toggle } = useFavorites();
  const [selectedVariant, setSelectedVariant] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const imageUrl = resolveProductImage(product.name, product.imageUrl);
  const hasModifiers = !!(product.modifiers && product.modifiers.length > 0);
  const fav = isFavorite(product.id);

  const FavoriteButton = isAuthenticated ? (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggle(product.id);
      }}
      aria-label={fav ? "Quitar de favoritos" : "Agregar a favoritos"}
      className={`absolute bottom-2.5 right-2.5 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-md transition-all active:scale-90 ${
        fav
          ? "bg-error/90 text-white shadow-lg shadow-error/40"
          : "bg-black/40 text-white/90 hover:bg-black/60"
      }`}
    >
      <Heart size={14} className={fav ? "fill-current" : ""} />
    </button>
  ) : null;

  const handleAdd = () => {
    if (hasModifiers) {
      setShowOptions(true);
      return;
    }
    const price =
      selectedVariant && product.variants
        ? product.variants.find((v) => v.label === selectedVariant)?.price ?? product.price
        : product.price;

    addItem({
      productId: product.id,
      name: product.name,
      price,
      qty: 1,
      variant: selectedVariant,
      notes: "",
      imageUrl: imageUrl,
    });
  };

  const optionsModal = hasModifiers ? (
    <ProductOptionsModal
      open={showOptions}
      product={product}
      defaultVariant={selectedVariant}
      imageUrl={imageUrl}
      onClose={() => setShowOptions(false)}
      onConfirm={({ variant: v, modifiers, qty, notes, finalUnitPrice }) => {
        addItem({
          productId: product.id,
          name: product.name,
          price: finalUnitPrice,
          qty,
          variant: v,
          notes,
          imageUrl,
          modifiers,
        });
        setShowOptions(false);
      }}
    />
  ) : null;

  const priceRange = (() => {
    if (product.variants && product.variants.length > 0) {
      const sorted = [...product.variants].sort((a, b) => a.price - b.price);
      const min = sorted[0].price;
      const max = sorted[sorted.length - 1].price;
      return min === max ? formatCents(min) : `${formatCents(min)} – ${formatCents(max)}`;
    }
    return formatCents(product.price);
  })();

  // ═══════════════════════════════════════════════════════════
  // HERO — large image-top card used for featured products
  // ═══════════════════════════════════════════════════════════
  if (variant === "hero") {
    return (
      <>
      {optionsModal}
      <div
        className={`group relative overflow-hidden rounded-3xl border border-outline-variant/15 bg-surface-container transition-all duration-500 hover:border-primary/30 ${
          product.soldOut ? "opacity-50" : ""
        }`}
      >
        <div className="relative aspect-[16/10] overflow-hidden">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 100vw, 800px"
              className="object-cover transition-transform duration-700 group-hover:scale-110"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary/20 to-surface-container-high" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent" />
          {featured && (
            <span className="absolute left-4 top-4 rounded-full bg-secondary px-3 py-1 text-[10px] font-headline font-extrabold uppercase tracking-[0.18em] text-on-secondary shadow-lg">
              Favorito
            </span>
          )}
          {!featured && !product.soldOut && (MOST_ORDERED.has(product.name) || POPULAR.has(product.name)) && (
            <SocialProofBadge name={product.name} />
          )}
          {product.soldOut && (
            <span className="absolute right-4 top-4 rounded-full bg-error/90 px-3 py-1 text-[10px] font-headline font-extrabold uppercase tracking-[0.18em] text-on-error shadow-lg">
              Agotado
            </span>
          )}
          {FavoriteButton}
        </div>

        <div className="relative -mt-10 px-5 pb-5 md:px-7 md:pb-7">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="font-headline text-2xl font-extrabold uppercase leading-none tracking-tighter text-tertiary md:text-3xl">
                {product.name}
              </h3>
              {product.description && (
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-on-surface-variant/80">
                  {product.description}
                </p>
              )}
            </div>
            <button
              onClick={handleAdd}
              disabled={product.soldOut}
              aria-label={`Agregar ${product.name}`}
              className="flex-shrink-0 rounded-2xl bg-primary p-3 text-on-primary shadow-xl shadow-primary/30 transition-all hover:scale-110 active:scale-95 disabled:bg-outline-variant/20 disabled:text-on-surface-variant/40 disabled:shadow-none"
            >
              <Plus size={22} strokeWidth={2.5} />
            </button>
          </div>

          {product.variants && product.variants.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {product.variants.map((v) => (
                <button
                  key={v.label}
                  onClick={() => setSelectedVariant(v.label)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                    selectedVariant === v.label
                      ? "border-primary bg-primary text-on-primary shadow-sm"
                      : "border-outline-variant/25 text-on-surface-variant hover:border-primary/40"
                  }`}
                >
                  {v.label} · {formatCents(v.price)}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-4 font-headline text-xl font-extrabold tracking-tight text-primary">
              {priceRange}
            </p>
          )}
        </div>
      </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // GRID — image-top card used in product grids (2-col mobile, 3-4 col desktop)
  // ═══════════════════════════════════════════════════════════
  if (variant === "grid") {
    return (
      <>
      {optionsModal}
      <div
        className={`group relative flex flex-col overflow-hidden rounded-2xl border border-outline-variant/10 bg-surface-container transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-2xl hover:shadow-black/40 ${
          product.soldOut ? "opacity-50" : ""
        }`}
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 50vw, 300px"
              className="object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 to-surface-container-high text-4xl">
              🍗
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          {product.soldOut && (
            <span className="absolute left-2.5 top-2.5 rounded-full bg-error/90 px-2.5 py-0.5 text-[9px] font-headline font-extrabold uppercase tracking-wider text-on-error">
              Agotado
            </span>
          )}
          {!product.soldOut && (MOST_ORDERED.has(product.name) || POPULAR.has(product.name)) && (
            <SocialProofBadge name={product.name} />
          )}
          {!product.soldOut && product.variants && product.variants.length > 0 && !MOST_ORDERED.has(product.name) && !POPULAR.has(product.name) && (
            <span className="absolute left-2.5 top-2.5 rounded-full bg-surface/70 px-2.5 py-0.5 text-[9px] font-headline font-bold uppercase tracking-wider text-tertiary backdrop-blur-md">
              Opciones
            </span>
          )}
          {FavoriteButton}
        </div>

        <div className="flex flex-1 flex-col p-3.5">
          <h3 className="font-headline text-sm font-bold leading-tight text-tertiary">
            {product.name}
          </h3>
          {product.description && (
            <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-on-surface-variant/70">
              {product.description}
            </p>
          )}

          <div className="mt-auto flex items-center justify-between gap-2 pt-3">
            <span className="font-headline text-sm font-extrabold tracking-tight text-primary">
              {priceRange}
            </span>
            <button
              onClick={handleAdd}
              disabled={product.soldOut}
              aria-label={`Agregar ${product.name}`}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary transition-all hover:bg-primary hover:text-on-primary disabled:bg-outline-variant/20 disabled:text-on-surface-variant/40"
            >
              <Plus size={15} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // ROW — horizontal layout (default) for dense mobile lists
  // ═══════════════════════════════════════════════════════════
  return (
    <>
    {optionsModal}
    <div
      className={`group flex gap-3.5 rounded-2xl border border-outline-variant/10 bg-surface-container p-3 transition-all duration-300 hover:border-primary/25 ${
        product.soldOut ? "opacity-40" : ""
      }`}
    >
      <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl sm:h-28 sm:w-28">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={product.name}
            fill
            sizes="112px"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 to-surface-container-high text-3xl">
            🍗
          </div>
        )}
        {product.soldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/70 backdrop-blur-sm">
            <span className="rotate-[-8deg] rounded border border-error/60 px-2 py-0.5 text-[9px] font-headline font-extrabold uppercase tracking-wider text-error">
              Agotado
            </span>
          </div>
        )}
        {FavoriteButton}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-headline text-sm font-bold text-tertiary sm:text-base">
          {product.name}
        </h3>
        {product.description && (
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-on-surface-variant/70">
            {product.description}
          </p>
        )}

        {product.variants && product.variants.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {product.variants.map((v) => (
              <button
                key={v.label}
                onClick={() => setSelectedVariant(v.label)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-all ${
                  selectedVariant === v.label
                    ? "border-primary bg-primary text-on-primary shadow-sm"
                    : "border-outline-variant/20 text-on-surface-variant hover:border-primary/30"
                }`}
              >
                {v.label} {formatCents(v.price)}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-auto pt-1.5 font-headline text-sm font-extrabold text-primary">
            {priceRange}
          </p>
        )}
      </div>

      <button
        onClick={handleAdd}
        disabled={product.soldOut}
        aria-label={`Agregar ${product.name}`}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center self-center rounded-xl bg-primary/15 text-primary transition-all hover:bg-primary hover:text-on-primary disabled:bg-outline-variant/20 disabled:text-on-surface-variant/40"
      >
        <Plus size={16} strokeWidth={2.5} />
      </button>
    </div>
    </>
  );
}
