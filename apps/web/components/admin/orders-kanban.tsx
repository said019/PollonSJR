"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { useSocket } from "@/hooks/useSocket";
import type { OrderSummary, OrderStatusType } from "@pollon/types";
import { formatCents } from "@pollon/utils";
import { Clock, ChefHat, Package, Truck, CheckCircle } from "lucide-react";
import { useCallback } from "react";
import { ConnectionStatus } from "./connection-status";

const COLUMNS: { status: OrderStatusType; label: string; icon: React.ReactNode; color: string }[] = [
  { status: "RECEIVED", label: "Recibidos", icon: <Clock size={18} />, color: "border-blue-400" },
  { status: "PREPARING", label: "Preparando", icon: <ChefHat size={18} />, color: "border-orange-400" },
  { status: "READY", label: "Listos", icon: <Package size={18} />, color: "border-green-400" },
  { status: "ON_THE_WAY", label: "En camino", icon: <Truck size={18} />, color: "border-purple-400" },
  { status: "DELIVERED", label: "Entregados", icon: <CheckCircle size={18} />, color: "border-gray-400" },
];

const NEXT_STATUS: Record<string, OrderStatusType | null> = {
  RECEIVED: "PREPARING",
  PREPARING: "READY",
  READY: "ON_THE_WAY",
  ON_THE_WAY: "DELIVERED",
  DELIVERED: null,
};

export function OrdersKanban() {
  const adminToken = getAdminToken();
  const qc = useQueryClient();
  const socketAuth = { token: adminToken || undefined, role: "admin" as const };

  const { data: orders = [] } = useQuery({
    queryKey: ["admin-active-orders"],
    queryFn: () => api.get<OrderSummary[]>("/api/admin/orders", adminToken || undefined),
    refetchInterval: 15000,
  });

  // Real-time updates with admin auth
  const { connected } = useSocket("order:new", () => {
    qc.invalidateQueries({ queryKey: ["admin-active-orders"] });
  }, socketAuth);

  useSocket("order:status", () => {
    qc.invalidateQueries({ queryKey: ["admin-active-orders"] });
  }, socketAuth);

  const advanceMut = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: OrderStatusType }) =>
      api.patch(`/api/admin/orders/${orderId}/status`, { status }, adminToken || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-active-orders"] }),
  });

  const advance = useCallback(
    (orderId: string, currentStatus: string) => {
      const next = NEXT_STATUS[currentStatus];
      if (next) advanceMut.mutate({ orderId, status: next });
    },
    [advanceMut]
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Pedidos Activos</h1>
        <ConnectionStatus connected={connected} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 overflow-x-auto">
        {COLUMNS.map((col) => {
          const colOrders = orders.filter((o) => o.status === col.status);
          return (
            <div key={col.status} className={`border-t-4 ${col.color} bg-surface-container-high rounded-xl p-4 min-h-[200px]`}>
              <div className="flex items-center gap-2 mb-4">
                {col.icon}
                <h2 className="font-semibold text-sm">{col.label}</h2>
                <span className="ml-auto bg-surface-variant text-on-surface-variant text-xs px-2 py-0.5 rounded-full">
                  {colOrders.length}
                </span>
              </div>

              <div className="space-y-3">
                {colOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-surface-container rounded-lg p-3 border border-outline-variant/20"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-sm">#{order.orderNumber}</span>
                      <span className="text-xs bg-surface text-primary px-2 py-0.5 rounded-full">
                        {order.type === "DELIVERY" ? "Envío" : "Recoger"}
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant mb-1">{order.customerName || "Cliente"}</p>
                    <p className="text-xs text-on-surface-variant mb-2">
                      {order.itemCount} producto{order.itemCount > 1 ? "s" : ""} — {formatCents(order.total)}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {new Date(order.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                    </p>

                    {NEXT_STATUS[col.status] && (
                      <button
                        onClick={() => advance(order.id, col.status)}
                        disabled={advanceMut.isPending}
                        className="mt-2 w-full bg-primary text-on-primary text-xs py-2 rounded-lg font-medium disabled:opacity-50"
                      >
                        Mover a → {COLUMNS.find((c) => c.status === NEXT_STATUS[col.status])?.label}
                      </button>
                    )}
                  </div>
                ))}

                {colOrders.length === 0 && (
                  <p className="text-xs text-on-surface-variant text-center py-4">Sin pedidos</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
