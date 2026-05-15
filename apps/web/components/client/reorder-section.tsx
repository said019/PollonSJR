"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCart } from "@/hooks/useCart";
import { useCartFeedback } from "@/store/cart-feedback";
import { formatCents } from "@pollon/utils";
import { History, ShoppingBag, Loader2, Heart, Sparkles } from "lucide-react";
import { useState } from "react";

interface OrderItem {
  productId: string;
  productName: string;
  qty: number;
  variant: string | null;
  unitPrice: number;
}

interface PastOrder {
  id: string;
  orderNumber: number;
  status: string;
  total: number;
  createdAt: string;
  items: OrderItem[];
}

export function ReorderSection({
  token,
  onItemsAdded,
}: {
  token: string | null;
  onItemsAdded?: () => void;
}) {
  const { addItem } = useCart();
  const notify = useCartFeedback((s) => s.notify);
  const [adding, setAdding] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["customer-recent-orders"],
    queryFn: () =>
      api.get<{ orders: PastOrder[] }>(
        "/api/customers/me/orders?limit=3",
        token || undefined
      ),
    enabled: !!token,
  });

  const recentDelivered = (data?.orders ?? []).filter(
    (o) => o.status === "DELIVERED" || o.status === "ON_THE_WAY"
  );

  if (!token || isLoading || recentDelivered.length === 0) return null;

  const handleReorder = (order: PastOrder) => {
    setAdding(order.id);
    for (const it of order.items) {
      addItem({
        productId: it.productId,
        name: it.productName,
        price: it.unitPrice,
        qty: it.qty,
        variant: it.variant,
        notes: "",
        imageUrl: null,
      });
    }
    const totalItems = order.items.reduce((s, i) => s + i.qty, 0);
    notify(
      totalItems === 1
        ? `1 producto agregado`
        : `${totalItems} productos agregados al carrito`
    );
    setTimeout(() => {
      setAdding(null);
      // Patrón Rappi: no abrimos el cart drawer al reorder. El cliente puede
      // seguir agregando otras cosas. El toast + la barra inferior dan
      // feedback suficiente. (onItemsAdded sigue existiendo por si lo
      // queremos usar para otra cosa en el futuro.)
      onItemsAdded?.();
    }, 400);
  };

  const [hero, ...rest] = recentDelivered;
  const heroItemsPreview = hero.items.slice(0, 3);
  const heroIsDelivered = hero.status === "DELIVERED";

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      {/* Hero CTA: ¿Cómo te fue con tu último pedido? */}
      <div className="mb-5 overflow-hidden rounded-3xl border border-secondary/30 bg-gradient-to-br from-surface-container-high to-surface-container">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:gap-5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-secondary/20 text-secondary sm:h-14 sm:w-14">
            <Heart size={22} className="fill-secondary" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="font-headline text-[10px] font-bold uppercase tracking-[0.25em] text-secondary">
              Pedido #{hero.orderNumber} ·{" "}
              {new Date(hero.createdAt).toLocaleDateString("es-MX", {
                day: "numeric",
                month: "short",
              })}
            </span>
            <h2 className="mt-0.5 font-headline text-lg font-extrabold leading-tight text-tertiary sm:text-xl">
              {heroIsDelivered
                ? "¿Cómo te fue con tu último pedido?"
                : "Tu pedido viene en camino"}
            </h2>
            <p className="mt-1 truncate text-[12px] text-on-surface-variant">
              {heroItemsPreview
                .map((it) => `${it.qty}× ${it.productName}`)
                .join(" · ")}
              {hero.items.length > 3 && ` + ${hero.items.length - 3}`}
            </p>
          </div>
          <button
            onClick={() => handleReorder(hero)}
            disabled={adding === hero.id}
            className="flex-shrink-0 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 font-headline text-xs font-bold uppercase tracking-wider text-on-primary shadow-lg shadow-primary/25 transition-all active:scale-[0.98] disabled:opacity-60 sm:text-sm"
          >
            {adding === hero.id ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            Pedir lo mismo · {formatCents(hero.total)}
          </button>
        </div>
      </div>

      {/* Pedidos anteriores (más compactos) — sólo si hay más además del hero */}
      {rest.length > 0 && (
        <>
          <div className="mb-3 flex items-center gap-2">
            <History size={16} className="text-primary" />
            <h2 className="font-headline text-sm font-bold uppercase tracking-[0.2em] text-tertiary">
              Pide otra vez
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rest.slice(0, 3).map((order) => (
              <div
                key={order.id}
                className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-surface-container-high"
              >
                <div className="flex items-center justify-between border-b border-outline-variant/10 px-4 py-2.5">
                  <span className="font-mono text-xs font-bold text-primary">
                    #{order.orderNumber}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    {new Date(order.createdAt).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
                <div className="px-4 py-3">
                  <ul className="mb-3 space-y-1 text-xs text-on-surface">
                    {order.items.slice(0, 3).map((it, idx) => (
                      <li
                        key={idx}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate">
                          <strong className="text-primary">{it.qty}×</strong>{" "}
                          {it.productName}
                          {it.variant && (
                            <span className="text-on-surface-variant/60">
                              {" "}
                              · {it.variant}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                    {order.items.length > 3 && (
                      <li className="text-[10px] text-on-surface-variant/60">
                        + {order.items.length - 3} más
                      </li>
                    )}
                  </ul>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-headline text-sm font-extrabold text-primary">
                      {formatCents(order.total)}
                    </span>
                    <button
                      onClick={() => handleReorder(order)}
                      disabled={adding === order.id}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-on-primary disabled:opacity-50"
                    >
                      {adding === order.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <ShoppingBag size={11} />
                      )}
                      Pedir otra vez
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
