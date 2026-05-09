"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { useSocket } from "@/hooks/useSocket";
import type { OrderSummary, OrderStatusType } from "@pollon/types";
import { formatCents } from "@pollon/utils";
import {
  Clock,
  ChefHat,
  Package,
  Truck,
  Eye,
  Store,
  Landmark,
  FileCheck2,
  Pause,
  Play,
  MessageCircle,
  CalendarClock,
  Pencil,
  Check,
  X,
  AlertTriangle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ConnectionStatus } from "./connection-status";
import { OrderDetailModal } from "./order-detail-modal";

const COLUMNS: { status: OrderStatusType; label: string; icon: React.ReactNode; color: string }[] = [
  { status: "SCHEDULED", label: "Programados", icon: <CalendarClock size={18} />, color: "border-sky-400" },
  { status: "PENDING_PAYMENT", label: "Por confirmar", icon: <Landmark size={18} />, color: "border-amber-400" },
  { status: "RECEIVED", label: "Recibidos", icon: <Clock size={18} />, color: "border-blue-400" },
  { status: "PREPARING", label: "Preparando", icon: <ChefHat size={18} />, color: "border-orange-400" },
  { status: "READY", label: "Listos", icon: <Package size={18} />, color: "border-green-400" },
  { status: "ON_THE_WAY", label: "En camino", icon: <Truck size={18} />, color: "border-purple-400" },
];

type OrderType = "DELIVERY" | "PICKUP";

function nextStatusFor(
  current: OrderStatusType,
  type: OrderType
): OrderStatusType | null {
  switch (current) {
    case "SCHEDULED":
      return "RECEIVED";
    case "RECEIVED":
      return "PREPARING";
    case "PREPARING":
      return "READY";
    case "READY":
      return type === "DELIVERY" ? "ON_THE_WAY" : "DELIVERED";
    case "ON_THE_WAY":
      return "DELIVERED";
    default:
      return null;
  }
}

function advanceLabelFor(current: OrderStatusType, type: OrderType): string {
  switch (current) {
    case "SCHEDULED":
      return "Activar 🟢";
    case "RECEIVED":
      return "Preparar 🔥";
    case "PREPARING":
      return "Marcar Listo ✓";
    case "READY":
      return type === "DELIVERY" ? "Despachar 🛵" : "Entregado ✓";
    case "ON_THE_WAY":
      return "Finalizar ✓";
    default:
      return "";
  }
}

type TypeFilter = "ALL" | "DELIVERY" | "PICKUP";

interface QuickProduct {
  id: string;
  name: string;
  emoji: string | null;
  soldOut: boolean;
  category: string;
}

interface StoreState {
  isOpen: boolean;
  acceptOrders: boolean;
  deliveryActive: boolean;
}

const QUICK_NAMES = ["bisquet", "pure", "puré", "sopa", "ensalada"];

