"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Check,
  ChefHat,
  CheckCircle,
  Clock,
  Home,
  LogOut,
  MapPin,
  Pencil,
  Phone,
  Plus,
  ShoppingBag,
  Star,
  Trash2,
  Truck,
  User,
  X,
  Package,
  Receipt,
  RotateCcw,
  Loader2,
} from "lucide-react";

import { api } from "@/lib/api";
import { getToken, clearTokens } from "@/lib/auth";
import { formatCents } from "@pollon/utils";
import type {
  SavedAddressPublic,
  OrderStatusType,
} from "@pollon/types";
import { useCart } from "@/hooks/useCart";
import { resolveProductImage } from "@/lib/product-images";

/* ═══════════════════════════════════════════════════════════════ */
/*  Local types                                                    */
/* ═══════════════════════════════════════════════════════════════ */

interface CustomerMe {
  id: string;
  phone: string;
  name: string | null;
  address: string | null;
  createdAt: string;
}

interface CustomerOrderSummary {
  id: string;
  orderNumber: number;
  status: OrderStatusType;
  type: "DELIVERY" | "PICKUP";
  total: number;
  itemCount: number;
  createdAt: string;
}

interface CustomerOrdersResponse {
  orders: CustomerOrderSummary[];
  total: number;
  page: number;
  totalPages: number;
}

const STATUS_META: Record<
  OrderStatusType,
  { label: string; icon: React.ReactNode; className: string }
> = {
  PENDING_PAYMENT: { label: "Pago pendiente", icon: <Clock size={12} />, className: "bg-amber-500/15 text-amber-400" },
  SCHEDULED: { label: "Programado", icon: <Clock size={12} />, className: "bg-sky-500/15 text-sky-400" },
  RECEIVED: { label: "Recibido", icon: <CheckCircle size={12} />, className: "bg-blue-500/15 text-blue-400" },
  PREPARING: { label: "Preparando", icon: <ChefHat size={12} />, className: "bg-orange-500/15 text-orange-400" },
  READY: { label: "Listo", icon: <Package size={12} />, className: "bg-green-500/15 text-green-400" },
  ON_THE_WAY: { label: "En camino", icon: <Truck size={12} />, className: "bg-purple-500/15 text-purple-400" },
  DELIVERED: { label: "Entregado", icon: <CheckCircle size={12} />, className: "bg-emerald-500/15 text-emerald-400" },
  CANCELLED: { label: "Cancelado", icon: <X size={12} />, className: "bg-red-500/15 text-red-400" },
};

type Tab = "info" | "addresses" | "orders";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "info", label: "Mi info", icon: <User size={16} /> },
  { id: "addresses", label: "Direcciones", icon: <MapPin size={16} /> },
  { id: "orders", label: "Mis pedidos", icon: <Receipt size={16} /> },
];

/* ═══════════════════════════════════════════════════════════════ */
/*  ProfilePage                                                    */
/* ═══════════════════════════════════════════════════════════════ */

