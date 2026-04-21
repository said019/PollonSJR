"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { formatCents } from "@pollon/utils";
import {
  Search, Star, Phone, ShoppingBag, Gift, TrendingUp, X,
  CheckCircle2, Minus, Plus, Award, Clock3, Loader2,
} from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

interface LoyaltyDetail {
  info: {
    completedOrders: number;
    freeProductsEarned: number;
    freeProductsUsed: number;
    progress: number;
    ordersToNext: number;
    target: number;
    pendingReward: boolean;
    pendingProduct: { id: string; name: string; emoji: string | null } | null;
    rewardEarnedAt: string | null;
    rewardExpiresAt: string | null;
  };
  history: Array<{
    id: string;
    orderDelta: number;
    reason: string;
    createdAt: string;
  }>;
}

export function CustomersTable() {
  const token = getAdminToken();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);

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
          : data?.customers.map((c) => (
              <CustomerCard
                key={c.id}
                customer={c}
                onClick={() => setSelectedCustomer(c)}
              />
            ))}

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

      {/* Customer detail modal */}
      <CustomerDetailModal
        customer={selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
      />
    </div>
  );
}

/* ─── Customer Card ──────────────────────────────────────── */

function CustomerCard({ customer: c, onClick }: { customer: CustomerRow; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className="cursor-pointer overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-high transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="flex items-center gap-4 p-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/15 font-headline text-lg font-bold text-primary">
          {c.name ? c.name.charAt(0).toUpperCase() : "?"}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-on-surface">{c.name || "Sin nombre"}</p>
          <span className="flex items-center gap-1 text-sm text-on-surface-variant">
            <Phone size={12} /> {c.phone}
          </span>
        </div>

        {c.avgRating !== null && (
          <div className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-secondary/30 bg-secondary/10 px-2.5 py-1">
            <Star size={13} className="fill-secondary text-secondary" />
            <span className="text-sm font-bold text-secondary">{c.avgRating}</span>
            <span className="text-[10px] text-on-surface-variant">({c.ratingCount})</span>
          </div>
        )}

        {c.pendingReward && (
          <span className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-bold text-green-400">
            <Gift size={12} /> Premio
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-px border-t border-outline-variant/10 bg-outline-variant/10">
        <StatCell icon={<ShoppingBag size={13} />} label="Pedidos" value={String(c.deliveredOrders)} />
        <StatCell icon={<TrendingUp size={13} />} label="Gastado" value={formatCents(c.totalSpent)} />
        <StatCell icon={<Star size={13} />} label="Lealtad" value={`${c.loyaltyProgress % 5}/5`} />
        <StatCell
          label="Último pedido"
          value={c.lastOrderAt ? new Date(c.lastOrderAt).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : "—"}
        />
      </div>
    </div>
  );
}

function StatCell({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-surface-container-high px-3 py-2.5 text-center">
      <p className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">
        {icon}{label}
      </p>
      <p className="mt-0.5 text-sm font-bold text-on-surface">{value}</p>
    </div>
  );
}

/* ─── Customer Detail Modal ──────────────────────────────── */

function CustomerDetailModal({
  customer,
  onClose,
}: {
  customer: CustomerRow | null;
  onClose: () => void;
}) {
  const token = getAdminToken();
  const qc = useQueryClient();
  const open = !!customer;

  const { data: loyalty, isLoading } = useQuery({
    queryKey: ["admin-customer-loyalty", customer?.id],
    queryFn: () =>
      api.get<LoyaltyDetail>(
        `/api/admin/loyalty/customers/${customer!.id}`,
        token || undefined
      ),
    enabled: open && !!token,
  });

  const redeemMut = useMutation({
    mutationFn: () =>
      api.post(`/api/admin/loyalty/customers/${customer!.id}/redeem`, {}, token || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-customer-loyalty", customer?.id] });
      qc.invalidateQueries({ queryKey: ["admin-customers"] });
    },
  });

  const adjustMut = useMutation({
    mutationFn: ({ delta, reason }: { delta: number; reason: string }) =>
      api.patch(
        `/api/admin/loyalty/customers/${customer!.id}/adjust`,
        { delta, reason },
        token || undefined
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-customer-loyalty", customer?.id] });
      qc.invalidateQueries({ queryKey: ["admin-customers"] });
    },
  });

  const info = loyalty?.info;
  const history = loyalty?.history ?? [];

  return (
    <AnimatePresence>
      {open && customer && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.55 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-outline-variant/15 bg-surface-container shadow-2xl sm:rounded-3xl"
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b border-outline-variant/10 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15 font-headline text-xl font-bold text-primary">
                    {customer.name ? customer.name.charAt(0).toUpperCase() : "?"}
                  </div>
                  <div>
                    <h2 className="font-headline text-lg font-extrabold text-tertiary">
                      {customer.name || "Sin nombre"}
                    </h2>
                    <a href={`tel:${customer.phone}`} className="flex items-center gap-1 text-sm text-on-surface-variant hover:text-primary">
                      <Phone size={12} /> {customer.phone}
                    </a>
                  </div>
                </div>
                <button onClick={onClose} className="rounded-xl border border-outline-variant/20 p-2 text-on-surface-variant hover:text-tertiary">
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-5">
                {isLoading || !info ? (
                  <div className="flex justify-center py-8">
                    <Loader2 size={24} className="animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Loyalty progress */}
                    <section className="rounded-2xl border border-outline-variant/10 bg-surface-container-high p-4">
                      <h3 className="mb-3 flex items-center gap-2 font-headline text-sm font-bold text-tertiary">
                        <Award size={16} className="text-primary" />
                        Programa de Lealtad
                      </h3>

                      {/* Stamps */}
                      <div className="mb-3 grid grid-cols-5 gap-2">
                        {Array.from({ length: info.target }).map((_, i) => {
                          const filled = i < info.progress;
                          return (
                            <div
                              key={i}
                              className={`flex h-10 items-center justify-center rounded-lg border text-sm font-bold ${
                                filled
                                  ? "border-primary bg-primary text-on-primary"
                                  : "border-outline-variant/30 text-on-surface-variant/40"
                              }`}
                            >
                              {filled ? <CheckCircle2 size={16} /> : i + 1}
                            </div>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <p className="text-on-surface-variant/60">Compras</p>
                          <p className="font-bold text-on-surface">{info.completedOrders}</p>
                        </div>
                        <div>
                          <p className="text-on-surface-variant/60">Ganados</p>
                          <p className="font-bold text-secondary">{info.freeProductsEarned}</p>
                        </div>
                        <div>
                          <p className="text-on-surface-variant/60">Canjeados</p>
                          <p className="font-bold text-on-surface">{info.freeProductsUsed}</p>
                        </div>
                      </div>
                    </section>

                    {/* Pending reward */}
                    {info.pendingReward && (
                      <section className="rounded-2xl border border-green-500/30 bg-green-500/5 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <h3 className="flex items-center gap-2 font-headline text-sm font-bold text-green-400">
                              <Gift size={16} />
                              Recompensa lista
                            </h3>
                            <p className="mt-0.5 text-xs text-on-surface-variant">
                              {info.pendingProduct
                                ? `${info.pendingProduct.emoji ?? ""} ${info.pendingProduct.name} gratis`
                                : "Producto gratis"}
                            </p>
                            {info.rewardExpiresAt && (
                              <p className="mt-0.5 text-[10px] text-on-surface-variant/60">
                                Vence: {new Date(info.rewardExpiresAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => redeemMut.mutate()}
                          disabled={redeemMut.isPending}
                          className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white transition-all hover:bg-green-500 active:scale-[0.98] disabled:opacity-50"
                        >
                          {redeemMut.isPending ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <Gift size={15} />
                          )}
                          Canjear recompensa ahora
                        </button>
                        {redeemMut.isSuccess && (
                          <p className="mt-2 text-center text-xs font-semibold text-green-400">
                            Recompensa canjeada correctamente
                          </p>
                        )}
                      </section>
                    )}

                    {/* Quick adjust */}
                    <section className="rounded-2xl border border-outline-variant/10 bg-surface-container-high p-4">
                      <h3 className="mb-3 font-headline text-sm font-bold text-tertiary">
                        Ajustar compras manualmente
                      </h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => adjustMut.mutate({ delta: -1, reason: "Ajuste admin: -1" })}
                          disabled={adjustMut.isPending || info.completedOrders <= 0}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-outline-variant/30 text-on-surface-variant transition-colors hover:border-error hover:text-error disabled:opacity-30"
                        >
                          <Minus size={16} />
                        </button>
                        <div className="flex-1 text-center">
                          <p className="font-headline text-2xl font-extrabold text-primary">
                            {info.completedOrders}
                          </p>
                          <p className="text-[10px] text-on-surface-variant/60">compras totales</p>
                        </div>
                        <button
                          onClick={() => adjustMut.mutate({ delta: 1, reason: "Ajuste admin: +1" })}
                          disabled={adjustMut.isPending}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-outline-variant/30 text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:opacity-30"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </section>

                    {/* History */}
                    {history.length > 0 && (
                      <section className="rounded-2xl border border-outline-variant/10 bg-surface-container-high p-4">
                        <h3 className="mb-3 flex items-center gap-2 font-headline text-sm font-bold text-tertiary">
                          <Clock3 size={16} className="text-on-surface-variant" />
                          Historial de lealtad
                        </h3>
                        <div className="max-h-48 space-y-1.5 overflow-y-auto">
                          {history.slice(0, 15).map((e) => (
                            <div key={e.id} className="flex items-center justify-between rounded-lg bg-surface-container px-3 py-2 text-xs">
                              <span className="text-on-surface-variant">
                                {e.reason.startsWith("order:#")
                                  ? `Compra ${e.reason.replace("order:", "")}`
                                  : e.reason.startsWith("admin:")
                                    ? e.reason.replace("admin:", "")
                                    : e.reason}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className={`font-bold ${e.orderDelta >= 0 ? "text-primary" : "text-error"}`}>
                                  {e.orderDelta > 0 ? "+" : ""}{e.orderDelta}
                                </span>
                                <span className="text-on-surface-variant/40">
                                  {new Date(e.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
