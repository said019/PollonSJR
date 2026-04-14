"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { formatCents } from "@pollon/utils";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { ConnectionStatus } from "./connection-status";
import {
  ShoppingBag,
  Users,
  DollarSign,
  TrendingUp,
  Clock,
  Flame,
  BarChart3,
} from "lucide-react";

interface DashboardResponse {
  orders: { total: number; active: number };
  revenue: { total: number; avgTicket: number };
  topProducts: Array<{ name: string; units: number }>;
  avgPrepMinutes: number | null;
  byHour: Array<{ hour: number; orders: number }>;
}

export function AdminDashboard() {
  const token = getAdminToken();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () =>
      api.get<DashboardResponse>("/api/admin/dashboard", token || undefined),
    refetchInterval: 60000,
  });

  // Live stats via Socket.io
  const liveStats = useDashboardStats({
    totalOrdersToday: data?.orders.total ?? 0,
    activeOrders: data?.orders.active ?? 0,
    revenueToday: data?.revenue.total ?? 0,
    avgTicket: data?.revenue.avgTicket ?? 0,
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-28 bg-surface-variant rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const cards = [
    {
      label: "Ventas hoy",
      value: formatCents(liveStats.revenueToday),
      icon: <DollarSign size={22} />,
      highlight: false,
    },
    {
      label: "Pedidos hoy",
      value: liveStats.totalOrdersToday,
      icon: <ShoppingBag size={22} />,
      highlight: false,
    },
    {
      label: "Activos ahora",
      value: liveStats.activeOrders,
      icon: <Clock size={22} />,
      highlight: liveStats.activeOrders > 0,
    },
    {
      label: "Ticket promedio",
      value: formatCents(liveStats.avgTicket),
      icon: <TrendingUp size={22} />,
      highlight: false,
    },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-headline font-bold">Dashboard</h1>
        <ConnectionStatus connected={true} />
      </div>

      {/* Live stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-xl p-5 border transition-colors ${
              card.highlight
                ? "bg-primary/10 border-primary/30"
                : "bg-surface-container-high border-outline-variant/20"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
                card.highlight
                  ? "bg-primary/20 text-primary"
                  : "bg-surface-variant text-on-surface-variant"
              }`}
            >
              {card.icon}
            </div>
            <p
              className={`text-3xl font-headline font-black ${
                card.highlight ? "text-primary" : "text-on-surface"
              }`}
            >
              {card.value}
            </p>
            <p className="text-xs text-on-surface-variant font-headline font-bold uppercase tracking-wider mt-1">
              {card.label}
            </p>
          </div>
        ))}
      </div>

      {/* Top products + Avg prep time */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {/* Top products */}
        <div className="bg-surface-container-high rounded-xl p-5 border border-outline-variant/20">
          <div className="flex items-center gap-2 mb-4">
            <Flame size={18} className="text-primary" />
            <h2 className="font-headline font-bold text-sm uppercase tracking-wider">
              Top productos hoy
            </h2>
          </div>
          {data?.topProducts && data.topProducts.length > 0 ? (
            <div className="space-y-3">
              {data.topProducts.map((p, i) => (
                <div key={p.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-on-surface-variant w-5">
                      #{i + 1}
                    </span>
                    <span className="text-sm font-medium">{p.name}</span>
                  </div>
                  <span className="text-sm font-headline font-bold text-primary">
                    {p.units} uds
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant">Sin datos aún</p>
          )}
        </div>

        {/* Avg prep time + hourly chart placeholder */}
        <div className="bg-surface-container-high rounded-xl p-5 border border-outline-variant/20">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={18} className="text-secondary" />
            <h2 className="font-headline font-bold text-sm uppercase tracking-wider">
              Rendimiento
            </h2>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-1">
                Tiempo promedio de preparación
              </p>
              <p className="text-2xl font-headline font-black text-secondary">
                {data?.avgPrepMinutes != null
                  ? `${data.avgPrepMinutes} min`
                  : "—"}
              </p>
            </div>
            {data?.byHour && data.byHour.length > 0 && (
              <div>
                <p className="text-xs text-on-surface-variant uppercase tracking-wider mb-2">
                  Pedidos por hora
                </p>
                <div className="flex items-end gap-1 h-16">
                  {data.byHour.map((h) => {
                    const max = Math.max(...data.byHour.map((x) => x.orders));
                    const pct = max > 0 ? (h.orders / max) * 100 : 0;
                    return (
                      <div
                        key={h.hour}
                        className="flex-1 bg-primary/30 rounded-t group relative"
                        style={{ height: `${Math.max(pct, 8)}%` }}
                        title={`${h.hour}:00 — ${h.orders} pedidos`}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-surface-container-high rounded-xl p-4 border border-outline-variant/20">
        <h2 className="font-headline font-bold mb-3">Acciones rápidas</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { href: "/admin/orders", icon: <ShoppingBag size={24} />, label: "Pedidos" },
            { href: "/admin/menu", icon: <TrendingUp size={24} />, label: "Menú" },
            { href: "/admin/customers", icon: <Users size={24} />, label: "Clientes" },
            { href: "/admin/reports", icon: <DollarSign size={24} />, label: "Reportes" },
          ].map((a) => (
            <a
              key={a.href}
              href={a.href}
              className="border border-outline-variant/20 rounded-lg p-3 text-center hover:bg-surface-container transition"
            >
              <div className="mx-auto mb-1 text-primary flex justify-center">
                {a.icon}
              </div>
              <p className="text-sm font-medium">{a.label}</p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
