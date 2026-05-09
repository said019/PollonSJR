"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { formatCents } from "@pollon/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarOff,
  CheckCircle2,
  Copy,
  Loader2,
  Pencil,
  Percent,
  Plus,
  Tag,
  Ticket,
  Trash2,
  X,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useEffect, useState } from "react";

type CouponType = "PERCENT" | "FIXED";

interface Coupon {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minOrderAmount: number | null;
  maxUses: number | null;
  usedCount: number;
  firstOrderOnly: boolean;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
  _count?: { orders: number };
}

interface CouponFormData {
  code: string;
  type: CouponType;
  value: string;
  minOrderAmount: string;
  maxUses: string;
  firstOrderOnly: boolean;
  expiresAt: string;
  active: boolean;
}

const emptyForm: CouponFormData = {
  code: "",
  type: "PERCENT",
  value: "",
  minOrderAmount: "",
  maxUses: "",
  firstOrderOnly: false,
  expiresAt: "",
  active: true,
};

export function CouponsManager() {
  const token = getAdminToken();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "expired">("all");

  const { data: coupons = [], isLoading } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: () => api.get<Coupon[]>("/api/admin/coupons", token || undefined),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/api/admin/coupons/${id}`, { active }, token || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-coupons"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/admin/coupons/${id}`, token || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-coupons"] }),
    onError: (err: any) => alert(err.message || "Error al eliminar"),
  });

  const filtered = coupons.filter((c) => {
    const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
    if (filter === "active") return c.active && !expired;
    if (filter === "inactive") return !c.active;
    if (filter === "expired") return !!expired;
    return true;
  });

  const stats = {
    total: coupons.length,
    active: coupons.filter((c) => c.active).length,
    redemptions: coupons.reduce((acc, c) => acc + c.usedCount, 0),
  };

  const openNew = () => {
    setEditing(null);
    setShowForm(true);
  };
  const openEdit = (c: Coupon) => {
    setEditing(c);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cupones</h1>
          <p className="text-sm text-on-surface-variant">
            Crea códigos de descuento para campañas y clientes específicos.
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
        >
          <Plus size={18} /> Nuevo cupón
        </button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard icon={<Ticket size={16} />} label="Cupones" value={stats.total.toString()} />
        <StatCard icon={<CheckCircle2 size={16} />} label="Activos" value={stats.active.toString()} />
        <StatCard icon={<Tag size={16} />} label="Canjes totales" value={stats.redemptions.toString()} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["all", "active", "inactive", "expired"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${
              filter === f
                ? "border-primary bg-primary text-on-primary"
                : "border-outline-variant/40 bg-surface-container text-on-surface-variant hover:border-primary/40"
            }`}
          >
            {f === "all" ? "Todos" : f === "active" ? "Activos" : f === "inactive" ? "Inactivos" : "Expirados"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState onCreate={openNew} hasCoupons={coupons.length > 0} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <CouponCard
              key={c.id}
              coupon={c}
              onToggle={() => toggleMut.mutate({ id: c.id, active: !c.active })}
              onEdit={() => openEdit(c)}
              onDelete={() => {
                const refs = c._count?.orders ?? 0;
                if (refs > 0) {
                  if (
                    confirm(
                      `Este cupón ya tiene ${refs} pedidos asociados. No se puede eliminar pero sí desactivar. ¿Desactivarlo?`
                    )
                  ) {
                    toggleMut.mutate({ id: c.id, active: false });
                  }
                  return;
                }
                if (confirm(`¿Eliminar el cupón "${c.code}"?`)) {
                  deleteMut.mutate(c.id);
                }
              }}
              busy={toggleMut.isPending || deleteMut.isPending}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <CouponFormDialog
            key={editing?.id ?? "new"}
            coupon={editing}
            onClose={closeForm}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["admin-coupons"] });
              closeForm();
            }}
            token={token}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container-high p-4">
      <div className="flex items-center gap-2 text-on-surface-variant">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-1 text-2xl font-extrabold text-tertiary">{value}</p>
    </div>
  );
}

function EmptyState({ onCreate, hasCoupons }: { onCreate: () => void; hasCoupons: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-outline-variant/30 bg-surface-container-high p-10 text-center">
      <Ticket size={28} className="mx-auto text-primary/60" />
      <h2 className="mt-3 font-headline text-lg font-bold text-tertiary">
        {hasCoupons ? "Sin resultados" : "Aún no tienes cupones"}
      </h2>
      <p className="mt-1 text-sm text-on-surface-variant">
        {hasCoupons
          ? "Cambia el filtro o crea un nuevo cupón."
          : "Crea tu primer cupón para regalar descuentos."}
      </p>
      <button
        onClick={onCreate}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
      >
        <Plus size={16} /> Nuevo cupón
      </button>
    </div>
  );
}

function CouponCard({
  coupon,
  onToggle,
  onEdit,
  onDelete,
  busy,
}: {
  coupon: Coupon;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const expired = coupon.expiresAt && new Date(coupon.expiresAt) < new Date();
  const exhausted = coupon.maxUses != null && coupon.usedCount >= coupon.maxUses;

  const valueLabel =
    coupon.type === "PERCENT"
      ? `${coupon.value}% off`
      : `${formatCents(coupon.value)} off`;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(coupon.code);
    } catch {}
  };

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border bg-surface-container-high p-5 transition-colors ${
        coupon.active && !expired && !exhausted
          ? "border-primary/25"
          : "border-outline-variant/20 opacity-70"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code className="rounded-md bg-primary/10 px-2 py-1 font-mono text-sm font-bold text-primary">
              {coupon.code}
            </code>
            <button
              onClick={copyCode}
              aria-label="Copiar código"
              className="rounded-md p-1 text-on-surface-variant hover:bg-surface-variant hover:text-tertiary"
            >
              <Copy size={12} />
            </button>
          </div>
          <p className="mt-1 font-headline text-lg font-extrabold text-tertiary">
            {valueLabel}
          </p>
        </div>
        <div className="text-right">
          {coupon.type === "PERCENT" ? (
            <Percent size={18} className="ml-auto text-primary/70" />
          ) : (
            <Tag size={18} className="ml-auto text-primary/70" />
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {coupon.minOrderAmount != null && (
          <span className="rounded-md bg-surface px-2 py-0.5 font-semibold text-on-surface-variant">
            Mín. {formatCents(coupon.minOrderAmount)}
          </span>
        )}
        {coupon.firstOrderOnly && (
          <span className="rounded-md bg-tertiary/15 px-2 py-0.5 font-bold uppercase tracking-wider text-tertiary">
            Primer pedido
          </span>
        )}
        {expired && (
          <span className="inline-flex items-center gap-1 rounded-md bg-error/15 px-2 py-0.5 font-bold uppercase tracking-wider text-error">
            <CalendarOff size={11} /> Expirado
          </span>
        )}
        {exhausted && !expired && (
          <span className="rounded-md bg-error/15 px-2 py-0.5 font-bold uppercase tracking-wider text-error">
            Agotado
          </span>
        )}
        {!coupon.active && (
          <span className="rounded-md bg-error/10 px-2 py-0.5 font-bold uppercase tracking-wider text-error">
            Inactivo
          </span>
        )}
      </div>

      <div className="rounded-xl bg-surface p-3 text-xs">
        <div className="flex justify-between">
          <span className="text-on-surface-variant">Usos</span>
          <span className="font-bold text-on-surface">
            {coupon.usedCount}
            {coupon.maxUses != null ? ` / ${coupon.maxUses}` : ""}
          </span>
        </div>
        {coupon.expiresAt && (
          <div className="mt-1 flex justify-between">
            <span className="text-on-surface-variant">Vence</span>
            <span className="font-bold text-on-surface">
              {new Date(coupon.expiresAt).toLocaleDateString("es-MX", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-1.5 pt-1">
        <button
          onClick={onToggle}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/25 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
        >
          {coupon.active ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
          {coupon.active ? "Activo" : "Inactivo"}
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

function CouponFormDialog({
  coupon,
  onClose,
  onSaved,
  token,
}: {
  coupon: Coupon | null;
  onClose: () => void;
  onSaved: () => void;
  token: string | null;
}) {
  const [form, setForm] = useState<CouponFormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (coupon) {
      setForm({
        code: coupon.code,
        type: coupon.type,
        value:
          coupon.type === "PERCENT"
            ? coupon.value.toString()
            : (coupon.value / 100).toString(),
        minOrderAmount:
          coupon.minOrderAmount != null
            ? (coupon.minOrderAmount / 100).toString()
            : "",
        maxUses: coupon.maxUses != null ? coupon.maxUses.toString() : "",
        firstOrderOnly: coupon.firstOrderOnly,
        expiresAt: coupon.expiresAt ? coupon.expiresAt.split("T")[0] : "",
        active: coupon.active,
      });
    } else {
      setForm(emptyForm);
    }
  }, [coupon]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const value =
        form.type === "PERCENT"
          ? parseInt(form.value, 10)
          : Math.round(parseFloat(form.value) * 100);
      const payload: Record<string, unknown> = {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value,
        firstOrderOnly: form.firstOrderOnly,
        active: form.active,
        minOrderAmount: form.minOrderAmount
          ? Math.round(parseFloat(form.minOrderAmount) * 100)
          : null,
        maxUses: form.maxUses ? parseInt(form.maxUses, 10) : null,
        expiresAt: form.expiresAt || null,
      };
      if (coupon) {
        return api.patch(`/api/admin/coupons/${coupon.id}`, payload, token || undefined);
      }
      // Create endpoint doesn't accept null for optional fields, strip them
      const createPayload: Record<string, unknown> = { ...payload };
      Object.keys(createPayload).forEach((k) => {
        if (createPayload[k] === null) delete createPayload[k];
      });
      return api.post("/api/admin/coupons", createPayload, token || undefined);
    },
    onSuccess: onSaved,
    onError: (err: any) => setError(err.message || "Error al guardar"),
  });

  const validate = (): string | null => {
    const code = form.code.trim();
    if (!code) return "Ingresa un código";
    if (!/^[A-Z0-9_-]+$/i.test(code))
      return "El código solo admite letras, números, _ y -";
    if (!form.value || isNaN(parseFloat(form.value)))
      return "Ingresa un valor para el descuento";
    const numericValue = parseFloat(form.value);
    if (form.type === "PERCENT" && (numericValue < 1 || numericValue > 100))
      return "El porcentaje debe estar entre 1 y 100";
    if (form.type === "FIXED" && numericValue < 1)
      return "El monto fijo debe ser mayor a 0";
    if (form.maxUses && parseInt(form.maxUses, 10) < 1)
      return "Los usos máximos deben ser al menos 1";
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
        aria-label={coupon ? "Editar cupón" : "Nuevo cupón"}
        initial={{ y: "5%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "5%", opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 240 }}
        className="fixed inset-x-0 top-[5%] z-50 mx-auto flex max-h-[90vh] w-[min(92vw,560px)] flex-col overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-outline-variant/15 px-5 py-4">
          <div>
            <span className="font-headline text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              {coupon ? "Editando" : "Nuevo"}
            </span>
            <h2 className="font-headline text-lg font-extrabold text-tertiary">
              {coupon ? coupon.code : "Crear cupón"}
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
          <Field label="Código">
            <input
              type="text"
              maxLength={30}
              value={form.code}
              onChange={(e) =>
                setForm({ ...form, code: e.target.value.toUpperCase() })
              }
              placeholder="POLLON10"
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-on-surface-variant">
              Lo que escribe el cliente al pagar. Sin espacios.
            </p>
          </Field>

          <Field label="Tipo de descuento">
            <div className="grid grid-cols-2 gap-2">
              <TypePill
                active={form.type === "PERCENT"}
                onClick={() => setForm({ ...form, type: "PERCENT", value: "" })}
                icon={<Percent size={14} />}
                label="Porcentaje"
                hint="Ej. 10% off"
              />
              <TypePill
                active={form.type === "FIXED"}
                onClick={() => setForm({ ...form, type: "FIXED", value: "" })}
                icon={<Tag size={14} />}
                label="Monto fijo"
                hint="Ej. $50 off"
              />
            </div>
          </Field>

          <Field
            label={form.type === "PERCENT" ? "Porcentaje (%)" : "Monto (MXN)"}
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-on-surface-variant/60">
                {form.type === "PERCENT" ? "%" : "$"}
              </span>
              <input
                type="number"
                min="0"
                step={form.type === "PERCENT" ? "1" : "0.01"}
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder={form.type === "PERCENT" ? "10" : "50"}
                className={`${inputCls} pl-7`}
              />
            </div>
          </Field>

          <Field label="Monto mínimo del pedido (opcional)">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-on-surface-variant/60">
                $
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.minOrderAmount}
                onChange={(e) =>
                  setForm({ ...form, minOrderAmount: e.target.value })
                }
                placeholder="200"
                className={`${inputCls} pl-7`}
              />
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Usos máximos (opcional)">
              <input
                type="number"
                min="1"
                value={form.maxUses}
                onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
                placeholder="100"
                className={inputCls}
              />
            </Field>

            <Field label="Vence el (opcional)">
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) =>
                  setForm({ ...form, expiresAt: e.target.value })
                }
                className={inputCls}
              />
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-outline-variant/20 bg-surface p-3">
            <input
              type="checkbox"
              checked={form.firstOrderOnly}
              onChange={(e) =>
                setForm({ ...form, firstOrderOnly: e.target.checked })
              }
              className="h-4 w-4 accent-primary"
            />
            <div>
              <p className="text-sm font-medium text-on-surface">
                Solo primer pedido del cliente
              </p>
              <p className="text-[11px] text-on-surface-variant">
                Útil para campañas de adquisición.
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-outline-variant/20 bg-surface p-3">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 accent-primary"
            />
            <div>
              <p className="text-sm font-medium text-on-surface">Activo</p>
              <p className="text-[11px] text-on-surface-variant">
                Si lo apagas, el cupón deja de funcionar al instante.
              </p>
            </div>
          </label>

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
            {coupon ? "Guardar cambios" : "Crear cupón"}
          </button>
        </div>
      </motion.div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block font-headline text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
        {label}
      </label>
      {children}
    </div>
  );
}

function TypePill({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-3 text-left transition-all ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-outline-variant/30 bg-surface-container text-on-surface-variant hover:border-primary/40"
      }`}
    >
      <div className="flex items-center gap-2 text-sm font-bold">
        {icon}
        {label}
      </div>
      <p className="mt-0.5 text-[11px] opacity-80">{hint}</p>
    </button>
  );
}

const inputCls =
  "w-full rounded-xl border border-outline-variant/25 bg-surface-container-high p-3 text-sm text-on-surface outline-none transition-colors focus:border-primary/60";