export function ProfilePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("info");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const t = getToken();
    setToken(t);
    if (!t) {
      // Not logged in — send back home
      router.replace("/");
    }
  }, [router]);

  const handleLogout = () => {
    clearTokens();
    router.replace("/");
  };

  if (!mounted || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-surface">
      <div className="pointer-events-none fixed inset-0 z-0 grain" />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-outline-variant/10 bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              aria-label="Volver al inicio"
              className="flex-shrink-0 rounded-xl border border-outline-variant/20 bg-surface-container p-2 text-on-surface-variant transition-all hover:border-primary/40 hover:text-primary"
            >
              <ArrowLeft size={18} />
            </Link>
            <Link href="/" className="flex min-w-0 items-center gap-2.5">
              <div className="h-9 w-9 overflow-hidden rounded-lg border border-primary/20">
                <Image
                  src="/pollon-logo.jpg"
                  alt="Pollón SJR"
                  width={36}
                  height={36}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <h1 className="font-headline text-base font-extrabold leading-tight tracking-tight text-tertiary">
                  Mi cuenta
                </h1>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
                  POLLÓN SJR
                </p>
              </div>
            </Link>
          </div>

          <Link
            href="/menu"
            className="flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 font-headline text-xs font-bold uppercase tracking-wider text-primary transition-all hover:bg-primary/20"
          >
            <ShoppingBag size={14} />
            <span className="hidden sm:inline">Ordenar</span>
          </Link>
        </div>

        {/* Tabs */}
        <div className="mx-auto max-w-3xl px-4 pb-3">
          <nav
            className="scrollbar-hide flex gap-2 overflow-x-auto"
            role="tablist"
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex flex-shrink-0 items-center gap-2 rounded-full border px-4 py-2 font-headline text-xs font-bold uppercase tracking-wider transition-all ${
                    isActive
                      ? "border-primary bg-primary text-on-primary shadow-lg shadow-primary/25"
                      : "border-outline-variant/20 bg-surface-container text-on-surface-variant hover:border-primary/40 hover:text-tertiary"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="relative z-10 mx-auto max-w-3xl px-4 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "info" && (
              <InfoTab token={token} onLogout={handleLogout} />
            )}
            {activeTab === "addresses" && <AddressesTab token={token} />}
            {activeTab === "orders" && <OrdersTab token={token} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  InfoTab — profile info + logout                                */
/* ═══════════════════════════════════════════════════════════════ */

function InfoTab({ token, onLogout }: { token: string; onLogout: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const { data: me, isLoading } = useQuery({
    queryKey: ["customer-me"],
    queryFn: () => api.get<CustomerMe>("/api/customers/me", token),
  });

  useEffect(() => {
    if (me?.name) setNameDraft(me.name);
  }, [me?.name]);

  const updateMut = useMutation({
    mutationFn: (payload: { name?: string }) =>
      api.put<CustomerMe>("/api/customers/me", payload, token),
    onSuccess: (data) => {
      qc.setQueryData(["customer-me"], data);
      setEditing(false);
    },
  });

  if (isLoading || !me) {
    return (
      <div className="space-y-3">
        <div className="h-32 animate-pulse rounded-2xl bg-surface-container" />
        <div className="h-20 animate-pulse rounded-2xl bg-surface-container" />
      </div>
    );
  }

  const initials = (me.name ?? "?")
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const memberSince = new Date(me.createdAt).toLocaleDateString("es-MX", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-4">
      {/* Hero card with avatar + name */}
      <section className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-surface-container-high to-surface-container p-6">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <div className="relative flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-primary-dim font-headline text-3xl font-extrabold text-on-primary shadow-lg shadow-primary/25">
            {initials || <User size={32} />}
          </div>

          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="space-y-2">
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") updateMut.mutate({ name: nameDraft.trim() });
                    if (e.key === "Escape") {
                      setNameDraft(me.name ?? "");
                      setEditing(false);
                    }
                  }}
                  placeholder="Tu nombre"
                  className="w-full rounded-xl border border-primary/40 bg-surface px-3 py-2 font-headline text-lg font-extrabold text-tertiary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => updateMut.mutate({ name: nameDraft.trim() })}
                    disabled={updateMut.isPending || nameDraft.trim().length === 0}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 font-headline text-xs font-bold uppercase tracking-wider text-on-primary disabled:opacity-50"
                  >
                    <Check size={13} />
                    Guardar
                  </button>
                  <button
                    onClick={() => {
                      setNameDraft(me.name ?? "");
                      setEditing(false);
                    }}
                    className="rounded-lg border border-outline-variant/25 px-3 py-1.5 font-headline text-xs font-bold uppercase tracking-wider text-on-surface-variant"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="font-headline text-2xl font-extrabold uppercase tracking-tighter text-tertiary sm:text-3xl">
                  {me.name || "Sin nombre"}
                </h2>
                <div className="mt-1 flex items-center gap-2 text-sm text-on-surface-variant/80">
                  <Phone size={13} />
                  <span className="font-mono">{me.phone}</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11px] font-headline font-bold uppercase tracking-wider text-primary">
                  <Star size={11} />
                  Miembro desde {memberSince}
                </div>
              </>
            )}
          </div>

          {!editing && (
            <button
              onClick={() => setEditing(true)}
              aria-label="Editar nombre"
              className="flex-shrink-0 rounded-xl border border-outline-variant/25 bg-surface-container p-2.5 text-on-surface-variant transition-all hover:border-primary/40 hover:text-primary"
            >
              <Pencil size={15} />
            </button>
          )}
        </div>
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/loyalty"
          className="group flex items-center gap-3 rounded-2xl border border-outline-variant/10 bg-surface-container p-4 transition-all hover:border-secondary/40"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/15 text-secondary">
            <Star size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-headline text-sm font-bold text-tertiary">Mi tarjeta de lealtad</p>
            <p className="text-[11px] text-on-surface-variant/70">5 compras = producto gratis</p>
          </div>
        </Link>

        <Link
          href="/menu"
          className="group flex items-center gap-3 rounded-2xl border border-outline-variant/10 bg-surface-container p-4 transition-all hover:border-primary/40"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShoppingBag size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-headline text-sm font-bold text-tertiary">Hacer un pedido</p>
            <p className="text-[11px] text-on-surface-variant/70">Ver el menú completo</p>
          </div>
        </Link>
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-outline-variant/10 bg-surface-container p-1">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-xl p-4 text-left transition-colors hover:bg-error/10"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-error/15 text-error">
            <LogOut size={18} />
          </div>
          <div className="flex-1">
            <p className="font-headline text-sm font-bold text-error">Cerrar sesión</p>
            <p className="text-[11px] text-on-surface-variant/60">
              Tendrás que volver a iniciar sesión para ordenar.
            </p>
          </div>
        </button>
      </section>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  AddressesTab — list + inline edit + delete                     */
