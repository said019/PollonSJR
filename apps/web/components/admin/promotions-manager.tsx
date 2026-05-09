"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { formatCents } from "@pollon/utils";
import {
  AnimatePresence,
  motion,
} from "framer-motion";
import {
  Calendar,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface Product {
  id: string;
  name: string;
  emoji?: string | null;
  category: string;
  active: boolean;
  soldOut: boolean;
  variants: { label: string; price: number }[] | null;
}

interface PromotionItem {
  id: string;
  productId: string;
  qty: number;
  variant: string | null;
  product: { id: string; name: string; emoji: string | null };
}

interface Promotion {
  id: string;
  name: string;
  description: string | null;
  dayOfWeek: number | null;
  startTime: string | null;
  endTime: string | null;
  code: string | null;
  maxUses: number | null;
  usedCount: number;
  price: number; // cents
  active: boolean;
  createdAt: string;
  items: PromotionItem[];
}

interface PromotionFormItem {
  productId: string;
  qty: number;
  variant: string | null;
}

interface PromotionFormData {
  name: string;
  description: string;
  dayOfWeek: number | null;
  startTime: string;
  endTime: string;
  code: string;
  maxUses: string;
  price: string;
  active: boolean;
  items: PromotionFormItem[];
}

const DAYS: { value: number; short: string; label: string }[] = [
  { value: 1, short: "Lun", label: "Lunes" },
  { value: 2, short: "Mar", label: "Martes" },
  { value: 3, short: "Mié", label: "Miércoles" },
  { value: 4, short: "Jue", label: "Jueves" },
  { value: 5, short: "Vie", label: "Viernes" },
  { value: 6, short: "Sáb", label: "Sábado" },
  { value: 0, short: "Dom", label: "Domingo" },
];

const dayLabel = (d: number | null) =>
  d === null ? "Todos los días" : DAYS.find((x) => x.value === d)?.label ?? "—";

const emptyForm: PromotionFormData = {
  name: "",
  description: "",
  dayOfWeek: null,
  startTime: "",
  endTime: "",
  code: "",
  maxUses: "",
  price: "",
  active: true,
  items: [],
};

export function PromotionsManager() {
  const token = getAdminToken();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: promotions = [], isLoading } = useQuery({
    queryKey: ["admin-promotions"],
    queryFn: () =>
      api.get<Promotion[]>("/api/admin/promotions", token || undefined),
  });

  const { data: products = [] } = useQuery({
    queryKey: ["admin-products"],
    queryFn: () =>
      api.get<Product[]>("/api/admin/products", token || undefined),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/api/admin/promotions/${id}`, { active }, token || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-promotions"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/admin/promotions/${id}`, token || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-promotions"] }),
  });

  const openNew = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (p: Promotion) => {
    setEditing(p);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Promociones</h1>
          <p className="text-sm text-on-surface-variant">
            Crea combos del día y promociones permanentes.
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
        >
          <Plus size={18} /> Nueva promoción
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : promotions.length === 0 ? (
        <EmptyState onCreate={openNew} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {promotions.map((p) => (
            <PromotionCard
              key={p.id}
              promotion={p}
              onToggle={() => toggleMut.mutate({ id: p.id, active: !p.active })}
              onEdit={() => openEdit(p)}
              onDelete={() => {
                if (
                  confirm(
                    `¿Eliminar la promoción "${p.name}"? Esto no se puede deshacer.`
                  )
                ) {
                  deleteMut.mutate(p.id);
                }
              }}
              busy={toggleMut.isPending || deleteMut.isPending}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <PromotionFormDialog
            key={editing?.id ?? "new"}
            promotion={editing}
            products={products}
            onClose={closeForm}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["admin-promotions"] });
              closeForm();
            }}
            token={token}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Empty state ─────────────────────────────────────────── */

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-outline-variant/30 bg-surface-container-high p-10 text-center">
      <Sparkles size={28} className="mx-auto text-primary/60" />
      <h2 className="mt-3 font-headline text-lg font-bold text-tertiary">
        Aún no hay promociones
      </h2>
      <p className="mt-1 text-sm text-on-surface-variant">
        Crea tu primera promoción para mostrarla en el menú del cliente.
      </p>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
      >
        <Plus size={16} /> Nueva promoción
      </button>
    </div>
  );
}

