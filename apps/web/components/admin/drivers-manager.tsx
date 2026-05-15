"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import type { DriverPublic } from "@pollon/types";
import {
  Bike,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Power,
  Phone,
  Mail,
  MapPin,
  Circle,
  CheckCircle2,
} from "lucide-react";
import { LiveDriversMap } from "./live-drivers-map";

export function DriversManager() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<DriverPublic | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ["admin-drivers"],
    queryFn: () =>
      api.get<DriverPublic[]>("/api/admin/drivers", getAdminToken() || undefined),
    refetchInterval: 15_000,
  });

  const removeMut = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/admin/drivers/${id}`, getAdminToken() || undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-drivers"] }),
  });

  return (
    <div className="p-4 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-headline text-2xl font-extrabold uppercase tracking-tight text-primary">
            Repartidores
          </h1>
          <p className="text-sm text-on-surface-variant">
            Da de alta y administra a tu equipo de entrega.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-headline text-sm font-bold uppercase tracking-wider text-on-primary shadow-lg shadow-primary/25 transition-all active:scale-[0.98]"
        >
          <Plus size={15} />
          Nuevo repartidor
        </button>
      </div>

      <div className="mb-5">
        <LiveDriversMap />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : drivers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant/40 bg-surface-container p-10 text-center">
          <Bike size={32} className="mx-auto mb-3 text-on-surface-variant/40" />
          <h3 className="font-headline text-base font-bold text-tertiary">
            Aún no tienes repartidores
          </h3>
          <p className="mt-1 text-sm text-on-surface-variant">
            Crea el primero para empezar a asignarles pedidos.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {drivers.map((d) => (
            <DriverCard
              key={d.id}
              driver={d}
              onEdit={() => setEditing(d)}
              onDelete={() => {
                if (
                  confirm(
                    `¿Eliminar a ${d.name}? Si ya tiene pedidos, se desactivará en lugar de borrar.`
                  )
                ) {
                  removeMut.mutate(d.id);
                }
              }}
            />
          ))}
        </div>
      )}

      {(creating || editing) && (
        <DriverFormModal
          driver={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["admin-drivers"] });
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function DriverCard({
  driver,
  onEdit,
  onDelete,
}: {
  driver: DriverPublic;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const lastPing = driver.locationUpdatedAt
    ? new Date(driver.locationUpdatedAt)
    : null;
  const minutesAgo = lastPing
    ? Math.round((Date.now() - lastPing.getTime()) / 60000)
    : null;
  const isLive = driver.onShift && minutesAgo !== null && minutesAgo < 2;

  return (
    <div className="rounded-2xl border border-outline-variant/15 bg-surface-container p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-full bg-surface-variant">
            {driver.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={driver.photoUrl}
                alt={driver.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-headline text-base font-bold text-primary">
                {driver.name.slice(0, 1).toUpperCase()}
              </div>
            )}
            {isLive && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-surface-container">
                <Circle
                  size={10}
                  className="fill-emerald-500 text-emerald-500"
                />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-headline text-sm font-bold text-tertiary">
              {driver.name}
            </p>
            <p className="truncate text-[11px] text-on-surface-variant">
              {driver.vehicle || "Sin vehículo"}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 gap-1">
          <button
            onClick={onEdit}
            className="rounded-lg border border-outline-variant/20 p-1.5 text-on-surface-variant hover:border-primary/40 hover:text-primary"
            aria-label="Editar"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg border border-outline-variant/20 p-1.5 text-on-surface-variant hover:border-error/40 hover:text-error"
            aria-label="Eliminar"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-1 border-t border-outline-variant/10 pt-3 text-[11px] text-on-surface-variant">
        <div className="flex items-center gap-1.5">
          <Mail size={11} />
          <span className="truncate">{driver.email}</span>
        </div>
        {driver.phone && (
          <div className="flex items-center gap-1.5">
            <Phone size={11} />
            <span>{driver.phone}</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-outline-variant/10 pt-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-headline font-bold uppercase tracking-wider ${
              driver.active
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-error/15 text-error"
            }`}
          >
            <Power size={9} />
            {driver.active ? "Activo" : "Inactivo"}
          </span>
          {driver.onShift && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-headline font-bold uppercase tracking-wider text-primary">
              <CheckCircle2 size={9} />
              En turno
            </span>
          )}
          {(driver.activeOrderCount ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary/15 px-2 py-0.5 text-[9px] font-headline font-bold uppercase tracking-wider text-secondary">
              {driver.activeOrderCount} pedido
              {driver.activeOrderCount! > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {isLive && driver.lat !== null && driver.lng !== null && (
          <span
            className="inline-flex items-center gap-1 text-[10px] text-emerald-400"
            title={`Última ubicación: ${minutesAgo} min`}
          >
            <MapPin size={10} />
            Live
          </span>
        )}
      </div>
    </div>
  );
}

function DriverFormModal({
  driver,
  onClose,
  onSaved,
}: {
  driver: DriverPublic | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(driver?.name || "");
  const [email, setEmail] = useState(driver?.email || "");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState(driver?.phone || "");
  const [vehicle, setVehicle] = useState(driver?.vehicle || "");
  const [active, setActive] = useState(driver?.active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!driver;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const token = getAdminToken() || undefined;
      if (isEdit) {
        await api.patch(
          `/api/admin/drivers/${driver!.id}`,
          {
            name,
            email,
            phone: phone || null,
            vehicle: vehicle || null,
            active,
            ...(password ? { password } : {}),
          },
          token
        );
      } else {
        if (!password) {
          setError("Contraseña requerida para crear repartidor");
          setSubmitting(false);
          return;
        }
        await api.post(
          "/api/admin/drivers",
          { name, email, password, phone: phone || undefined, vehicle: vehicle || undefined },
          token
        );
      }
      onSaved();
    } catch (err: any) {
      setError(err.message || "No se pudo guardar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-outline-variant/15 bg-surface-container p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-headline text-lg font-extrabold text-tertiary">
            {isEdit ? "Editar repartidor" : "Nuevo repartidor"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-variant"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Nombre">
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="form-input"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
            />
          </Field>
          <Field
            label={isEdit ? "Nueva contraseña (opcional)" : "Contraseña"}
          >
            <input
              type="password"
              required={!isEdit}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? "Dejar vacío para no cambiar" : ""}
              className="form-input"
              minLength={6}
            />
          </Field>
          <Field label="Teléfono (opcional)">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="form-input"
            />
          </Field>
          <Field label="Vehículo (opcional)">
            <input
              type="text"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              placeholder="Moto Italika - placa XYZ123"
              className="form-input"
            />
          </Field>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="h-4 w-4 rounded border-outline-variant"
              />
              <span className="text-on-surface">Activo</span>
              <span className="text-xs text-on-surface-variant">
                (Si lo desactivas, no podrá entrar al sistema.)
              </span>
            </label>
          )}

          {error && (
            <p className="text-sm font-semibold text-error">{error}</p>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-outline-variant/25 px-4 py-2 text-sm font-bold text-on-surface-variant"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary shadow-lg shadow-primary/25 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
            {isEdit ? "Guardar" : "Crear"}
          </button>
        </div>
      </form>

      <style jsx>{`
        :global(.form-input) {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgb(255 255 255 / 0.1);
          background: rgb(255 255 255 / 0.04);
          padding: 0.625rem 0.75rem;
          font-size: 0.875rem;
          color: inherit;
          outline: none;
        }
        :global(.form-input:focus) {
          border-color: rgb(240 120 32 / 0.5);
          box-shadow: 0 0 0 2px rgb(240 120 32 / 0.2);
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
        {label}
      </span>
      {children}
    </label>
  );
}
