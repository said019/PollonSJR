"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { useSocket } from "@/hooks/useSocket";
import type { OrderSummary, OrderStatusType } from "@pollon/types";
import { formatCents } from "@pollon/utils";
import { Clock, ChefHat, Package, Truck, CheckCircle, Eye, Store, MapPin, Landmark, FileCheck2 } from "lucide-react";
import { useCallback, useState, useEffect } from "react";
import { ConnectionStatus } from "./connection-status";
import { OrderDetailModal } from "./order-detail-modal";
import { playNewOrderSound, preloadNewOrderSound } from "@/lib/notification-sound";

const COLUMNS: { status: OrderStatusType; label: string; icon: React.ReactNode; color: string }[] = [
  { status: "PENDING_PAYMENT", label: "Por confirmar", icon: <Landmark size={18} />, color: "border-amber-400" },
  { status: "RECEIVED", label: "Recibidos", icon: <Clock size={18} />, color: "border-blue-400" },
  { status: "PREPARING", label: "Preparando", icon: <ChefHat size={18} />, color: "border-orange-400" },
  { status: "READY", label: "Listos", icon: <Package size={18} />, color: "border-green-400" },
  { status: "ON_THE_WAY", label: "En camino", icon: <Truck size={18} />, color: "border-purple-400" },
];

const NEXT_STATUS: Record<string, OrderStatusType | null> = {
  RECEIVED: "PREPARING",
  PREPARING: "READY",
  READY: "ON_THE_WAY",
  ON_THE_WAY: "DELIVERED",
  DELIVERED: null,
};

const ADVANCE_LABEL: Record<string, string> = {
  RECEIVED: "Preparar 🔥",
  PREPARING: "Marcar Listo ✓",
  READY: "Despachar 🛵",
  ON_THE_WAY: "Finalizar ✓",
};

type TypeFilter = "ALL" | "DELIVERY" | "PICKUP";

