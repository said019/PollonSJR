"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import type { OrderSummary } from "@pollon/types";
import { formatCents } from "@pollon/utils";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Calendar, ChevronLeft, ChevronRight, X, Search } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Pago pendiente",
  RECEIVED: "Recibido",
  PREPARING: "Preparando",
  READY: "Listo",
  ON_THE_WAY: "En camino",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING_PAYMENT: "bg-yellow-100 text-yellow-700",
  RECEIVED: "bg-blue-100 text-blue-700",
  PREPARING: "bg-orange-100 text-orange-700",
  READY: "bg-secondary-container/30 text-green-700",
  ON_THE_WAY: "bg-purple-100 text-purple-700",
  DELIVERED: "bg-surface-variant text-on-surface",
  CANCELLED: "bg-error-container/30 text-red-700",
};

// ── Date helpers ─────────────────────────────────────────────────────────
function toLocalISO(date: Date): string {
  // Returns YYYY-MM-DD in local time (not UTC)
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const PRESETS = [
  { label: "Hoy",        getDates: () => { const t = toLocalISO(new Date()); return { from: t, to: t }; } },
  { label: "Ayer",       getDates: () => { const d = new Date(); d.setDate(d.getDate() - 1); const t = toLocalISO(d); return { from: t, to: t }; } },
  { label: "7 días",     getDates: () => { const d = new Date(); d.setDate(d.getDate() - 6); return { from: toLocalISO(d), to: toLocalISO(new Date()) }; } },
  { label: "Este mes",   getDates: () => { const n = new Date(); const s = new Date(n.getFullYear(), n.getMonth(), 1); return { from: toLocalISO(s), to: toLocalISO(n) }; } },
  { label: "Mes pasado", getDates: () => { const n = new Date(); const s = new Date(n.getFullYear(), n.getMonth() - 1, 1); const e = new Date(n.getFullYear(), n.getMonth(), 0); return { from: toLocalISO(s), to: toLocalISO(e) }; } },
];

type StatusFilter = "" | "DELIVERED" | "CANCELLED";
type TypeFilter = "" | "DELIVERY" | "PICKUP";

export function OrdersHistory() {
  const token = getAdminToken();
  const params = useSearchParams();
  const initialStatus = params.get("status");
  const initialType = params.get("type");

  const [page, setPage]         = useState(1);
  // Default a "hoy" (TZ México) si la URL no especifica fechas. Antes el
  // historial abría completamente vacío y el admin tenía que tocar un preset
  // para ver cualquier cosa.
  const todayISO = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Mexico_City",
  });
  const [dateFrom, setDateFrom] = useState(params.get("dateFrom") || todayISO);
  const [dateTo, setDateTo]     = useState(params.get("dateTo") || todayISO);
  const [search, setSearch]     = useState(params.get("search") || "");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    initialStatus === "DELIVERED" || initialStatus === "CANCELLED" ? initialStatus : ""
  );
  const [typeFilter, setTypeFilter]     = useState<TypeFilter>(
    initialType === "DELIVERY" || initialType === "PICKUP" ? initialType : ""
  );
  const [activePreset, setActivePreset] = useState<string | null>(null);

  function applyPreset(preset: typeof PRESETS[number]) {
    const { from, to } = preset.getDates();
    setDateFrom(from);
    setDateTo(to);
    setActivePreset(preset.label);
    setPage(1);
  }

  function clearFilters() {
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setStatusFilter("");
    setTypeFilter("");
    setActivePreset(null);
    setPage(1);
  }

  const hasFilter = dateFrom || dateTo || search.trim() || statusFilter || typeFilter;

  const qs = new URLSearchParams({ page: String(page) });
  if (dateFrom) qs.set("dateFrom", dateFrom);
  if (dateTo)   qs.set("dateTo", dateTo);
  if (search.trim()) qs.set("search", search.trim());
  if (statusFilter)  qs.set("status", statusFilter);
  if (typeFilter)    qs.set("type", typeFilter);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders-history", page, dateFrom, dateTo, search, statusFilter, typeFilter],
    queryFn: () =>
      api.get<{ orders: OrderSummary[]; total: number; pages: number }>(
        `/api/admin/orders/history?${qs.toString()}`,
        token || undefined
      ),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Historial de Pedidos</h1>
        {hasFilter && (
          <span className="text-xs text-primary font-semibold">
            {data?.total ?? "..."} resultado{data?.total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── Filters bar ─────────────────────────────────────── */}
      <div className="bg-surface-container-high rounded-xl border border-outline-variant/20 p-4 space-y-3">
        {/* Search + dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Buscar por #pedido, cliente o teléfono"
              className="w-full bg-surface-container rounded-lg border border-outline-variant/20 text-xs text-on-surface pl-8 pr-3 py-1.5 focus:border-primary/50 outline-none transition-all"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as StatusFilter);
              setPage(1);
            }}
            className="bg-surface-container rounded-lg border border-outline-variant/20 text-xs text-on-surface px-2.5 py-1.5 focus:border-primary/50 outline-none"
          >
            <option value="">Todos los estados</option>
            <option value="DELIVERED">Entregados</option>
            <option value="CANCELLED">Cancelados</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as TypeFilter);
              setPage(1);
            }}
            className="bg-surface-container rounded-lg border border-outline-variant/20 text-xs text-on-surface px-2.5 py-1.5 focus:border-primary/50 outline-none"
          >
            <option value="">Todos los tipos</option>
            <option value="DELIVERY">Envío</option>
            <option value="PICKUP">Sucursal</option>
          </select>
        </div>

        {/* Preset buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Calendar size={15} className="text-on-surface-variant shrink-0" />
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                activePreset === p.label
                  ? "bg-primary text-on-primary border-primary"
                  : "border-outline-variant/30 text-on-surface-variant hover:border-primary/40 hover:text-primary"
              }`}
            >
              {p.label}
            </button>
          ))}
          {hasFilter && (
            <button
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-error border border-error/30 hover:bg-error/10 transition-all"
            >
              <X size={12} />
              Limpiar
            </button>
          )}
        </div>

        {/* Custom range inputs */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-on-surface-variant font-medium whitespace-nowrap">
              Desde
            </label>
            <input
              type="date"
              value={dateFrom}
              max={dateTo || toLocalISO(new Date())}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setActivePreset(null);
                setPage(1);
              }}
              className="bg-surface-container rounded-lg border border-outline-variant/20 text-xs text-on-surface px-2.5 py-1.5 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all [color-scheme:dark]"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-on-surface-variant font-medium whitespace-nowrap">
              Hasta
            </label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={toLocalISO(new Date())}
              onChange={(e) => {
                setDateTo(e.target.value);
                setActivePreset(null);
                setPage(1);
              }}
              className="bg-surface-container rounded-lg border border-outline-variant/20 text-xs text-on-surface px-2.5 py-1.5 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all [color-scheme:dark]"
            />
          </div>
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────── */}
      <div className="bg-surface-container-high rounded-xl border border-outline-variant/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container border-b border-outline-variant/15">
              <tr>
                <th className="text-left p-3 font-semibold"># Pedido</th>
                <th className="text-left p-3 font-semibold">Cliente</th>
                <th className="text-left p-3 font-semibold">Tipo</th>
                <th className="text-left p-3 font-semibold">Total</th>
                <th className="text-left p-3 font-semibold">Estado</th>
                <th className="text-left p-3 font-semibold">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="p-3">
                        <div className="h-5 bg-surface-variant rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                : data?.orders.length === 0
                ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-on-surface-variant">
                        <div className="flex flex-col items-center gap-2">
                          <Calendar size={32} className="opacity-30" />
                          <p className="text-sm">
                            {hasFilter
                              ? "Sin pedidos en este rango de fechas"
                              : "Sin pedidos en el historial"}
                          </p>
                          {hasFilter && (
                            <button
                              onClick={clearFilters}
                              className="mt-1 text-xs text-primary underline"
                            >
                              Ver todos los pedidos
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                : data?.orders.map((order) => (
                    <tr key={order.id} className="hover:bg-surface-container/60 transition-colors">
                      <td className="p-3 font-mono font-bold text-primary">{order.orderNumber}</td>
                      <td className="p-3">{order.customerName || "—"}</td>
                      <td className="p-3">
                        <span className="text-xs bg-surface text-on-surface-variant border border-outline-variant/20 px-2 py-0.5 rounded-full">
                          {order.type === "DELIVERY" ? "Envío" : "Recoger"}
                        </span>
                      </td>
                      <td className="p-3 font-semibold">{formatCents(order.total)}</td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[order.status] || ""}`}>
                          {STATUS_LABEL[order.status] || order.status}
                        </span>
                      </td>
                      <td className="p-3 text-on-surface-variant">
                        {new Date(order.createdAt).toLocaleDateString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && (data.pages ?? 1) > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-outline-variant/15">
            <p className="text-xs text-on-surface-variant">
              Página {page} de {data.pages} &nbsp;·&nbsp; {data.total} pedidos
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-outline-variant/20 text-on-surface-variant hover:border-primary/40 hover:text-primary disabled:opacity-30 transition-all"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                disabled={page === data.pages}
                className="p-1.5 rounded-lg border border-outline-variant/20 text-on-surface-variant hover:border-primary/40 hover:text-primary disabled:opacity-30 transition-all"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
