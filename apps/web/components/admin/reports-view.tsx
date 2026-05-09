"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { formatCents } from "@pollon/utils";
import {
  TrendingUp, TrendingDown, ShoppingBag, DollarSign, Clock, Truck, Store,
  Star, Download, BarChart3, Flame, Users, XCircle, ArrowUpRight,
} from "lucide-react";
import { useState } from "react";

/* ─── Types ─────────────────────────────────────────────── */

interface DailyReport {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  avgTicket: number;
  deliveryOrders: number;
  pickupOrders: number;
  cancelledOrders: number;
  newCustomers: number;
}

interface ReportsData {
  reports: DailyReport[];
  summary: {
    periodRevenue: number;
    periodOrders: number;
    periodAvgTicket: number;
    revenueChange: number;
    ordersChange: number;
  };
}

interface DashboardStats {
  orders: { total: number; active: number };
  revenue: { subtotal: number; deliveryFees: number; total: number; avgTicket: number };
  breakdown: Array<{ type: string; count: number }>;
  byHour: Array<{ hour: number; orders: number }>;
  topProducts: Array<{ name: string; units: number }>;
  avgPrepMinutes: number | null;
}

/* ─── Main Component ────────────────────────────────────── */

export function ReportsView() {
  const token = getAdminToken();
  const [period, setPeriod] = useState<"7" | "14" | "30">("7");
  const [typeFilter, setTypeFilter] = useState<"" | "DELIVERY" | "PICKUP">("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", period, typeFilter],
    queryFn: () =>
      api.get<ReportsData>(
        `/api/admin/reports?days=${period}${
          typeFilter ? `&type=${typeFilter}` : ""
        }`,
        token || undefined
      ),
  });

  const { data: dashboard } = useQuery({
    queryKey: ["admin-dashboard-stats"],
    queryFn: () => api.get<DashboardStats>("/api/admin/dashboard", token || undefined),
    refetchInterval: 30_000,
  });

  const handleCsvExport = async () => {
    const today = new Date().toISOString().split("T")[0];
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/admin/reports/daily/csv?date=${today}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pollon-sjr-${today}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const deliveryToday = dashboard?.breakdown.find((b) => b.type === "DELIVERY")?.count ?? 0;
  const pickupToday = dashboard?.breakdown.find((b) => b.type === "PICKUP")?.count ?? 0;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Reportes</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-surface-container p-0.5">
            {(
              [
                { v: "", l: "Todo" },
                { v: "DELIVERY", l: "Envío" },
                { v: "PICKUP", l: "Sucursal" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.v}
                onClick={() => setTypeFilter(opt.v as typeof typeFilter)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  typeFilter === opt.v
                    ? "bg-primary text-on-primary shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {opt.l}
              </button>
            ))}
          </div>
          <button
            onClick={handleCsvExport}
            className="flex items-center gap-1.5 rounded-lg border border-outline-variant/30 px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Download size={13} />
            Exportar CSV
          </button>
          <div className="flex gap-1 rounded-lg bg-surface-container p-0.5">
            {(["7", "14", "30"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                  period === p
                    ? "bg-primary text-on-primary shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {p}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      {data?.summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard
            icon={<DollarSign size={18} />}
            iconColor="text-green-400 bg-green-400/10"
            label="Ingresos"
            value={formatCents(data.summary.periodRevenue)}
            change={data.summary.revenueChange}
          />
          <SummaryCard
            icon={<ShoppingBag size={18} />}
            iconColor="text-blue-400 bg-blue-400/10"
            label="Pedidos"
            value={String(data.summary.periodOrders)}
            change={data.summary.ordersChange}
          />
          <SummaryCard
            icon={<ArrowUpRight size={18} />}
            iconColor="text-purple-400 bg-purple-400/10"
            label="Ticket promedio"
            value={formatCents(data.summary.periodAvgTicket)}
          />
          <SummaryCard
            icon={<Clock size={18} />}
            iconColor="text-orange-400 bg-orange-400/10"
            label="Tiempo promedio"
            value={dashboard?.avgPrepMinutes ? `${dashboard.avgPrepMinutes} min` : "—"}
            sub="entrega hoy"
          />
        </div>
      )}

      {/* ── Today's Live Stats ── */}
      {dashboard && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <MiniStat icon={<Flame size={14} />} label="Hoy" value={`${dashboard.orders.total} pedidos`} color="text-primary" />
          <MiniStat icon={<BarChart3 size={14} />} label="Activos" value={String(dashboard.orders.active)} color="text-blue-400" />
          <MiniStat icon={<Truck size={14} />} label="Envíos" value={String(deliveryToday)} color="text-violet-400" />
          <MiniStat icon={<Store size={14} />} label="Sucursal" value={String(pickupToday)} color="text-emerald-400" />
          <MiniStat icon={<DollarSign size={14} />} label="Venta hoy" value={formatCents(dashboard.revenue.total)} color="text-secondary" />
        </div>
      )}

      {/* ── Two-column: Top Products + Hourly ── */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {/* Top Products */}
        {dashboard?.topProducts && dashboard.topProducts.length > 0 && (
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-high p-5">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-sm">
              <Star size={16} className="text-secondary" />
              Productos más vendidos hoy
            </h3>
            <div className="space-y-2">
              {dashboard.topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-md text-[10px] font-bold ${
                    i === 0 ? "bg-secondary/20 text-secondary" : "bg-surface-variant text-on-surface-variant"
                  }`}>
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-sm text-on-surface">{p.name}</span>
                  <span className="text-sm font-bold text-primary">{p.units} uds</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hourly Distribution */}
        {dashboard?.byHour && dashboard.byHour.length > 0 && (
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-high p-5">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-sm">
              <Clock size={16} className="text-primary" />
              Pedidos por hora (hoy)
            </h3>
            <div className="flex items-end gap-1" style={{ height: 120 }}>
              {(() => {
                const max = Math.max(...dashboard.byHour.map((h) => h.orders), 1);
                // Show hours 12-23 (typical restaurant hours)
                const hours = Array.from({ length: 12 }, (_, i) => i + 12);
                return hours.map((hr) => {
                  const data = dashboard.byHour.find((h) => h.hour === hr);
                  const count = data?.orders ?? 0;
                  const pct = (count / max) * 100;
                  return (
                    <div key={hr} className="flex flex-1 flex-col items-center gap-1">
                      <div className="relative w-full flex flex-col justify-end" style={{ height: 90 }}>
                        <div
                          className={`w-full rounded-t-sm transition-all ${count > 0 ? "bg-primary" : "bg-surface-variant/30"}`}
                          style={{ height: `${Math.max(pct, 4)}%` }}
                        />
                        {count > 0 && (
                          <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold text-primary">
                            {count}
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-on-surface-variant/60">{hr}h</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </div>

      {/* ── Daily Breakdown Table ── */}
      <div className="rounded-xl border border-outline-variant/20 bg-surface-container-high overflow-hidden">
        <div className="flex items-center justify-between border-b border-outline-variant/10 p-4">
          <h2 className="font-bold">Desglose diario</h2>
          <span className="text-xs text-on-surface-variant">Últimos {period} días</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container border-b border-outline-variant/10">
              <tr>
                <th className="p-3 text-left font-semibold">Fecha</th>
                <th className="p-3 text-center font-semibold">Pedidos</th>
                <th className="p-3 text-center font-semibold">Ingresos</th>
                <th className="p-3 text-center font-semibold">Ticket</th>
                <th className="p-3 text-center font-semibold">
                  <span className="inline-flex items-center gap-1"><Truck size={12} /> Envío</span>
                </th>
                <th className="p-3 text-center font-semibold">
                  <span className="inline-flex items-center gap-1"><Store size={12} /> Sucursal</span>
                </th>
                <th className="p-3 text-center font-semibold">
                  <span className="inline-flex items-center gap-1"><XCircle size={12} /> Cancel.</span>
                </th>
                <th className="p-3 text-center font-semibold">
                  <span className="inline-flex items-center gap-1"><Users size={12} /> Nuevos</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {isLoading
                ? Array.from({ length: 7 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="p-3">
                        <div className="h-6 animate-pulse rounded bg-surface-variant" />
                      </td>
                    </tr>
                  ))
                : data?.reports.map((day) => (
                    <tr key={day.date} className="hover:bg-surface-container transition-colors">
                      <td className="p-3 font-medium">
                        {new Date(day.date + "T12:00:00").toLocaleDateString("es-MX", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="p-3 text-center font-bold">{day.totalOrders}</td>
                      <td className="p-3 text-center font-bold text-secondary">
                        {formatCents(day.totalRevenue)}
                      </td>
                      <td className="p-3 text-center">{formatCents(day.avgTicket)}</td>
                      <td className="p-3 text-center text-violet-400">{day.deliveryOrders || "—"}</td>
                      <td className="p-3 text-center text-emerald-400">{day.pickupOrders || "—"}</td>
                      <td className="p-3 text-center text-error">
                        {day.cancelledOrders > 0 ? day.cancelledOrders : "—"}
                      </td>
                      <td className="p-3 text-center text-primary">{day.newCustomers}</td>
                    </tr>
                  ))}
              {!isLoading && data?.reports.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-sm text-on-surface-variant">
                    Sin datos para este período
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── Summary Card ──────────────────────────────────────── */

function SummaryCard({
  icon, iconColor, label, value, change, sub,
}: {
  icon: React.ReactNode;
  iconColor: string;
  label: string;
  value: string;
  change?: number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container-high p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconColor}`}>
          {icon}
        </div>
        {change !== undefined && (
          <span className={`flex items-center gap-0.5 text-[11px] font-bold ${
            change >= 0 ? "text-green-400" : "text-error"
          }`}>
            {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {change >= 0 ? "+" : ""}{change.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="font-headline text-xl font-extrabold text-on-surface">{value}</p>
      <p className="text-xs text-on-surface-variant">{sub ?? label}</p>
    </div>
  );
}

/* ─── Mini Stat ─────────────────────────────────────────── */

function MiniStat({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-outline-variant/15 bg-surface-container p-3">
      <span className={color}>{icon}</span>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">{label}</p>
        <p className="text-sm font-bold text-on-surface">{value}</p>
      </div>
    </div>
  );
}
