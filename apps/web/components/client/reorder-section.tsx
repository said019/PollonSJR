"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCart } from "@/hooks/useCart";
import { formatCents } from "@pollon/utils";
import { History, ShoppingBag, Loader2 } from "lucide-react";
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
    setTimeout(() => {
      setAdding(null);
      // Open the cart so the user can review and complete any missing
      // modifiers (the cart now validates each line).
      onItemsAdded?.();
    }, 400);
  };

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
      <div className="mb-3 flex items-center gap-2">
        <History size={16} className="text-primary" />
        <h2 className="font-headline text-sm font-bold uppercase tracking-[0.2em] text-tertiary">
          Pide otra vez
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {recentDelivered.slice(0, 3).map((order) => (
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
                  <li key={idx} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      <strong className="text-primary">{it.qty}×</strong>{" "}
                      {it.productName}
                      {it.variant && (
                        <span className="text-on-surface-variant/60"> · {it.variant}</span>
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
    </section>
  );
}
