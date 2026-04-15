"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { MenuByCategory } from "@pollon/types";
import { ProductCard } from "./product-card";
import { CartDrawer } from "./cart-drawer";
import { AuthModal } from "./auth-modal";
import { useCart } from "@/hooks/useCart";
import { formatCents } from "@pollon/utils";
import { ShoppingCart, ArrowLeft, User, LogOut } from "lucide-react";
import { StoreStatusBanner } from "./store-status-banner";
import { useState, useEffect } from "react";
import Link from "next/link";
import { getToken, clearTokens } from "@/lib/auth";

export function MenuPage() {
  const [cartOpen, setCartOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authed, setAuthed] = useState(false);
  const { itemCount, total } = useCart();

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

  return (
    <div className="min-h-screen bg-surface relative">
      {/* Subtle grain */}
      <div className="fixed inset-0 pointer-events-none grain z-0" />

      {/* Store closed banner */}
      <StoreStatusBanner />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/10">
        <div className="max-w-lg mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-on-surface-variant hover:text-primary transition-colors p-1">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-lg font-headline font-extrabold text-tertiary tracking-tight">
                POLLÓN<span className="text-primary">.</span>
              </h1>
              <p className="text-[10px] text-on-surface-variant/60 font-semibold uppercase tracking-wider">
                Pedidos en línea
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {authed ? (
              <button
                onClick={handleLogout}
                title="Cerrar sesión"
                className="p-2.5 rounded-xl text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors border border-outline-variant/20"
              >
                <LogOut size={18} />
              </button>
            ) : (
              <button
                onClick={() => setAuthOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-outline-variant/30 text-xs font-headline font-bold uppercase tracking-wider text-on-surface hover:border-primary hover:text-primary transition-colors"
              >
                <User size={14} />
                Entrar
              </button>
            )}
            <button
              onClick={() => setCartOpen(true)}
              className="relative bg-primary/15 text-primary p-2.5 rounded-xl border border-primary/20 hover:bg-primary/25 transition-colors"
            >
              <ShoppingCart size={20} />
              {itemCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-primary text-on-primary text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-lg">
                  {itemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Menu */}
      <main className="relative z-10 max-w-lg mx-auto px-4 py-6 pb-28">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-surface-container rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          menu?.map((category) => (
            <section key={category.category} className="mb-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-outline-variant/15" />
                <h2 className="text-sm font-headline font-bold text-primary uppercase tracking-[0.2em]">
                  {category.label}
                </h2>
                <div className="h-px flex-1 bg-outline-variant/15" />
              </div>
              <div className="space-y-3">
                {category.products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {/* Floating cart bar */}
      {itemCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 p-4 bg-gradient-to-t from-surface via-surface/95 to-transparent pt-8">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full max-w-lg mx-auto flex items-center justify-between bg-primary text-on-primary py-3.5 px-6 rounded-2xl font-headline font-bold shadow-2xl glow-primary active:scale-[0.98] transition-transform"
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
