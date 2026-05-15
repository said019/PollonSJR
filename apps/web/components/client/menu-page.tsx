"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { MenuByCategory, ProductPublic, LoyaltyInfo } from "@pollon/types";
import { ProductCard } from "./product-card";
import { CartDrawer } from "./cart-drawer";
import { AuthModal } from "./auth-modal";
import { useCart } from "@/hooks/useCart";
import { formatCents } from "@pollon/utils";
import { ShoppingCart, ArrowLeft, User, Search, Flame, Clock, Star, Plus, Sparkles } from "lucide-react";
import { useCartStore } from "@/store/cart";
import type { CartPromotionMeta } from "@pollon/types";
import { StoreStatusBanner } from "./store-status-banner";
import { ActiveOrderBanner } from "./active-order-banner";
import { InstallAppBanner } from "./install-app-banner";
import { ReorderSection } from "./reorder-section";
import { FavoritesSection } from "./favorites-section";
import { RecommendationsSection } from "./recommendations-section";
import { MenuFilters, type MenuFilterTag } from "./menu-filters";
import { useFavorites } from "@/hooks/useFavorites";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { getToken } from "@/lib/auth";
import { CATEGORY_IMAGES, CATEGORY_EMOJI, resolveProductImage } from "@/lib/product-images";
import { motion } from "framer-motion";

