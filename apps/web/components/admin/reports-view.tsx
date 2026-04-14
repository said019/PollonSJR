"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { formatCents } from "@pollon/utils";
import { Calendar, TrendingUp, TrendingDown, ShoppingBag, DollarSign } from "lucide-react";
import { useState } from "react";

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

export function ReportsView() {
  const token = getAdminToken();
  const [period, setPeriod] = useState<"7" | "14" | "30">("7");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", period],
    queryFn: () =>
      api.get<ReportsData>(
        `/api/admin/reports?days=${period}`,
        token || undefined
      ),
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Reportes</h1>
        <div className="flex gap-2">
          {(["7", "14", "30"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                period === p
                  ? "bg-primary text-on-primary"
                  : "bg-surface-variant text-on-surface-variant hover:bg-surface-variant"
              }`}
            >
              {p} días
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {data?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-surface-container-high rounded-xl p-5 border border-outline-variant/20">
            <div className="flex items-center justify-between mb-2">
              <DollarSign size={20} className="text-green-500" />
              {data.summary.revenueChange >= 0 ? (
                <span className="flex items-center gap-1 text-secondary text-xs">
                  <TrendingUp size={14} /> +{data.summary.revenueChange.toFixed(1)}%
                </span>
              ) : (
                <span className="flex items-center gap-1 text-error text-xs">
                  <TrendingDown size={14} /> {data.summary.revenueChange.toFixed(1)}%
                </span>
              )}
            </div>
            <p className="text-2xl font-bold">{formatCents(data.summary.periodRevenue)}</p>
            <p className="text-sm text-on-surface-variant">Ingresos del período</p>
          </div>

          <div className="bg-surface-container-high rounded-xl p-5 border border-outline-variant/20">
            <div className="flex items-center justify-between mb-2">
              <ShoppingBag size={20} className="text-blue-500" />
              {data.summary.ordersChange >= 0 ? (
                <span className="flex items-center gap-1 text-secondary text-xs">
                  <TrendingUp size={14} /> +{data.summary.ordersChange.toFixed(1)}%
                </span>
              ) : (
                <span className="flex items-center gap-1 text-error text-xs">
                  <TrendingDown size={14} /> {data.summary.ordersChange.toFixed(1)}%
                </span>
              )}
            </div>
            <p className="text-2xl font-bold">{data.summary.periodOrders}</p>
            <p className="text-sm text-on-surface-variant">Pedidos del período</p>
          </div>

          <div className="bg-surface-container-high rounded-xl p-5 border border-outline-variant/20">
            <Calendar size={20} className="text-purple-500 mb-2" />
            <p className="text-2xl font-bold">{formatCents(data.summary.periodAvgTicket)}</p>
            <p className="text-sm text-on-surface-variant">Ticket promedio</p>
          </div>
        </div>
      )}

      {/* Daily breakdown table */}
      <div className="bg-surface-container-high rounded-xl border border-outline-variant/20 overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="font-bold">Desglose diario</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container border-b">
              <tr>
                <th className="text-left p-3 font-semibold">Fecha</th>
                <th className="text-center p-3 font-semibold">Pedidos</th>
                <th className="text-center p-3 font-semibold">Ingresos</th>
                <th className="text-center p-3 font-semibold">Ticket prom.</th>
                <th className="text-center p-3 font-semibold">Envíos</th>
                <th className="text-center p-3 font-semibold">Recoger</th>
                <th className="text-center p-3 font-semibold">Cancelados</th>
                <th className="text-center p-3 font-semibold">Nuevos clientes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading
                ? Array.from({ length: 7 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="p-3">
                        <div className="h-6 bg-surface-variant rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                : data?.reports.map((day) => (
                    <tr key={day.date} className="hover:bg-surface-container">
                      <td className="p-3 font-medium">
                        {new Date(day.date).toLocaleDateString("es-MX", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                      <td className="p-3 text-center font-semibold">{day.totalOrders}</td>
                      <td className="p-3 text-center font-semibold text-secondary">
                        {formatCents(day.totalRevenue)}
                      </td>
                      <td className="p-3 text-center">{formatCents(day.avgTicket)}</td>
                      <td className="p-3 text-center">{day.deliveryOrders}</td>
                      <td className="p-3 text-center">{day.pickupOrders}</td>
                      <td className="p-3 text-center text-error">
                        {day.cancelledOrders > 0 ? day.cancelledOrders : "—"}
                      </td>
                      <td className="p-3 text-center text-primary">{day.newCustomers}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