/* ─── Card ────────────────────────────────────────────────── */

function PromotionCard({
  promotion,
  onToggle,
  onEdit,
  onDelete,
  busy,
}: {
  promotion: Promotion;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border bg-surface-container-high p-5 transition-colors ${
        promotion.active
          ? "border-primary/25"
          : "border-outline-variant/20 opacity-70"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-headline text-base font-extrabold text-tertiary">
            {promotion.name}
          </h3>
          {promotion.description && (
            <p className="mt-0.5 line-clamp-2 text-xs text-on-surface-variant">
              {promotion.description}
            </p>
          )}
        </div>
        <span className="font-headline text-lg font-extrabold text-primary">
          {formatCents(promotion.price)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-0.5 font-semibold text-on-surface-variant">
          <Calendar size={11} />
          {dayLabel(promotion.dayOfWeek)}
        </span>
        {(promotion.startTime || promotion.endTime) && (
          <span className="rounded-md bg-surface px-2 py-0.5 font-semibold text-on-surface-variant">
            {promotion.startTime ?? "—"} a {promotion.endTime ?? "—"}
          </span>
        )}
        {promotion.code && (
          <code className="rounded-md bg-primary/10 px-2 py-0.5 font-mono font-bold text-primary">
            {promotion.code}
          </code>
        )}
        {promotion.maxUses != null && (
          <span className="rounded-md bg-surface px-2 py-0.5 font-semibold text-on-surface-variant">
            {promotion.usedCount}/{promotion.maxUses} usos
          </span>
        )}
        {!promotion.active && (
          <span className="rounded-md bg-error/15 px-2 py-0.5 font-bold uppercase tracking-wider text-error">
            Inactiva
          </span>
        )}
      </div>

      <ul className="space-y-1 rounded-xl bg-surface p-3 text-xs">
        {promotion.items.map((it) => (
          <li
            key={it.id}
            className="flex items-center justify-between gap-2 text-on-surface"
          >
            <span className="truncate">
              <span className="font-bold text-primary">{it.qty}×</span>{" "}
              {it.product.emoji ?? "🍗"} {it.product.name}
              {it.variant && (
                <span className="ml-1 text-on-surface-variant">
                  ({it.variant})
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-1.5 pt-1">
        <button
          onClick={onToggle}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/25 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
        >
          {promotion.active ? (
            <ToggleRight size={13} />
          ) : (
            <ToggleLeft size={13} />
          )}
          {promotion.active ? "Activa" : "Inactiva"}
        </button>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/25 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Pencil size={12} />
            Editar
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-outline-variant/25 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:border-error/40 hover:text-error disabled:opacity-50"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Form dialog ─────────────────────────────────────────── */

function PromotionFormDialog({
  promotion,
  products,
  onClose,
  onSaved,
  token,
}: {
  promotion: Promotion | null;
  products: Product[];
  onClose: () => void;
  onSaved: () => void;
  token: string | null;
}) {
  const [form, setForm] = useState<PromotionFormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (promotion) {
      setForm({
        name: promotion.name,
        description: promotion.description ?? "",
        dayOfWeek: promotion.dayOfWeek,
        startTime: promotion.startTime ?? "",
        endTime: promotion.endTime ?? "",
        code: promotion.code ?? "",
        maxUses: promotion.maxUses != null ? String(promotion.maxUses) : "",
        price: (promotion.price / 100).toString(),
        active: promotion.active,
        items: promotion.items.map((it) => ({
          productId: it.productId,
          qty: it.qty,
          variant: it.variant,
        })),
      });
    } else {
      setForm(emptyForm);
    }
  }, [promotion]);

  const activeProducts = useMemo(
    () => products.filter((p) => p.active && !p.soldOut),
    [products]
  );

  const productById = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products]
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const priceCents = Math.round(parseFloat(form.price || "0") * 100);
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        dayOfWeek: form.dayOfWeek,
        startTime: form.startTime.trim() || null,
        endTime: form.endTime.trim() || null,
        code: form.code.trim() ? form.code.trim().toUpperCase() : null,
        maxUses: form.maxUses ? parseInt(form.maxUses, 10) : null,
        price: priceCents,
        active: form.active,
        items: form.items.map((it) => ({
          productId: it.productId,
          qty: it.qty,
          variant: it.variant,
        })),
      };
      if (promotion) {
        return api.patch(
          `/api/admin/promotions/${promotion.id}`,
          payload,
          token || undefined
        );
      }
      return api.post("/api/admin/promotions", payload, token || undefined);
    },
    onSuccess: onSaved,
    onError: (err: any) => setError(err.message || "Error al guardar"),
  });

  const validate = (): string | null => {
    if (!form.name.trim()) return "Ponle un nombre a la promoción";
    if (!form.price || isNaN(parseFloat(form.price)) || parseFloat(form.price) < 0)
      return "Ingresa un precio válido";
    if (form.items.length === 0)
      return "Agrega al menos un producto a la promoción";
    if (form.items.some((it) => !it.productId || it.qty < 1))
      return "Revisa que cada producto tenga cantidad válida";
    return null;
  };

  const handleSave = () => {
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    saveMut.mutate();
  };

  const addItem = () => {
    const first = activeProducts[0];
    if (!first) return;
    setForm((f) => ({
      ...f,
      items: [...f.items, { productId: first.id, qty: 1, variant: null }],
    }));
  };

  const updateItem = (idx: number, patch: Partial<PromotionFormItem>) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  };

  const removeItem = (idx: number) =>
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black"
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-label={promotion ? "Editar promoción" : "Nueva promoción"}
        initial={{ y: "5%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "5%", opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 240 }}
        className="fixed inset-x-0 top-[5%] z-50 mx-auto flex max-h-[90vh] w-[min(92vw,640px)] flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-outline-variant/15 px-5 py-4">
          <div>
            <span className="font-headline text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              {promotion ? "Editando" : "Nueva"}
            </span>
            <h2 className="font-headline text-lg font-extrabold text-tertiary">
              {promotion ? promotion.name : "Crear promoción"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg border border-outline-variant/20 p-2 text-on-surface-variant hover:bg-surface-variant hover:text-tertiary"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* Name */}
          <Field label="Nombre">
            <input
              type="text"
              maxLength={80}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Combo Pareja"
              className={inputCls}
            />
          </Field>

          {/* Description */}
          <Field label="Descripción (opcional)">
            <textarea
              maxLength={280}
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Lo que ven los clientes en el menú."
              className={inputCls}
            />
          </Field>

          {/* Day */}
          <Field label="Disponible">
            <div className="flex flex-wrap gap-2">
              <DayPill
                active={form.dayOfWeek === null}
                onClick={() => setForm({ ...form, dayOfWeek: null })}
              >
                Todos los días
              </DayPill>
              {DAYS.map((d) => (
                <DayPill
                  key={d.value}
                  active={form.dayOfWeek === d.value}
                  onClick={() => setForm({ ...form, dayOfWeek: d.value })}
                >
                  {d.short}
                </DayPill>
              ))}
            </div>
          </Field>

          {/* Time window */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hora inicio (opcional)">
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className={inputCls + " [color-scheme:dark]"}
              />
            </Field>
            <Field label="Hora fin (opcional)">
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className={inputCls + " [color-scheme:dark]"}
              />
            </Field>
          </div>

          {/* Code + Max uses */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código (opcional)">
              <input
                type="text"
                maxLength={30}
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase() })
                }
                placeholder="COMBO2X1"
                className={inputCls}
              />
            </Field>
            <Field label="Usos máx (opcional)">
              <input
                type="number"
                min={1}
                value={form.maxUses}
                onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                placeholder="50"
                className={inputCls}
              />
            </Field>
          </div>

          {/* Price */}
          <Field label="Precio (MXN)">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-on-surface-variant/60">
                $
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="135"
                className={`${inputCls} pl-7`}
              />
            </div>
          </Field>

          {/* Active */}
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-outline-variant/20 bg-surface p-3">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) =>
                setForm({ ...form, active: e.target.checked })
              }
              className="h-4 w-4 accent-primary"
            />
            <div>
              <p className="text-sm font-medium text-on-surface">
                Activa para los clientes
              </p>
              <p className="text-[11px] text-on-surface-variant">
                Si la apagas, sigue guardada pero no aparece en el menú.
              </p>
            </div>
          </label>

          {/* Items */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="font-headline text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
                Productos incluidos
              </label>
              <button
                type="button"
                onClick={addItem}
                disabled={activeProducts.length === 0}
                className="inline-flex items-center gap-1 rounded-lg bg-primary/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary disabled:opacity-50"
              >
                <Plus size={12} /> Agregar
              </button>
            </div>

            {form.items.length === 0 && (
              <p className="rounded-lg border border-dashed border-outline-variant/30 p-4 text-center text-xs text-on-surface-variant">
                Agrega los productos que componen la promoción.
              </p>
            )}

            <div className="space-y-2">
              {form.items.map((it, idx) => {
                const product = productById[it.productId];
                const variants = product?.variants ?? [];
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-[2.4rem_1fr_auto] items-center gap-2 rounded-xl border border-outline-variant/15 bg-surface p-2.5"
                  >
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={it.qty}
                      onChange={(e) =>
                        updateItem(idx, {
                          qty: Math.max(1, parseInt(e.target.value || "1", 10)),
                        })
                      }
                      className="w-10 rounded-md border border-outline-variant/25 bg-surface-container px-2 py-1.5 text-center text-sm text-on-surface"
                    />
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                      <select
                        value={it.productId}
                        onChange={(e) =>
                          updateItem(idx, {
                            productId: e.target.value,
                            variant: null,
                          })
                        }
                        className={`${selectCls} flex-1`}
                      >
                        {activeProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.emoji ?? "🍗"} {p.name}
                          </option>
                        ))}
                      </select>
                      {variants && variants.length > 0 && (
                        <select
                          value={it.variant ?? ""}
                          onChange={(e) =>
                            updateItem(idx, {
                              variant: e.target.value || null,
                            })
                          }
                          className={`${selectCls} sm:w-32`}
                        >
                          <option value="">Sin variante</option>
                          {variants.map((v) => (
                            <option key={v.label} value={v.label}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      aria-label="Eliminar"
                      className="rounded-md p-1.5 text-on-surface-variant hover:bg-error/10 hover:text-error"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-outline-variant/15 bg-surface-container-high/40 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-outline-variant/25 px-4 py-2 text-sm font-semibold text-on-surface-variant"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saveMut.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {saveMut.isPending && <Loader2 size={14} className="animate-spin" />}
            {promotion ? "Guardar cambios" : "Crear promoción"}
          </button>
        </div>
      </motion.div>
    </>
  );
}

const inputCls =
  "w-full rounded-xl border border-outline-variant/25 bg-surface-container-high p-3 text-sm text-on-surface outline-none transition-colors focus:border-primary/60";

const selectCls =
  "rounded-md border border-outline-variant/25 bg-surface-container px-2 py-1.5 text-sm text-on-surface outline-none focus:border-primary/60";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block font-headline text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
        {label}
      </label>
      {children}
    </div>
  );
}

function DayPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
        active
          ? "border-primary bg-primary text-on-primary"
          : "border-outline-variant/40 bg-surface-container text-on-surface-variant hover:border-primary/40"
      }`}
    >
      {children}
    </button>
  );
}
