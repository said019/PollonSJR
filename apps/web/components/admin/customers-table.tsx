"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { formatCents } from "@pollon/utils";
import {
  Search, Star, Phone, ShoppingBag, Gift, TrendingUp, X,
  CheckCircle2, Minus, Award, Clock3, Loader2,
  Crown, Sparkles, AlertCircle, ShieldOff, Download, NotebookPen, ListChecks,
} from "lucide-react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getAdminToken as getAdminTokenForExport } from "@/lib/auth";

type Segment = "VIP" | "REGULAR" | "NEW" | "AT_RISK" | "INACTIVE";

interface CustomerRow {
  id: string;
  phone: string;
  email: string | null;
  hasPassword: boolean;
  name: string | null;
  createdAt: string;
  internalNote: string | null;
  blocked: boolean;
  blockedReason: string | null;
  totalOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  totalSpent: number;
  avgTicket: number;
  avgRating: number | null;
  ratingCount: number;
  loyaltyProgress: number;
  pendingReward: boolean;
  freeProductsEarned: number;
  freeProductsUsed: number;
  savedAddresses: number;
  preferredType: string | null;
  preferredPayment: string | null;
  lastOrderAt: string | null;
  daysSinceLast: number | null;
  segment: Segment;
}

interface Resumen {
  clientes: number;
  conCompra: number;
  recurrentes: number;
  ingresos: number;
  ticketPromedio: number;
  premiosPendientes: number;
}

type Orden = "recientes" | "gasto" | "pedidos" | "ultimo" | "lealtad";

const ORDEN_LABEL: Record<Orden, string> = {
  recientes: "Más nuevos",
  gasto: "Los que más gastan",
  pedidos: "Los que más piden",
  ultimo: "Pidieron más reciente",
  lealtad: "Más cerca del premio",
};

interface CustomerOrder {
  id: string;
  orderNumber: number;
  status: string;
  type: string;
  total: number;
  createdAt: string;
  rating: number | null;
}

const SEGMENT_META: Record<
  Segment,
  { label: string; icon: React.ReactNode; classes: string }
