"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import type { OrderSummary } from "@pollon/types";
import { formatCents } from "@pollon/utils";
import { useState } from "react";

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

export function OrdersHistory() {
  const token = getAdminToken();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders-history", page],
    queryFn: () =>
      api.get<{ orders: OrderSummary[]; total: number; pages: number }>(
        `/api/admin/orders/history?page=${page}`,
        token || undefined
      ),
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Historial de Pedidos</h1>

      <div className="bg-surface-container-high rounded-xl border border-outline-variant/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container border-b">
              <tr>
                <th className="text-left p-3 font-semibold"># Pedido</th>
                <th className="text-left p-3 font-semibold">Cliente</th>
                <th className="text-left p-3 font-semibold">Tipo</th>
                <th className="text-left p-3 font-semibold">Total</th>
                <th className="text-left p-3 font-semibold">Estado</th>
                <th className="text-left p-3 font-semibold">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={6} className="p-3">
                        <div className="h-6 bg-surface-variant rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                : data?.orders.map((order) => (
                    <tr key={order.id} className="hover:bg-surface-container">
                      <td className="p-3 font-mono font-bold">{order.orderNumber}</td>
                      <td className="p-3">{order.customerName || "—"}</td>
                      <td className="p-3">
                        <span className="text-xs bg-surface text-primary px-2 py-0.5 rounded-full">
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
                        {new Date(order.createdAt).toLocaleDateString("es-MX")}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-on-surface-variant">
              Página {page} de {data.pages} ({data.total} pedidos)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                disabled={page === data.pages}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