/* ═══════════════════════════════════════════════════════════════ */

function AddressesTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ["customer-addresses"],
    queryFn: () =>
      api.get<SavedAddressPublic[]>("/api/customers/me/addresses", token),
  });

  const patchMut = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: { alias?: string; isDefault?: boolean };
    }) =>
      api.patch<SavedAddressPublic>(
        `/api/customers/me/addresses/${id}`,
        payload,
        token,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-addresses"] });
      setEditingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/customers/me/addresses/${id}`, token),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer-addresses"] });
    },
  });

  const handleDelete = (addr: SavedAddressPublic) => {
    if (confirm(`¿Eliminar la dirección "${addr.alias}"?`)) {
      deleteMut.mutate(addr.id);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl bg-surface-container"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-headline text-xl font-extrabold uppercase tracking-tighter text-tertiary">
            Direcciones guardadas
          </h2>
          <p className="text-xs text-on-surface-variant/70">
            {addresses.length} de 3 · la marcada como favorita se usa por defecto
          </p>
        </div>
      </div>

      {addresses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-outline-variant/25 bg-surface-container/50 px-6 py-12 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <MapPin size={24} />
          </div>
          <h3 className="font-headline text-lg font-bold text-tertiary">
            Aún no tienes direcciones
          </h3>
          <p className="mt-1 max-w-xs text-sm text-on-surface-variant/70">
            Agrega una dirección al hacer tu primer pedido a domicilio — se guardará
            automáticamente.
          </p>
          <Link
            href="/menu"
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 font-headline text-sm font-bold uppercase tracking-wider text-on-primary shadow-lg shadow-primary/25 transition-all hover:brightness-110"
          >
            <ShoppingBag size={15} />
            Ir al menú
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {addresses.map((addr) => {
            const isEditing = editingId === addr.id;
            return (
              <motion.li
                key={addr.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className={`rounded-2xl border bg-surface-container p-4 transition-colors ${
                  addr.isDefault
                    ? "border-primary/40"
                    : "border-outline-variant/10 hover:border-primary/25"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                      addr.isDefault
                        ? "bg-primary/20 text-primary"
                        : "bg-surface-container-high text-on-surface-variant"
                    }`}
                  >
                    {aliasIcon(addr.alias)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={aliasDraft}
                          onChange={(e) => setAliasDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && aliasDraft.trim().length > 0) {
                              patchMut.mutate({
                                id: addr.id,
                                payload: { alias: aliasDraft.trim() },
                              });
                            }
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="flex-1 rounded-lg border border-primary/40 bg-surface px-2 py-1 font-headline text-sm font-bold text-tertiary focus:border-primary focus:outline-none"
                          maxLength={30}
                        />
                      ) : (
                        <h3 className="font-headline text-sm font-bold uppercase tracking-tight text-tertiary">
                          {addr.alias}
                        </h3>
                      )}
                      {addr.isDefault && !isEditing && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-headline font-bold uppercase tracking-wider text-primary">
                          <Star size={9} /> Favorita
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-on-surface-variant/80">
                      {addr.address}
                    </p>

                    {/* Inline actions */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() =>
                              patchMut.mutate({
                                id: addr.id,
                                payload: { alias: aliasDraft.trim() },
                              })
                            }
                            disabled={
                              patchMut.isPending ||
                              aliasDraft.trim().length === 0
                            }
                            className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 font-headline text-[10px] font-bold uppercase tracking-wider text-on-primary disabled:opacity-50"
                          >
                            <Check size={11} />
                            Guardar
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="rounded-lg border border-outline-variant/25 px-2.5 py-1 font-headline text-[10px] font-bold uppercase tracking-wider text-on-surface-variant"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          {!addr.isDefault && (
                            <button
                              onClick={() =>
                                patchMut.mutate({
                                  id: addr.id,
                                  payload: { isDefault: true },
                                })
                              }
                              disabled={patchMut.isPending}
                              className="flex items-center gap-1 rounded-lg border border-outline-variant/25 px-2.5 py-1 font-headline text-[10px] font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
                            >
                              <Star size={11} /> Marcar favorita
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setAliasDraft(addr.alias);
                              setEditingId(addr.id);
                            }}
                            className="flex items-center gap-1 rounded-lg border border-outline-variant/25 px-2.5 py-1 font-headline text-[10px] font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
                          >
                            <Pencil size={10} /> Renombrar
                          </button>
                          <button
                            onClick={() => handleDelete(addr)}
                            disabled={deleteMut.isPending}
                            className="ml-auto flex items-center gap-1 rounded-lg border border-error/30 px-2.5 py-1 font-headline text-[10px] font-bold uppercase tracking-wider text-error transition-colors hover:bg-error/10 disabled:opacity-50"
                          >
                            <Trash2 size={10} /> Eliminar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      {/* Add new hint — full map UX lives in checkout */}
      {addresses.length > 0 && addresses.length < 3 && (
        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-outline-variant/25 bg-surface-container/50 p-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Plus size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-headline text-sm font-bold text-tertiary">
              Agregar una dirección nueva
            </p>
            <p className="mt-0.5 text-[11px] text-on-surface-variant/70">
              Al hacer un pedido a domicilio puedes seleccionarla en el mapa y
              guardarla aquí.
            </p>
            <Link
              href="/menu"
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-3 py-1.5 font-headline text-[11px] font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/25"
            >
              <ShoppingBag size={12} />
              Ir al menú
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function aliasIcon(alias: string) {
  const a = alias.toLowerCase();
  if (a.includes("casa") || a.includes("home")) return <Home size={18} />;
  if (a.includes("ofi") || a.includes("trabajo") || a.includes("work"))
    return <Package size={18} />;
  return <MapPin size={18} />;
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ReorderButton — one-tap reorder from history                   */
/* ═══════════════════════════════════════════════════════════════ */

interface RepeatItem {
  productId: string;
  name: string;
  currentPrice: number;
  qty: number;
  variant: string | null;
  notes: string | null;
  available: boolean;
}

interface RepeatResponse {
  items: RepeatItem[];
  unavailableCount: number;
  warning: string | null;
}

function ReorderButton({ orderId, token }: { orderId: string; token: string }) {
  const { addItem } = useCart();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleReorder = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLoading(true);
    try {
      const res = await api.get<RepeatResponse>(`/api/orders/${orderId}/repeat`, token);
      const available = res.items.filter((i) => i.available);
      available.forEach((item) => {
        addItem({
          productId: item.productId,
          name: item.name,
          price: item.currentPrice,
          qty: item.qty,
          variant: item.variant,
          notes: item.notes ?? "",
          imageUrl: resolveProductImage(item.name, null),
        });
      });
      setDone(true);
      // Redirect to menu so the user sees the cart bar and can checkout
      setTimeout(() => router.push("/menu"), 600);
    } catch {
      // silently ignore — user can retry
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.button
      onClick={handleReorder}
      whileTap={{ scale: 0.9 }}
      disabled={loading}
      aria-label="Repetir pedido"
      className={`flex flex-shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 font-headline text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-60 ${
        done
          ? "border-green-500/40 bg-green-500/15 text-green-400"
          : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
      }`}
    >
      {loading ? (
        <Loader2 size={11} className="animate-spin" />
      ) : done ? (
        <Check size={11} />
      ) : (
        <RotateCcw size={11} />
      )}
      {done ? "Agregado" : "Repetir"}
    </motion.button>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  OrdersTab — paginated order history                            */
/* ═══════════════════════════════════════════════════════════════ */

function OrdersTab({ token }: { token: string }) {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["customer-orders", page],
    queryFn: () =>
      api.get<CustomerOrdersResponse>(
        `/api/customers/me/orders?page=${page}`,
        token,
      ),
    placeholderData: (prev) => prev,
  });

  if (isLoading && !data) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl bg-surface-container"
          />
        ))}
      </div>
    );
  }

  const orders = data?.orders ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-headline text-xl font-extrabold uppercase tracking-tighter text-tertiary">
          Mis pedidos
        </h2>
        <p className="text-xs text-on-surface-variant/70">
          {data?.total ?? 0}{" "}
          {data?.total === 1 ? "pedido en total" : "pedidos en total"}
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-outline-variant/25 bg-surface-container/50 px-6 py-12 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Receipt size={24} />
          </div>
          <h3 className="font-headline text-lg font-bold text-tertiary">
            Aún no tienes pedidos
          </h3>
          <p className="mt-1 max-w-xs text-sm text-on-surface-variant/70">
            Cuando hagas tu primer pedido aparecerá aquí con su estado.
          </p>
          <Link
            href="/menu"
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 font-headline text-sm font-bold uppercase tracking-wider text-on-primary shadow-lg shadow-primary/25 transition-all hover:brightness-110"
          >
            <ShoppingBag size={15} />
            Ver el menú
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {orders.map((order) => {
              const status = STATUS_META[order.status];
              const isActive =
                order.status !== "DELIVERED" && order.status !== "CANCELLED";
              return (
                <motion.li
                  key={order.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Link
                    href={`/order/${order.id}`}
                    className="group flex items-center gap-3 rounded-2xl border border-outline-variant/10 bg-surface-container p-4 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg hover:shadow-black/30"
                  >
                    <div
                      className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${
                        isActive
                          ? "bg-primary/15 text-primary"
                          : "bg-surface-container-high text-on-surface-variant/70"
                      }`}
                    >
                      {order.type === "DELIVERY" ? (
                        <Truck size={20} />
                      ) : (
                        <Package size={20} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-headline text-sm font-bold text-tertiary">
                          Pedido #{order.orderNumber}
                        </h3>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-headline font-bold uppercase tracking-wider ${status.className}`}
                        >
                          {status.icon}
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-on-surface-variant/70">
                        {order.itemCount}{" "}
                        {order.itemCount === 1 ? "producto" : "productos"} ·{" "}
                        {new Date(order.createdAt).toLocaleString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <p className="font-headline text-base font-extrabold text-primary">
                        {formatCents(order.total)}
                      </p>
                      {order.status === "DELIVERED" && (
                        <ReorderButton orderId={order.id} token={token} />
                      )}
                      {order.status !== "DELIVERED" && (
                        <p className="text-[9px] font-headline font-bold uppercase tracking-wider text-on-surface-variant/50 transition-colors group-hover:text-primary">
                          Ver detalle →
                        </p>
                      )}
                    </div>
                  </Link>
                </motion.li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-outline-variant/25 px-3 py-2 font-headline text-xs font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
              >
                ← Anterior
              </button>
              <span className="text-xs text-on-surface-variant/70">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-outline-variant/25 px-3 py-2 font-headline text-xs font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
              >
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