export function OrdersKanban() {
  const adminToken = getAdminToken();
  const qc = useQueryClient();
  const socketAuth = { token: adminToken || undefined, role: "admin" as const };
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");

  const { data: orders = [] } = useQuery({
    queryKey: ["admin-active-orders"],
    queryFn: () => api.get<OrderSummary[]>("/api/admin/orders", adminToken || undefined),
    refetchInterval: 15000,
  });

  // Pre-load audio file so it plays instantly when a new order arrives
  useEffect(() => {
    preloadNewOrderSound();
  }, []);

  // Real-time updates with admin auth
  const { connected } = useSocket("order:new", () => {
    playNewOrderSound();
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

  // Counts for filter badges
  const deliveryCount = orders.filter((o) => o.type === "DELIVERY").length;
  const pickupCount = orders.filter((o) => o.type === "PICKUP").length;

  // Apply filter
  const filtered = typeFilter === "ALL"
    ? orders
    : orders.filter((o) => o.type === typeFilter);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Pedidos Activos</h1>
        <ConnectionStatus connected={connected} />
      </div>

      {/* Type filter tabs */}
      <div className="mb-5 flex items-center gap-2">
        <FilterTab
          active={typeFilter === "ALL"}
          onClick={() => setTypeFilter("ALL")}
          count={orders.length}
        >
          Todos
        </FilterTab>
        <FilterTab
          active={typeFilter === "PICKUP"}
          onClick={() => setTypeFilter("PICKUP")}
          count={pickupCount}
          color="text-emerald-400 border-emerald-400/40 bg-emerald-400/10"
          activeColor="bg-emerald-500 text-white border-emerald-500"
          icon={<Store size={13} />}
        >
          Sucursal
        </FilterTab>
        <FilterTab
          active={typeFilter === "DELIVERY"}
          onClick={() => setTypeFilter("DELIVERY")}
          count={deliveryCount}
          color="text-violet-400 border-violet-400/40 bg-violet-400/10"
          activeColor="bg-violet-500 text-white border-violet-500"
          icon={<Truck size={13} />}
        >
          Envío
        </FilterTab>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {COLUMNS.map((col) => {
          const colOrders = filtered.filter((o) => o.status === col.status);
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
                  <OrderCard
                    key={order.id}
                    order={order}
                    colStatus={col.status}
                    onDetail={() => setDetailOrderId(order.id)}
                    onAdvance={() => advance(order.id, col.status)}
                    advancePending={advanceMut.isPending}
                  />
                ))}

                {colOrders.length === 0 && (
                  <p className="text-xs text-on-surface-variant text-center py-4">Sin pedidos</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <OrderDetailModal
        orderId={detailOrderId}
        onClose={() => setDetailOrderId(null)}
      />
    </div>
  );
}

/* ─── Filter Tab ──────────────────────────────────────────── */

function FilterTab({
  active,
  onClick,
  count,
  children,
  icon,
  color = "text-on-surface-variant border-outline-variant/30",
  activeColor = "bg-primary text-on-primary border-primary",
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
  icon?: React.ReactNode;
  color?: string;
  activeColor?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
        active ? activeColor : color
      }`}
    >
      {icon}
      {children}
      <span className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
        active ? "bg-white/20" : "bg-surface-variant"
      }`}>
        {count}
      </span>
    </button>
  );
}

/* ─── Order Card ──────────────────────────────────────────── */

function OrderCard({
  order,
  colStatus,
  onDetail,
  onAdvance,
  advancePending,
}: {
  order: OrderSummary;
  colStatus: OrderStatusType;
  onDetail: () => void;
  onAdvance: () => void;
  advancePending: boolean;
}) {
  const isDelivery = order.type === "DELIVERY";
  const nextStatus = NEXT_STATUS[colStatus];
  const isPendingTransfer =
    colStatus === "PENDING_PAYMENT" && order.paymentMethod === "TRANSFER";
  const hasProof = !!order.transferProofUrl;

  return (
    <div
      onClick={onDetail}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onDetail();
        }
      }}
      className={`group cursor-pointer overflow-hidden rounded-lg border transition-all hover:shadow-lg ${
        isDelivery
          ? "border-l-[3px] border-l-violet-500 border-t-violet-500/10 border-r-violet-500/10 border-b-violet-500/10 hover:border-violet-400/60 hover:shadow-violet-500/10"
          : "border-l-[3px] border-l-emerald-500 border-t-emerald-500/10 border-r-emerald-500/10 border-b-emerald-500/10 hover:border-emerald-400/60 hover:shadow-emerald-500/10"
      } bg-surface-container`}
    >
      {/* Type banner */}
      <div className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider ${
        isDelivery
          ? "bg-violet-500/10 text-violet-400"
          : "bg-emerald-500/10 text-emerald-400"
      }`}>
        {isDelivery ? <Truck size={11} /> : <Store size={11} />}
        {isDelivery ? "Envío a domicilio" : "Recoger en sucursal"}
      </div>

      <div className="p-3">
        <div className="flex justify-between items-start mb-1">
          <span className="font-bold text-sm">#{order.orderNumber}</span>
          <span className="text-xs text-on-surface-variant">
            {new Date(order.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        <p className="text-xs font-medium text-on-surface mb-0.5">
          {order.customerName || "Cliente"}
        </p>
        <p className="text-xs text-on-surface-variant mb-2">
          {order.itemCount} producto{order.itemCount > 1 ? "s" : ""} — <span className="font-semibold text-primary">{formatCents(order.total)}</span>
        </p>

        {isPendingTransfer && (
          <div
            className={`mb-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              hasProof
                ? "bg-green-500/15 text-green-400"
                : "bg-amber-500/15 text-amber-400"
            }`}
          >
            <FileCheck2 size={10} />
            {hasProof ? "Comprobante recibido" : "Sin comprobante"}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <span className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-outline-variant/25 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant transition-colors group-hover:border-primary/40 group-hover:text-primary">
            <Eye size={11} />
            Ver detalle
          </span>
          {nextStatus && !isPendingTransfer && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdvance();
              }}
              disabled={advancePending}
              className="flex-[1.6] bg-primary text-on-primary text-[10px] py-1.5 rounded-lg font-semibold uppercase tracking-wider disabled:opacity-50 transition-all hover:brightness-110"
            >
              {ADVANCE_LABEL[colStatus] ?? `→ ${nextStatus}`}
            </button>
          )}
          {isPendingTransfer && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDetail();
              }}
              disabled={!hasProof}
              className="flex-[1.6] bg-green-500 text-white text-[10px] py-1.5 rounded-lg font-semibold uppercase tracking-wider transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:bg-surface-variant disabled:text-on-surface-variant/40"
            >
              {hasProof ? "Verificar y confirmar" : "Esperando…"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
