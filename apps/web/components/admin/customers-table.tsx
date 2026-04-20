"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { formatCents } from "@pollon/utils";
import { Search, Star, Phone, ShoppingBag, Gift, TrendingUp } from "lucide-react";
import { useState } from "react";

interface CustomerRow {
  id: string;
  phone: string;
  name: string | null;
  createdAt: string;
  totalOrders: number;
  deliveredOrders: number;
  totalSpent: number;
  avgRating: number | null;
  ratingCount: number;
  loyaltyProgress: number;
  pendingReward: boolean;
  freeProductsEarned: number;
  lastOrderAt: string | null;
}

export function CustomersTable() {
  const token = getAdminToken();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-customers", page, search],
    queryFn: () =>
      api.get<{ customers: CustomerRow[]; total: number; pages: number }>(
        `/api/admin/customers?page=${page}&limit=20&search=${encodeURIComponent(search)}`,
        token || undefined
      ),
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          {data && (
            <p className="text-sm text-on-surface-variant">
              {data.total} cliente{data.total !== 1 ? "s" : ""} registrado{data.total !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar nombre o teléfono..."
            className="w-64 rounded-xl border border-outline-variant/30 bg-surface-container py-2 pl-9 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/40"
          />
        </div>
      </div>

      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-container-high" />
            ))
          : data?.customers.map((c) => <CustomerCard key={c.id} customer={c} />)}

        {!isLoading && data?.customers.length === 0 && (
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-high p-8 text-center text-sm text-on-surface-variant">
            {search ? `No se encontraron clientes con "${search}"` : "Sin clientes registrados"}
          </div>
        )}
      </div>

      {data && data.pages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-on-surface-variant">
            Página {page} de {data.pages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-outline-variant/30 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
              disabled={page === data.pages}
              className="rounded-lg border border-outline-variant/30 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerCard({ customer: c }: { customer: CustomerRow }) {
  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-high">
      {/* Header row */}
      <div className="flex items-center gap-4 p-4">
        {/* Avatar */}
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/15 font-headline text-lg font-bold text-primary">
          {c.name ? c.name.charAt(0).toUpperCase() : "?"}
        </div>

        {/* Name + phone */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-on-surface">
            {c.name || "Sin nombre"}
          </p>
          <a
            href={`tel:${c.phone}`}
            className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary"
          >
            <Phone size={12} />
            {c.phone}
          </a>
        </div>

        {/* Rating badge */}
        {c.avgRating !== null && (
          <div className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-secondary/30 bg-secondary/10 px-2.5 py-1">
            <Star size={13} className="fill-secondary text-secondary" />
            <span className="text-sm font-bold text-secondary">{c.avgRating}</span>
            <span className="text-[10px] text-on-surface-variant">({c.ratingCount})</span>
          </div>
        )}

        {/* Reward badge */}
        {c.pendingReward && (
          <span className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-bold text-green-400">
            <Gift size={12} />
            Premio
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-px border-t border-outline-variant/10 bg-outline-variant/10">
        <StatCell
          icon={<ShoppingBag size={13} />}
          label="Pedidos"
          value={String(c.deliveredOrders)}
          sub={c.totalOrders !== c.deliveredOrders ? `${c.totalOrders} total` : undefined}
        />
        <StatCell
          icon={<TrendingUp size={13} />}
          label="Gastado"
          value={formatCents(c.totalSpent)}
        />
        <StatCell
          icon={<Star size={13} />}
          label="Lealtad"
          value={`${c.loyaltyProgress % 5}/5`}
          sub={c.freeProductsEarned > 0 ? `${c.freeProductsEarned} ganados` : undefined}
        />
        <StatCell
          label="Último pedido"
          value={
            c.lastOrderAt
              ? new Date(c.lastOrderAt).toLocaleDateString("es-MX", {
                  day: "numeric",
                  month: "short",
                })
              : "—"
          }
          sub={
            c.lastOrderAt
              ? new Date(c.lastOrderAt).toLocaleTimeString("es-MX", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : undefined
          }
        />
      </div>
    </div>
  );
}

function StatCell({
  icon,
  label,
  value,
  sub,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-surface-container-high px-3 py-2.5 text-center">
      <p className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold text-on-surface">{value}</p>
      {sub && <p className="text-[10px] text-on-surface-variant/50">{sub}</p>}
    </div>
  );
}