export function OrdersKanban() {
  const adminToken = getAdminToken();
  const qc = useQueryClient();
  const socketAuth = { token: adminToken || undefined, role: "admin" as const };
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [search, setSearch] = useState("");

  const { data: orders = [] } = useQuery({
    queryKey: ["admin-active-orders"],
    queryFn: () => api.get<OrderSummary[]>("/api/admin/orders", adminToken || undefined),
    refetchInterval: 15000,
  });

  const { data: store } = useQuery({
    queryKey: ["admin-store-config"],
    queryFn: () => api.get<StoreState>("/api/admin/store", adminToken || undefined),
  });

  const { data: products = [] } = useQuery({
    queryKey: ["admin-products"],
    queryFn: () => api.get<QuickProduct[]>("/api/admin/products", adminToken || undefined),
  });

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

  const pauseMut = useMutation({
    mutationFn: () => api.patch("/api/admin/store/pause", {}, adminToken || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-store-config"] }),
  });

  const productSoldOutMut = useMutation({
    mutationFn: ({ id, soldOut }: { id: string; soldOut: boolean }) =>
      api.patch(`/api/admin/products/${id}`, { soldOut }, adminToken || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-products"] }),
  });

  const etaMut = useMutation({
    mutationFn: ({ orderId, eta }: { orderId: string; eta: number | null }) =>
      api.patch(
        `/api/admin/orders/${orderId}/eta`,
        { estimatedMinutes: eta },
        adminToken || undefined
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-active-orders"] }),
  });

  const advance = useCallback(
    (orderId: string, currentStatus: OrderStatusType, type: OrderType) => {
      const next = nextStatusFor(currentStatus, type);
      if (next) advanceMut.mutate({ orderId, status: next });
    },
    [advanceMut]
  );

  const deliveryCount = orders.filter((o) => o.type === "DELIVERY").length;
  const pickupCount = orders.filter((o) => o.type === "PICKUP").length;

  const filtered = orders
    .filter((o) => (typeFilter === "ALL" ? true : o.type === typeFilter))
    .filter((o) =>
      search.trim()
        ? String(o.orderNumber).includes(search.trim().replace(/^#/, "")) ||
          (o.customerName ?? "").toLowerCase().includes(search.trim().toLowerCase())
        : true
    );

  const quickProducts = products
    .filter((p) =>
      QUICK_NAMES.some((n) => p.name.toLowerCase().includes(n))
    )
    .slice(0, 4);

  const acceptingOrders = store?.acceptOrders ?? true;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Pedidos Activos</h1>
          <ConnectionStatus connected={connected} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar #pedido o cliente"
            className="rounded-lg border border-outline-variant/30 bg-surface-container-high px-3 py-1.5 text-sm text-on-surface outline-none focus:border-primary/60"
          />
          <button
            onClick={() => pauseMut.mutate()}
            disabled={pauseMut.isPending}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50 ${
              acceptingOrders
                ? "border-amber-500/50 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                : "border-emerald-500/50 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
            }`}
          >
            {acceptingOrders ? <Pause size={13} /> : <Play size={13} />}
            {acceptingOrders ? "Pausar pedidos" : "Reanudar"}
          </button>
        </div>
      </div>

      {!acceptingOrders && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-500">
          <AlertTriangle size={16} />
          <span>
            <strong>Pedidos pausados.</strong> Los clientes ven el menú pero no pueden pagar.
          </span>
        </div>
      )}

      {/* Quick sold-out toggles */}
      {quickProducts.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-high p-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            Marcar agotado
          </span>
          {quickProducts.map((p) => (
            <button
              key={p.id}
              onClick={() =>
                productSoldOutMut.mutate({ id: p.id, soldOut: !p.soldOut })
              }
              disabled={productSoldOutMut.isPending}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all disabled:opacity-50 ${
                p.soldOut
                  ? "border-error/50 bg-error/10 text-error"
                  : "border-outline-variant/30 bg-surface-container text-on-surface-variant hover:border-primary/40"
              }`}
            >
              <span>{p.emoji ?? "🍽️"}</span>
              <span>{p.name}</span>
              {p.soldOut && <span className="text-[10px]">AGOTADO</span>}
            </button>
          ))}
        </div>
      )}

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {COLUMNS.map((col) => {
          const colOrders = filtered.filter((o) => o.status === col.status);
          // Hide SCHEDULED column entirely if empty (saves screen space when not in use)
          if (col.status === "SCHEDULED" && colOrders.length === 0) return null;
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
                    onAdvance={() => advance(order.id, col.status, order.type as OrderType)}
                    onSetEta={(eta) =>
                      etaMut.mutate({ orderId: order.id, eta })
                    }
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

function OrderCard({
  order,
  colStatus,
  onDetail,
  onAdvance,
  onSetEta,
  advancePending,
}: {
  order: OrderSummary;
  colStatus: OrderStatusType;
  onDetail: () => void;
  onAdvance: () => void;
  onSetEta: (eta: number | null) => void;
  advancePending: boolean;
}) {
  const isDelivery = order.type === "DELIVERY";
  const orderType = (order.type as OrderType) ?? "PICKUP";
  const nextStatus = nextStatusFor(colStatus, orderType);
  const advanceLabel = advanceLabelFor(colStatus, orderType);
  const isPendingTransfer =
    colStatus === "PENDING_PAYMENT" && order.paymentMethod === "TRANSFER";
  const hasProof = !!order.transferProofUrl;
  const isScheduled = colStatus === "SCHEDULED";
  const showEta = ["RECEIVED", "PREPARING", "READY"].includes(colStatus);

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
          {order.itemCount} producto{order.itemCount > 1 ? "s" : ""} —{" "}
          <span className="font-semibold text-primary">{formatCents(order.total)}</span>
        </p>

        {/* Scheduled badge with scheduled time + remaining */}
        {isScheduled && order.scheduledFor && (
          <div className="mb-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[10px] text-sky-400">
            <div className="flex items-center gap-1 font-bold uppercase tracking-wider">
              <CalendarClock size={11} />
              Para{" "}
              {new Date(order.scheduledFor).toLocaleString("es-MX", {
                weekday: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            {order.remainingAmount != null && order.remainingAmount > 0 && (
              <div className="mt-0.5 font-semibold normal-case tracking-normal text-on-surface">
                Resta por cobrar:{" "}
                <span className="text-tertiary">{formatCents(order.remainingAmount)}</span>
              </div>
            )}
          </div>
        )}

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

        {showEta && (
          <div onClick={(e) => e.stopPropagation()} className="mb-2">
            <EtaInline
              eta={order.estimatedMinutes ?? null}
              onSave={onSetEta}
            />
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <span className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-outline-variant/25 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant transition-colors group-hover:border-primary/40 group-hover:text-primary">
            <Eye size={11} />
            Ver
          </span>
          <a
            href={`https://wa.me/${(order.customerPhone || "").replace(/\D/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label="Abrir WhatsApp"
            className="inline-flex items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2 text-emerald-500 transition-colors hover:bg-emerald-500/20"
          >
            <MessageCircle size={13} />
          </a>
          {nextStatus && !isPendingTransfer && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdvance();
              }}
              disabled={advancePending}
              className="flex-[1.6] bg-primary text-on-primary text-[10px] py-1.5 rounded-lg font-semibold uppercase tracking-wider disabled:opacity-50 transition-all hover:brightness-110"
            >
              {advanceLabel || `→ ${nextStatus}`}
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

function EtaInline({
  eta,
  onSave,
}: {
  eta: number | null;
  onSave: (eta: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string>(eta != null ? String(eta) : "");

  useEffect(() => {
    setValue(eta != null ? String(eta) : "");
  }, [eta]);

  const commit = () => {
    const n = parseInt(value, 10);
    if (isNaN(n) || n <= 0) {
      onSave(null);
    } else {
      onSave(Math.min(240, n));
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          type="number"
          min={1}
          max={240}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-16 rounded-md border border-primary/40 bg-surface px-2 py-0.5 text-xs"
        />
        <span className="text-[10px] text-on-surface-variant">min</span>
        <button
          onClick={commit}
          aria-label="Guardar ETA"
          className="rounded p-0.5 text-emerald-500 hover:bg-emerald-500/10"
        >
          <Check size={12} />
        </button>
        <button
          onClick={() => setEditing(false)}
          aria-label="Cancelar"
          className="rounded p-0.5 text-on-surface-variant hover:bg-surface-variant"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="inline-flex items-center gap-1 rounded-md border border-outline-variant/25 bg-surface px-2 py-0.5 text-[10px] font-semibold text-on-surface-variant hover:border-primary/40 hover:text-primary"
    >
      <Clock size={10} />
      {eta != null ? `${eta} min` : "Estimar tiempo"}
      <Pencil size={9} className="opacity-60" />
    </button>
  );
}