/* ────────────────────────────────────────────────────────────── */
/*  Loyalty mini-bar — shown to logged-in users in header         */
/* ────────────────────────────────────────────────────────────── */
function LoyaltyMiniBar({ token }: { token: string }) {
  const { data: info } = useQuery({
    queryKey: ["loyalty"],
    queryFn: () => api.get<LoyaltyInfo>("/api/loyalty/me", token),
    staleTime: 60_000,
  });

  if (!info) return null;

  const target = info.target || 5;
  const progress = Math.min(info.pendingReward ? target : info.progress, target);
  const pct = Math.round((progress / target) * 100);

  if (info.pendingReward) {
    return (
      <Link
        href="/loyalty"
        className="flex items-center gap-2 rounded-xl border border-secondary/40 bg-secondary/15 px-3 py-1.5 text-secondary transition-all hover:bg-secondary/25"
      >
        <Star size={12} className="fill-secondary" />
        <span className="font-headline text-[11px] font-extrabold uppercase tracking-wider">
          ¡Premio listo!
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/loyalty"
      className="group hidden items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container px-3 py-1.5 transition-all hover:border-secondary/40 sm:flex"
    >
      <Star size={12} className="text-secondary" />
      <div className="min-w-0">
        <span className="font-headline text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70">
          {progress}/{target} compras
        </span>
        <div className="mt-0.5 h-1 w-16 overflow-hidden rounded-full bg-surface-variant">
          <motion.div
            className="h-full rounded-full bg-secondary"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
      </div>
    </Link>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Promo banner — only shows when the backend reports active     */
/*  promotions for today (admin can toggle them off live).         */
/* ────────────────────────────────────────────────────────────── */

interface TodayPromotion {
  id: string;
  name: string;
  description: string | null;
  dayOfWeek: number | null;
  price: number;
}

const PROMO_DAY_BADGE: Record<number, string> = {
  0: "DOM",
  1: "LUN",
  2: "MAR",
  3: "MIÉ",
  4: "JUE",
  5: "VIE",
  6: "SÁB",
};

function PromoCountdown() {
  const { data: promos } = useQuery({
    queryKey: ["promotions-today"],
    queryFn: () =>
      api.get<TodayPromotion[]>("/api/promotions/today").catch(() => []),
    // Refresh every couple of minutes so admin toggles propagate
    refetchInterval: 2 * 60 * 1000,
    staleTime: 60 * 1000,
  });

  const [timeStr, setTimeStr] = useState<string | null>(null);

  useEffect(() => {
    if (!promos || promos.length === 0) {
      setTimeStr(null);
      return;
    }
    function update() {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setTimeStr(
        `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`
      );
    }
    update();
    const id = setInterval(update, 1_000);
    return () => clearInterval(id);
  }, [promos]);

  if (!promos || promos.length === 0 || !timeStr) return null;

  // If every active promo is "todos los días", skip the day badge
  const dayBadges = Array.from(
    new Set(
      promos
        .map((p) => p.dayOfWeek)
        .filter((d): d is number => d !== null)
        .map((d) => PROMO_DAY_BADGE[d])
    )
  );
  const headline =
    promos.length === 1
      ? promos[0].name.toUpperCase()
      : `${promos.length} promos activas`;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex items-center gap-2 rounded-2xl border border-error/30 bg-error/10 px-4 py-2.5"
    >
      <Flame size={15} className="text-error" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-headline text-[10px] font-extrabold uppercase tracking-widest text-error">
          ¡Promos activas hoy!
        </p>
        <p className="truncate font-mono text-sm font-bold text-error">
          Termina en {timeStr}
        </p>
      </div>
      {dayBadges.length > 0 && (
        <span className="ml-1 inline-flex flex-shrink-0 items-center rounded-full bg-error/20 px-2 py-0.5 text-[9px] font-headline font-extrabold uppercase tracking-wider text-error">
          {dayBadges.join("·")}
        </span>
      )}
    </motion.div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  PromotionsSection — clickable promo bundle cards for customers */
/* ────────────────────────────────────────────────────────────── */

interface PromoBundle {
  id: string;
  name: string;
  description: string | null;
  dayOfWeek: number | null;
  price: number;
  items: Array<{
    productId: string;
    productName: string;
    qty: number;
    variant: string | null;
    emoji: string | null;
  }>;
}

function PromotionsSection({ onAdded }: { onAdded: () => void }) {
  const { data: promos } = useQuery({
    queryKey: ["promotions-today"],
    queryFn: () =>
      api.get<PromoBundle[]>("/api/promotions/today").catch(() => []),
    refetchInterval: 2 * 60 * 1000,
    staleTime: 60 * 1000,
  });

  const addPromotion = useCartStore((s) => s.addPromotion);

  if (!promos || promos.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={16} className="text-primary" />
        <h2 className="font-headline text-sm font-extrabold uppercase tracking-[0.18em] text-tertiary">
          Promociones de hoy
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {promos.map((p) => {
          const meta: CartPromotionMeta = {
            id: p.id,
            name: p.name,
            price: p.price,
            items: p.items.map((it) => ({
              productId: it.productId,
              productName: it.productName,
              qty: it.qty,
              variant: it.variant,
              emoji: it.emoji,
            })),
          };
          return (
            <article
              key={p.id}
              className="flex flex-col gap-3 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-surface-container-high p-4"
            >
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="font-headline text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                    Combo · Hoy
                  </span>
                  <h3 className="mt-0.5 font-headline text-base font-extrabold leading-tight text-tertiary">
                    {p.name}
                  </h3>
                  {p.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-on-surface-variant/80">
                      {p.description}
                    </p>
                  )}
                </div>
                <span className="flex-shrink-0 font-headline text-xl font-extrabold text-primary">
                  {formatCents(p.price)}
                </span>
              </header>

              <ul className="space-y-1 rounded-xl bg-surface/60 p-3 text-[12px]">
                {p.items.map((it, i) => (
                  <li
                    key={`${it.productId}-${i}`}
                    className="flex items-center gap-1 text-on-surface"
                  >
                    <span className="font-bold text-primary">{it.qty}×</span>
                    <span className="truncate">
                      {it.emoji ?? "🍗"} {it.productName}
                      {it.variant && (
                        <span className="ml-1 text-on-surface-variant">
                          ({it.variant})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => {
                  addPromotion(meta);
                  onAdded();
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 font-headline text-xs font-bold uppercase tracking-wider text-on-primary shadow-lg shadow-primary/25 active:scale-[0.98]"
              >
                <Plus size={14} />
                Agregar al carrito
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Featured hero — shows the top product of the menu             */
/* ────────────────────────────────────────────────────────────── */
function FeaturedHero({ product }: { product: ProductPublic }) {
  return (
    <section className="relative mb-10 overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-surface-container-high to-surface-container">
      <div className="grid gap-0 md:grid-cols-2">
        <div className="relative aspect-[16/10] overflow-hidden md:aspect-auto md:min-h-[340px]">
          <Image
            src={resolveProductImage(product.name, product.imageUrl) ?? "/menu/hero-spread.jpeg"}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            priority
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-surface/80 via-surface/10 to-transparent md:bg-gradient-to-r" />
          <span className="absolute left-4 top-4 rounded-full bg-secondary px-3 py-1 font-headline text-[10px] font-extrabold uppercase tracking-[0.18em] text-on-secondary shadow-lg">
            ★ Favorito del chef
          </span>
        </div>

        <div className="relative flex flex-col justify-center p-6 md:p-10">
          <span className="mb-3 block font-headline text-[11px] font-bold uppercase tracking-[0.25em] text-primary">
            Recomendado para ti
          </span>
          <h2 className="font-headline text-3xl font-extrabold uppercase leading-[0.95] tracking-tighter text-tertiary md:text-5xl">
            {product.name}
          </h2>
          {product.description && (
            <p className="mt-4 max-w-md text-sm leading-relaxed text-on-surface-variant/80 md:text-base">
              {product.description}
            </p>
          )}
          <div className="mt-6 flex items-baseline gap-3">
            <span className="font-headline text-3xl font-extrabold tracking-tight text-primary md:text-4xl">
              {formatCents(product.price)}
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant/50">
              MXN
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Sticky category nav — chips (mobile) + sidebar (desktop)      */
/* ────────────────────────────────────────────────────────────── */
function CategoryChips({
  categories,
  active,
  onJump,
}: {
  categories: MenuByCategory[];
  active: string | null;
  onJump: (category: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active chip into view on mobile
  useEffect(() => {
    if (!active || !scrollerRef.current) return;
    const el = scrollerRef.current.querySelector(
      `[data-chip="${active}"]`,
    ) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [active]);

  return (
    <div
      ref={scrollerRef}
      className="scrollbar-hide flex gap-2 overflow-x-auto px-4 py-3 lg:hidden"
      style={{ scrollbarWidth: "none" }}
    >
      {categories.map((cat) => {
        const isActive = active === cat.category;
        return (
          <button
            key={cat.category}
            data-chip={cat.category}
            onClick={() => onJump(cat.category)}
            className={`flex flex-shrink-0 items-center gap-2 rounded-full border px-4 py-2 font-headline text-xs font-bold uppercase tracking-wider transition-all ${
              isActive
                ? "border-primary bg-primary text-on-primary shadow-lg shadow-primary/30"
                : "border-outline-variant/20 bg-surface-container text-on-surface-variant hover:border-primary/40 hover:text-tertiary"
            }`}
          >
            <span className="text-sm">{CATEGORY_EMOJI[cat.category] ?? "🍽️"}</span>
            {cat.label}
            <span
              className={`ml-0.5 rounded-full px-1.5 text-[9px] ${
                isActive ? "bg-on-primary/20 text-on-primary" : "bg-surface-variant text-on-surface-variant/70"
              }`}
            >
              {cat.products.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CategorySidebar({
  categories,
  active,
  onJump,
}: {
  categories: MenuByCategory[];
  active: string | null;
  onJump: (category: string) => void;
}) {
  return (
    <aside className="sticky top-24 hidden h-fit w-60 flex-shrink-0 lg:block">
      <div className="rounded-2xl border border-outline-variant/15 bg-surface-container p-2">
        <div className="px-3 pb-2 pt-3">
          <span className="font-headline text-[10px] font-bold uppercase tracking-[0.25em] text-on-surface-variant/60">
            Categorías
          </span>
        </div>
        <ul className="space-y-1">
          {categories.map((cat) => {
            const isActive = active === cat.category;
            return (
              <li key={cat.category}>
                <button
                  onClick={() => onJump(cat.category)}
                  className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-on-surface-variant hover:bg-surface-container-high hover:text-tertiary"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-lg transition-colors ${
                      isActive ? "bg-primary/20" : "bg-surface-container-high group-hover:bg-surface-variant"
                    }`}
                  >
                    {CATEGORY_EMOJI[cat.category] ?? "🍽️"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-headline text-sm font-bold">{cat.label}</div>
                    <div className="text-[10px] uppercase tracking-wider opacity-60">
                      {cat.products.length} productos
                    </div>
                  </div>
                  {isActive && <span className="h-6 w-1 rounded-full bg-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Search bar — filters across all categories                    */
/* ────────────────────────────────────────────────────────────── */
function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <Search
        size={16}
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar en el menú…"
        className="w-full rounded-2xl border border-outline-variant/15 bg-surface-container py-3 pl-11 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/40 transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Category section — smart layout per category type             */
/* ────────────────────────────────────────────────────────────── */
function CategorySection({
  category,
  label,
  products,
  sectionRef,
}: {
  category: string;
  label: string;
  products: ProductPublic[];
  sectionRef: (el: HTMLElement | null) => void;
}) {
  if (products.length === 0) return null;

  // Combos + Pollo Frito get the richer grid layout since they are hero items.
  const useHeroGrid = category === "COMBOS" || category === "POLLO_FRITO" || category === "HAMBURGUESAS";

  return (
    <section
      ref={sectionRef}
      data-category={category}
      id={`cat-${category}`}
      className="scroll-mt-40"
    >
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/12 text-xl">
            {CATEGORY_EMOJI[category] ?? "🍽️"}
          </span>
          <div>
            <div className="font-headline text-[10px] font-bold uppercase tracking-[0.25em] text-primary">
              Categoría
            </div>
            <h2 className="font-headline text-2xl font-extrabold uppercase leading-none tracking-tighter text-tertiary md:text-3xl">
              {label}
            </h2>
          </div>
        </div>
        <span className="hidden font-headline text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant/50 sm:block">
          {products.length} {products.length === 1 ? "producto" : "productos"}
        </span>
      </div>

      {useHeroGrid ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} variant="grid" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} variant="grid" />
          ))}
        </div>
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */
/*  Main MenuPage                                                 */
/* ────────────────────────────────────────────────────────────── */
export function MenuPage() {
  const [cartOpen, setCartOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<MenuFilterTag[]>([]);
  const { itemCount, total } = useCart();
  const { favoriteIds } = useFavorites();
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    const t = getToken();
    setAuthed(!!t);
    setAuthToken(t);
  }, []);

  const { data: menu, isLoading } = useQuery({
    queryKey: ["menu"],
    queryFn: () => api.get<MenuByCategory[]>("/api/menu"),
  });

  // Filtered menu based on search query and tag filters
  const filteredMenu = useMemo(() => {
    if (!menu) return [];
    const q = searchQuery.trim().toLowerCase();
    const hasFilters = activeFilters.length > 0;
    if (!q && !hasFilters) return menu;
    return menu
      .map((cat) => ({
        ...cat,
        products: cat.products.filter((p) => {
          const matchesSearch =
            !q ||
            p.name.toLowerCase().includes(q) ||
            (p.description ?? "").toLowerCase().includes(q);
          const tags = (p as any).tags as string[] | undefined;
          // Inclusive OR: product matches if it has ANY of the active tags.
          // Allows users to combine "Vegetariano + Sin gluten" to see all
          // products that satisfy at least one of those preferences.
          const matchesTags =
            !hasFilters ||
            (tags && activeFilters.some((f) => tags.includes(f)));
          return matchesSearch && matchesTags;
        }),
      }))
      .filter((cat) => cat.products.length > 0);
  }, [menu, searchQuery, activeFilters]);

  // Available tags across the entire menu — for filter chips
  const availableTags = useMemo(() => {
    if (!menu) return [] as MenuFilterTag[];
    const set = new Set<string>();
    for (const cat of menu) {
      for (const p of cat.products) {
        const tags = (p as any).tags as string[] | undefined;
        tags?.forEach((t) => set.add(t));
      }
    }
    return Array.from(set) as MenuFilterTag[];
  }, [menu]);

  // Favorite products — flat list for the section
  const favoriteProducts = useMemo(() => {
    if (!menu || favoriteIds.length === 0) return [];
    const all = menu.flatMap((c) => c.products);
    return favoriteIds
      .map((id) => all.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p && !p.soldOut);
  }, [menu, favoriteIds]);

  // Pick a featured product — first combo, fallback first product
  const featured = useMemo(() => {
    if (!menu) return null;
    const combos = menu.find((c) => c.category === "COMBOS");
    const pick = combos?.products.find((p) => p.name === "Combo Familiar")
      ?? combos?.products[0]
      ?? menu[0]?.products[0];
    return pick ?? null;
  }, [menu]);

  // Scroll-spy: update active category as user scrolls
  useEffect(() => {
    if (!filteredMenu.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first entry that's intersecting (visible)
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (a.boundingClientRect.top ?? 0) - (b.boundingClientRect.top ?? 0));
        if (visible.length > 0) {
          const cat = visible[0].target.getAttribute("data-category");
          if (cat) setActiveCategory(cat);
        }
      },
      {
        // Trigger when section top reaches ~35% from viewport top
        rootMargin: "-35% 0px -55% 0px",
        threshold: 0,
      },
    );
    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [filteredMenu]);

  const handleJumpToCategory = useCallback((category: string) => {
    const el = sectionRefs.current.get(category);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const setSectionRef = (category: string) => (el: HTMLElement | null) => {
    if (el) sectionRefs.current.set(category, el);
    else sectionRefs.current.delete(category);
  };

  return (
    <div className="relative min-h-screen bg-surface">
      {/* Subtle grain */}
      <div className="pointer-events-none fixed inset-0 z-0 grain" />

      {/* Store closed banner */}
      <StoreStatusBanner />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-outline-variant/10 bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="flex-shrink-0 rounded-lg p-1 text-on-surface-variant transition-colors hover:text-primary"
              aria-label="Volver"
            >
              <ArrowLeft size={18} />
            </Link>
            <Link href="/" className="flex min-w-0 items-center gap-2.5">
              <div className="h-9 w-9 overflow-hidden rounded-lg border border-primary/20">
                <Image
                  src="/pollon-logo.jpg"
                  alt="Pollón SJR"
                  width={36}
                  height={36}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <h1 className="font-headline text-base font-extrabold leading-tight tracking-tight text-tertiary">
                  POLLÓN<span className="text-primary">.</span>
                </h1>
                <p className="truncate text-[9px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
                  Menú completo
                </p>
              </div>
            </Link>
          </div>

          {/* Desktop search in header */}
          <div className="hidden max-w-md flex-1 lg:block">
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {/* Loyalty mini-bar for logged-in users */}
            {authed && authToken && <LoyaltyMiniBar token={authToken} />}

            {authed ? (
              <Link
                href="/profile"
                title="Mi perfil"
                className="flex items-center gap-1.5 rounded-xl border border-outline-variant/20 bg-surface-container px-3 py-2 font-headline text-xs font-bold uppercase tracking-wider text-on-surface transition-colors hover:border-primary hover:text-primary"
              >
                <User size={14} />
                <span className="hidden sm:inline">Mi cuenta</span>
              </Link>
            ) : (
              <button
                onClick={() => setAuthOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-outline-variant/30 px-3 py-2 font-headline text-xs font-bold uppercase tracking-wider text-on-surface transition-colors hover:border-primary hover:text-primary"
              >
                <User size={14} />
                <span className="hidden sm:inline">Entrar</span>
              </button>
            )}
            <button
              onClick={() => setCartOpen(true)}
              className="relative rounded-xl border border-primary/20 bg-primary/15 p-2.5 text-primary transition-colors hover:bg-primary/25"
              aria-label="Abrir carrito"
            >
              <ShoppingCart size={20} />
              {itemCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-on-primary shadow-lg">
                  {itemCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile: category chips + search */}
        <div className="lg:hidden">
          <div className="px-4 pt-0">
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
          </div>
          {menu && menu.length > 0 && (
            <CategoryChips
              categories={menu}
              active={activeCategory}
              onJump={handleJumpToCategory}
            />
          )}
        </div>
      </header>

      {/* Menu */}
      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-32 pt-6 lg:px-6">
        {isLoading ? (
          <div className="space-y-4">
            <div className="h-80 animate-pulse rounded-3xl bg-surface-container" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="h-56 animate-pulse rounded-2xl bg-surface-container" />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex gap-8">
            <CategorySidebar
              categories={menu ?? []}
              active={activeCategory}
              onJump={handleJumpToCategory}
            />

            <div className="min-w-0 flex-1">
              {/* Promo countdown — always visible at top */}
              {!searchQuery && (
                <div className="mb-6">
                  <PromoCountdown />
                </div>
              )}

              {/* Promociones cards — shown when not searching and admin has actives today */}
              {!searchQuery && (
                <PromotionsSection
                  onAdded={() => setCartOpen(true)}
                />
              )}

              {/* Featured hero — shown when not searching */}
              {!searchQuery && featured && <FeaturedHero product={featured} />}

              {/* Data-driven recommendations — "Recomendado para ti" si hay historial,
                  o "Lo más pedido" si todavía no hay datos personales suficientes. */}
              {!searchQuery && <RecommendationsSection />}

              {/* Favorites section — shown when authed and has favorited products */}
              {!searchQuery && authed && favoriteProducts.length > 0 && (
                <FavoritesSection products={favoriteProducts} />
              )}

              {/* Reorder section — shown when authed and has past orders */}
              {!searchQuery && authed && (
                <ReorderSection
                  token={authToken}
                  onItemsAdded={() => setCartOpen(true)}
                />
              )}

              {/* Filter chips */}
              {availableTags.length > 0 && (
                <MenuFilters
                  available={availableTags}
                  active={activeFilters}
                  onChange={setActiveFilters}
                />
              )}

              {/* Search empty state */}
              {searchQuery && filteredMenu.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-outline-variant/15 bg-surface-container py-20 text-center">
                  <div className="mb-3 text-5xl opacity-50">🔍</div>
                  <h3 className="font-headline text-lg font-bold text-tertiary">
                    Sin resultados para "{searchQuery}"
                  </h3>
                  <p className="mt-1 text-sm text-on-surface-variant/70">
                    Prueba con otra palabra o revisa las categorías.
                  </p>
                </div>
              )}

              {/* Categories */}
              <div className="space-y-12">
                {filteredMenu.map((cat) => (
                  <CategorySection
                    key={cat.category}
                    category={cat.category}
                    label={cat.label}
                    products={cat.products}
                    sectionRef={setSectionRef(cat.category)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Floating bottom area: active-order banner + cart bar */}
      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-surface via-surface/95 to-transparent p-4 pt-8">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-2">
          {/* Install app + active order — shown when cart is empty */}
          {itemCount === 0 && (
            <>
              <InstallAppBanner />
              <ActiveOrderBanner />
            </>
          )}

          {/* Cart bar */}
          {itemCount > 0 && (
            <button
              onClick={() => setCartOpen(true)}
              className="pointer-events-auto flex w-full items-center justify-between rounded-2xl bg-primary px-6 py-3.5 font-headline font-bold text-on-primary shadow-2xl transition-transform active:scale-[0.98] glow-primary"
            >
              <span className="flex items-center gap-2">
                <ShoppingCart size={18} />
                Ver carrito ({itemCount})
              </span>
              <span>{formatCents(total)}</span>
            </button>
          )}
        </div>
      </div>

      {/* Cart drawer */}
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        onRequireAuth={() => {
          setCartOpen(false);
          setAuthOpen(true);
        }}
      />

      {/* Auth modal */}
      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => {
          setAuthed(true);
          setAuthOpen(false);
        }}
      />
    </div>
  );
}
