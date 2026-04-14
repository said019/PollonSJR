"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { Save, Loader2, Clock, Store } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";

interface StoreConfig {
  isOpen: boolean;
  deliveryActive: boolean;
  acceptOrders: boolean;
  openTime: string;
  closeTime: string;
  openDays: number[];
}

export function SettingsPage() {
  const token = getAdminToken();
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["admin-config"],
    queryFn: () => api.get<StoreConfig>("/api/admin/store", token || undefined).catch(() => ({
      isOpen: true,
      deliveryActive: true,
      acceptOrders: true,
      openTime: "14:00",
      closeTime: "22:00",
      openDays: [4, 5, 6, 0],
    } as StoreConfig)),
  });

  const [form, setForm] = useState<StoreConfig | null>(null);

  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  const saveMut = useMutation({
    mutationFn: (data: Partial<StoreConfig>) =>
      api.patch("/api/admin/store", data, token || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-config"] }),
  });

  const handleSave = () => {
    if (form) saveMut.mutate(form);
  };

  if (isLoading || !form) {
    return (
      <div className="p-6 flex justify-center py-12">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Configuración</h1>
        <button
          onClick={handleSave}
          disabled={saveMut.isPending}
          className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
        >
          {saveMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Guardar
        </button>
      </div>

      {saveMut.isSuccess && (
        <div className="bg-secondary-container/20 text-green-700 text-sm p-3 rounded-lg mb-4">
          Configuración guardada correctamente
        </div>
      )}

      {/* Store info */}
      <section className="bg-surface-container-high rounded-xl p-5 border border-outline-variant/20 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Store size={20} className="text-primary" />
          <h2 className="font-bold">Estado de la tienda</h2>
        </div>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isOpen}
              onChange={(e) => setForm({ ...form, isOpen: e.target.checked })}
              className="w-5 h-5 rounded accent-primary"
            />
            <div>
              <p className="text-sm font-medium">Tienda abierta</p>
              <p className="text-xs text-on-surface-variant">Visible para los clientes</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.acceptOrders}
              onChange={(e) => setForm({ ...form, acceptOrders: e.target.checked })}
              className="w-5 h-5 rounded accent-primary"
            />
            <div>
              <p className="text-sm font-medium">Aceptar pedidos</p>
              <p className="text-xs text-on-surface-variant">Desactiva para pausar temporalmente</p>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.deliveryActive}
              onChange={(e) => setForm({ ...form, deliveryActive: e.target.checked })}
              className="w-5 h-5 rounded accent-primary"
            />
            <div>
              <p className="text-sm font-medium">Envíos activos</p>
              <p className="text-xs text-on-surface-variant">
                Habilitar entregas a domicilio ·{" "}
                <Link href="/admin/delivery" className="text-primary underline">
                  Configurar zonas
                </Link>
              </p>
            </div>
          </label>
        </div>
      </section>

      {/* Hours */}
      <section className="bg-surface-container-high rounded-xl p-5 border border-outline-variant/20">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={20} className="text-primary" />
          <h2 className="font-bold">Horario</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Hora apertura</label>
            <input
              type="time"
              value={form.openTime}
              onChange={(e) => setForm({ ...form, openTime: e.target.value })}
              className="w-full border rounded-xl p-3 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Hora cierre</label>
            <input
              type="time"
              value={form.closeTime}
              onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
              className="w-full border rounded-xl p-3 text-sm"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