> = {
  VIP: {
    label: "VIP",
    icon: <Crown size={11} />,
    classes: "border-yellow-500/40 bg-yellow-500/10 text-yellow-500",
  },
  REGULAR: {
    label: "Regular",
    icon: <Star size={11} />,
    classes: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500",
  },
  NEW: {
    label: "Nuevo",
    icon: <Sparkles size={11} />,
    classes: "border-sky-500/40 bg-sky-500/10 text-sky-500",
  },
  AT_RISK: {
    label: "En riesgo",
    icon: <AlertCircle size={11} />,
    classes: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  },
  INACTIVE: {
    label: "Inactivo",
    icon: <Clock3 size={11} />,
    classes: "border-outline-variant/40 bg-surface-variant text-on-surface-variant",
  },
};

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
  const [segmentFilter, setSegmentFilter] = useState<Segment | "ALL" | "BLOCKED">("ALL");
  // Track only the ID — the actual customer object is always derived
  // from the latest query data so the modal reflects fresh state after
  // mutations (e.g. blocking a customer).
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [orden, setOrden] = useState<Orden>("recientes");

  // El filtro y el orden se resuelven en el SERVIDOR sobre todos los clientes.
  // Antes se filtraba en el navegador sobre los 20 de la página, así que
  // "VIP" sólo encontraba los VIP de esa página y parecía que no había.
  const { data, isLoading } = useQuery({
    queryKey: ["admin-customers", page, search, segmentFilter, orden],
    queryFn: () =>
      api.get<{
        customers: CustomerRow[];
        total: number;
        pages: number;
        segmentCounts: Record<string, number>;
        resumen: Resumen;
      }>(
        `/api/admin/customers?page=${page}&limit=20&search=${encodeURIComponent(
          search
        )}&segment=${segmentFilter}&sort=${orden}`,
        token || undefined
      ),
  });

  const selectedCustomer =
    selectedId
      ? (data?.customers ?? []).find((c) => c.id === selectedId) ?? null
      : null;
  const setSelectedCustomer = (c: CustomerRow | null) =>
    setSelectedId(c?.id ?? null);

  // Ya viene filtrada y ordenada del servidor.
  const filteredCustomers = data?.customers ?? [];

  const handleExport = async () => {
    const t = getAdminTokenForExport();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    const res = await fetch(`${apiUrl}/api/admin/customers/export.csv`, {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    });
    if (!res.ok) {
      alert("Error al exportar");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          {data && (
            <p className="text-sm text-on-surface-variant">
              {data.total} cliente{data.total !== 1 ? "s" : ""} registrado{data.total !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-surface-container px-3 py-2 text-sm font-semibold text-on-surface-variant hover:border-primary/40 hover:text-primary"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Resumen del negocio — antes no había ninguna cifra global */}
      {data?.resumen && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Metrica etiqueta="Clientes" valor={String(data.resumen.clientes)} />
          <Metrica
            etiqueta="Ya compraron"
            valor={String(data.resumen.conCompra)}
            pie={
              data.resumen.clientes
                ? `${Math.round((data.resumen.conCompra / data.resumen.clientes) * 100)}% del total`
                : undefined
            }
          />
          <Metrica
            etiqueta="Recurrentes"
            valor={String(data.resumen.recurrentes)}
            pie="2+ pedidos"
            destacado={data.resumen.recurrentes > 0}
          />
          <Metrica etiqueta="Ingresos" valor={formatCents(data.resumen.ingresos)} />
          <Metrica etiqueta="Ticket prom." valor={formatCents(data.resumen.ticketPromedio)} />
          <Metrica
            etiqueta="Premios listos"
            valor={String(data.resumen.premiosPendientes)}
            pie="por entregar"
            destacado={data.resumen.premiosPendientes > 0}
          />
        </div>
      )}

      {/* Filtros por segmento (con cuántos hay) + orden */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["ALL", "VIP", "REGULAR", "NEW", "AT_RISK", "INACTIVE", "BLOCKED"] as const).map(
          (s) => {
            const active = segmentFilter === s;
            const label =
              s === "ALL"
                ? "Todos"
                : s === "BLOCKED"
                ? "Bloqueados"
                : SEGMENT_META[s as Segment].label;
            const n =
              s === "ALL"
                ? Object.entries(data?.segmentCounts ?? {})
                    .filter(([k]) => k !== "BLOCKED")
                    .reduce((a, [, v]) => a + v, 0)
                : data?.segmentCounts?.[s];
            return (
              <button
                key={s}
                onClick={() => {
                  setSegmentFilter(s);
                  setPage(1);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
                  active
                    ? "border-primary bg-primary text-on-primary"
                    : "border-outline-variant/40 bg-surface-container text-on-surface-variant hover:border-primary/40"
                }`}
              >
                {label}
                {typeof n === "number" && (
                  <span className={active ? "opacity-80" : "text-on-surface-variant/60"}>
                    {n}
                  </span>
                )}
              </button>
            );
          }
        )}

        <select
          value={orden}
          onChange={(e) => {
            setOrden(e.target.value as Orden);
            setPage(1);
          }}
          className="ml-auto rounded-lg border border-outline-variant/40 bg-surface-container px-3 py-1.5 text-xs font-semibold text-on-surface-variant"
        >
          {(Object.keys(ORDEN_LABEL) as Orden[]).map((o) => (
            <option key={o} value={o}>
              Ordenar: {ORDEN_LABEL[o]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-container-high" />
            ))
          : filteredCustomers.map((c) => (
              <CustomerCard
                key={c.id}
                customer={c}
                onClick={() => setSelectedCustomer(c)}
              />
            ))}

        {!isLoading && filteredCustomers.length === 0 && (
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-high p-8 text-center text-sm text-on-surface-variant">
            {search
              ? `No se encontraron clientes con "${search}"`
              : segmentFilter !== "ALL"
              ? "Sin clientes en este segmento"
              : "Sin clientes registrados"}
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
  const seg = SEGMENT_META[c.segment];
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className={`cursor-pointer overflow-hidden rounded-xl border bg-surface-container-high transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 ${
        c.blocked ? "border-error/40 opacity-80" : "border-outline-variant/20"
      }`}
    >
      <div className="flex items-center gap-4 p-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/15 font-headline text-lg font-bold text-primary">
          {c.name ? c.name.charAt(0).toUpperCase() : "?"}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-semibold text-on-surface">{c.name || "Sin nombre"}</p>
            <span
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${seg.classes}`}
            >
              {seg.icon}
              {seg.label}
            </span>
            {c.blocked && (
              <span className="inline-flex items-center gap-1 rounded-md border border-error/40 bg-error/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-error">
                <ShieldOff size={11} /> Bloqueado
              </span>
            )}
            {c.internalNote && (
              <span
                className="inline-flex items-center gap-1 rounded-md border border-outline-variant/30 bg-surface px-1.5 py-0.5 text-[10px] text-on-surface-variant"
                title={c.internalNote}
              >
                <NotebookPen size={11} /> Nota
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-on-surface-variant">
            <span className="flex items-center gap-1">
              <Phone size={12} /> {c.phone}
            </span>
            {c.email && (
              <span className="truncate text-xs text-on-surface-variant/70">{c.email}</span>
            )}
            {c.preferredType && (
              <span className="text-xs text-on-surface-variant/70">
                {c.preferredType === "DELIVERY" ? "🛵 Domicilio" : "🏪 Recoge"}
                {c.preferredPayment &&
                  ` · ${
                    { CASH: "efectivo", CARD: "tarjeta", TRANSFER: "transferencia" }[
                      c.preferredPayment
                    ] ?? c.preferredPayment
                  }`}
              </span>
            )}
            {c.savedAddresses > 0 && (
              <span className="text-xs text-on-surface-variant/70">
                📍 {c.savedAddresses} dir.
              </span>
            )}
          </div>
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

      <div className="grid grid-cols-3 gap-px border-t border-outline-variant/10 bg-outline-variant/10 sm:grid-cols-6">
        <StatCell icon={<ShoppingBag size={13} />} label="Pedidos" value={String(c.deliveredOrders)} />
        <StatCell icon={<TrendingUp size={13} />} label="Gastado" value={formatCents(c.totalSpent)} />
        <StatCell label="Ticket prom." value={c.avgTicket ? formatCents(c.avgTicket) : "—"} />
        <StatCell icon={<Star size={13} />} label="Lealtad" value={`${c.loyaltyProgress % 5}/5`} />
        <StatCell
          label="Sin pedir"
          value={c.daysSinceLast == null ? "nunca" : c.daysSinceLast === 0 ? "hoy" : `${c.daysSinceLast} d`}
          alerta={c.daysSinceLast != null && c.daysSinceLast > 30}
        />
        <StatCell
          label="Cancelados"
          value={String(c.cancelledOrders)}
          alerta={c.cancelledOrders > 0}
        />
      </div>
    </div>
  );
}

function StatCell({
  icon, label, value, alerta,
}: { icon?: React.ReactNode; label: string; value: string; alerta?: boolean }) {
  return (
    <div className="bg-surface-container-high px-3 py-2.5 text-center">
      <p className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">
        {icon}{label}
      </p>
      <p className={`mt-0.5 text-sm font-bold ${alerta ? "text-amber-500" : "text-on-surface"}`}>
        {value}
      </p>
    </div>
  );
}

/** Tarjeta del resumen de negocio (arriba de la lista). */
function Metrica({
  etiqueta, valor, pie, destacado,
}: { etiqueta: string; valor: string; pie?: string; destacado?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        destacado
          ? "border-primary/30 bg-primary/5"
          : "border-outline-variant/20 bg-surface-container-high"
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">
        {etiqueta}
      </p>
      <p className={`mt-0.5 font-headline text-xl font-extrabold ${destacado ? "text-primary" : "text-on-surface"}`}>
        {valor}
      </p>
      {pie && <p className="text-[10px] text-on-surface-variant/60">{pie}</p>}
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

  const { data: customerOrders = [] } = useQuery({
    queryKey: ["admin-customer-orders", customer?.id],
    queryFn: () =>
      api.get<CustomerOrder[]>(
        `/api/admin/customers/${customer!.id}/orders`,
        token || undefined
      ),
    enabled: open && !!token,
  });

  const [noteDraft, setNoteDraft] = useState("");
  const [blockReasonDraft, setBlockReasonDraft] = useState("");

  useEffect(() => {
    if (customer) {
      setNoteDraft(customer.internalNote ?? "");
      setBlockReasonDraft(customer.blockedReason ?? "");
    }
  }, [customer]);

  const updateMut = useMutation({
    mutationFn: (
      data: Partial<{ internalNote: string | null; blocked: boolean; blockedReason: string | null }>
    ) =>
      api.patch(
        `/api/admin/customers/${customer!.id}`,
        data,
        token || undefined
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin-customers"] }),
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

                    {/* Corregir compras — sólo restar.
                        Ya no se pueden SUMAR compras a mano: los sellos se ganan
                        únicamente pidiendo por la app. Ese es el motivo por el
                        que a un cliente le conviene dejar WhatsApp; si se
                        pudieran regalar sellos, el programa deja de migrar a
                        nadie (y la decisión recaía en el mostrador, caso por
                        caso, con el cliente presionando). Se conserva el "−1"
                        para corregir errores reales. */}
                    <section className="rounded-2xl border border-outline-variant/10 bg-surface-container-high p-4">
                      <h3 className="mb-1 font-headline text-sm font-bold text-tertiary">
                        Corregir compras
                      </h3>
                      <p className="mb-3 text-[11px] text-on-surface-variant/70">
                        Las compras se acumulan solas al entregar un pedido hecho
                        en la app. Aquí sólo puedes restar para corregir un error.
                      </p>
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
                        <div className="w-10" aria-hidden />
                      </div>
                    </section>

                    {/* Recent orders */}
                    {customerOrders.length > 0 && (
                      <section className="rounded-2xl border border-outline-variant/10 bg-surface-container-high p-4">
                        <h3 className="mb-3 flex items-center gap-2 font-headline text-sm font-bold text-tertiary">
                          <ListChecks size={16} className="text-on-surface-variant" />
                          Pedidos recientes ({customerOrders.length})
                        </h3>
                        <div className="max-h-56 space-y-1.5 overflow-y-auto">
                          {customerOrders.map((o) => (
                            <div
                              key={o.id}
                              className="flex items-center justify-between rounded-lg bg-surface-container px-3 py-2 text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-primary">
                                  #{o.orderNumber}
                                </span>
                                <span className="rounded-md bg-surface px-1.5 py-0.5 text-[10px] text-on-surface-variant">
                                  {o.type === "DELIVERY" ? "Envío" : "Recoger"}
                                </span>
                                <span
                                  className={`text-[10px] font-bold uppercase ${
                                    o.status === "DELIVERED"
                                      ? "text-emerald-500"
                                      : o.status === "CANCELLED"
                                      ? "text-error"
                                      : "text-amber-500"
                                  }`}
                                >
                                  {o.status}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-tertiary">
                                  {(o.total / 100).toLocaleString("es-MX", {
                                    style: "currency",
                                    currency: "MXN",
                                  })}
                                </span>
                                <span className="text-on-surface-variant/60">
                                  {new Date(o.createdAt).toLocaleDateString("es-MX", {
                                    day: "numeric",
                                    month: "short",
                                  })}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* Internal note */}
                    <section className="rounded-2xl border border-outline-variant/10 bg-surface-container-high p-4">
                      <h3 className="mb-2 flex items-center gap-2 font-headline text-sm font-bold text-tertiary">
                        <NotebookPen size={16} className="text-on-surface-variant" />
                        Nota interna (solo admin)
                      </h3>
                      <textarea
                        rows={3}
                        maxLength={500}
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Cliente VIP, prefiere comunicación por WhatsApp, etc."
                        className="w-full rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-sm text-on-surface outline-none focus:border-primary/60"
                      />
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[11px] text-on-surface-variant/60">
                          {noteDraft.length} / 500
                        </span>
                        <button
                          onClick={() =>
                            updateMut.mutate({ internalNote: noteDraft || null })
                          }
                          disabled={
                            updateMut.isPending ||
                            noteDraft === (customer.internalNote ?? "")
                          }
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-on-primary disabled:opacity-50"
                        >
                          {updateMut.isPending ? "Guardando…" : "Guardar nota"}
                        </button>
                      </div>
                    </section>

                    {/* Blocking */}
                    <section
                      className={`rounded-2xl border p-4 ${
                        customer.blocked
                          ? "border-error/30 bg-error/5"
                          : "border-outline-variant/10 bg-surface-container-high"
                      }`}
                    >
                      <h3 className="mb-2 flex items-center gap-2 font-headline text-sm font-bold text-tertiary">
                        <ShieldOff size={16} className="text-on-surface-variant" />
                        {customer.blocked ? "Cliente bloqueado" : "Bloquear cliente"}
                      </h3>
                      {customer.blocked ? (
                        <>
                          <p className="text-xs text-on-surface-variant">
                            <strong>Motivo:</strong>{" "}
                            {customer.blockedReason ?? "(sin motivo)"}
                          </p>
                          <button
                            onClick={() =>
                              updateMut.mutate({
                                blocked: false,
                                blockedReason: null,
                              })
                            }
                            disabled={updateMut.isPending}
                            className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-500 disabled:opacity-50"
                          >
                            Desbloquear
                          </button>
                        </>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={blockReasonDraft}
                            onChange={(e) => setBlockReasonDraft(e.target.value)}
                            placeholder="Motivo del bloqueo (opcional)"
                            className="w-full rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-2 text-xs"
                          />
                          <button
                            onClick={() => {
                              if (
                                confirm(
                                  `¿Bloquear a ${customer.name ?? customer.phone}? No podrá hacer pedidos hasta que lo desbloquees.`
                                )
                              ) {
                                updateMut.mutate({
                                  blocked: true,
                                  blockedReason: blockReasonDraft || null,
                                });
                              }
                            }}
                            disabled={updateMut.isPending}
                            className="mt-2 rounded-lg border border-error/40 bg-error/10 px-3 py-1.5 text-xs font-bold text-error disabled:opacity-50"
                          >
                            Bloquear cliente
                          </button>
                        </>
                      )}
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
