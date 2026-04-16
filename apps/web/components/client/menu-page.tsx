"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { MenuByCategory, ProductPublic } from "@pollon/types";
import { ProductCard } from "./product-card";
import { CartDrawer } from "./cart-drawer";
import { AuthModal } from "./auth-modal";
import { useCart } from "@/hooks/useCart";
import { formatCents } from "@pollon/utils";
import { ShoppingCart, ArrowLeft, User, LogOut, Search } from "lucide-react";
import { StoreStatusBanner } from "./store-status-banner";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { getToken, clearTokens } from "@/lib/auth";
import { CATEGORY_IMAGES, CATEGORY_EMOJI, resolveProductImage } from "@/lib/product-images";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const { itemCount, total } = useCart();
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    setAuthed(!!getToken());
  }, []);

  const handleLogout = () => {
    clearTokens();
    setAuthed(false);
  };

  const { data: menu, isLoading } = useQuery({
    queryKey: ["menu"],
    queryFn: () => api.get<MenuByCategory[]>("/api/menu"),
  });

  // Filtered menu based on search query
  const filteredMenu = useMemo(() => {
    if (!menu) return [];
    if (!searchQuery.trim()) return menu;
    const q = searchQuery.toLowerCase();
    return menu
      .map((cat) => ({
        ...cat,
        products: cat.products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.description ?? "").toLowerCase().includes(q),
        ),
      }))
      .filter((cat) => cat.products.length > 0);
  }, [menu, searchQuery]);

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
            {authed ? (
              <button
                onClick={handleLogout}
                title="Cerrar sesión"
                className="rounded-xl border border-outline-variant/20 p-2.5 text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
              >
                <LogOut size={18} />
              </button>
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
              {/* Featured hero — shown when not searching */}
              {!searchQuery && featured && <FeaturedHero product={featured} />}

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

      {/* Floating cart bar */}
      {itemCount > 0 && (
        <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-surface via-surface/95 to-transparent p-4 pt-8">
          <button
            onClick={() => setCartOpen(true)}
            className="pointer-events-auto mx-auto flex w-full max-w-lg items-center justify-between rounded-2xl bg-primary px-6 py-3.5 font-headline font-bold text-on-primary shadow-2xl transition-transform active:scale-[0.98] glow-primary"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart size={18} />
              Ver carrito ({itemCount})
            </span>
            <span>{formatCents(total)}</span>
          </button>
        </div>
      )}

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
