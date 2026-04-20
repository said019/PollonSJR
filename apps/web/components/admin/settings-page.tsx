"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { Save, Loader2, Clock, Store, Download, Share, Smartphone } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";

interface StoreConfig {
  isOpen: boolean;
  deliveryActive: boolean;
  acceptOrders: boolean;
  openTime: string;
  closeTime: string;
  openDays: number[];
}

const ALL_DAYS: { label: string; short: string; value: number }[] = [
  { value: 1, label: "Lunes",     short: "Lun" },
  { value: 2, label: "Martes",    short: "Mar" },
  { value: 3, label: "Miércoles", short: "Mié" },
  { value: 4, label: "Jueves",    short: "Jue" },
  { value: 5, label: "Viernes",   short: "Vie" },
  { value: 6, label: "Sábado",    short: "Sáb" },
  { value: 0, label: "Domingo",   short: "Dom" },
];

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
      openDays: [1, 2, 3, 4, 5, 6, 0],
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

  const toggleDay = (day: number) => {
    if (!form) return;
    const days = form.openDays.includes(day)
      ? form.openDays.filter((d) => d !== day)
      : [...form.openDays, day];
    setForm({ ...form, openDays: days });
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
      <section className="bg-surface-container-high rounded-xl p-5 border border-outline-variant/20 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={20} className="text-primary" />
          <h2 className="font-bold">Horario</h2>
        </div>

        {/* Days of week */}
        <div className="mb-4">
          <label className="text-sm font-medium mb-2 block">Días de atención</label>
          <div className="flex flex-wrap gap-2">
            {ALL_DAYS.map((day) => {
              const active = form.openDays.includes(day.value);
              return (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all ${
                    active
                      ? "border-primary bg-primary text-on-primary"
                      : "border-outline-variant/40 bg-surface-container text-on-surface-variant hover:border-primary/40"
                  }`}
                >
                  {day.short}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs text-on-surface-variant/60">
            Deja vacío para aceptar pedidos todos los días dentro del horario
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Hora apertura</label>
            <input
              type="time"
              value={form.openTime}
              onChange={(e) => setForm({ ...form, openTime: e.target.value })}
              className="w-full border border-outline-variant/30 bg-surface-container rounded-xl p-3 text-sm text-on-surface"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Hora cierre</label>
            <input
              type="time"
              value={form.closeTime}
              onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
              className="w-full border border-outline-variant/30 bg-surface-container rounded-xl p-3 text-sm text-on-surface"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-on-surface-variant/60">
          Horario en tiempo de México (CST/CDT)
        </p>
      </section>

      {/* Install app */}
      <InstallAppSection />
    </div>
  );
}

/* ─── Install App Section ──────────────────────────────────── */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function InstallAppSection() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    setIsStandalone(standalone);

    const ua = navigator.userAgent;
    setIsIos(/iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return (
    <section className="bg-surface-container-high rounded-xl p-5 border border-outline-variant/20 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Smartphone size={20} className="text-primary" />
        <h2 className="font-bold">Instalar app en celular</h2>
      </div>

      <div className="flex items-center gap-4 mb-5">
        <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-2xl border-2 border-primary/30 shadow-lg shadow-primary/10">
          <Image
            src="/pollon-logo.jpg"
            alt="Pollón"
            width={64}
            height={64}
            className="h-full w-full object-cover"
          />
        </div>
        <div>
          <p className="font-bold text-on-surface">Pollón SJR</p>
          <p className="text-xs text-on-surface-variant">
            {isStandalone || installed
              ? "Ya tienes la app instalada"
              : "Acceso directo como app nativa"}
          </p>
        </div>
      </div>

      {isStandalone || installed ? (
        <div className="flex items-center gap-2 rounded-xl bg-green-500/10 border border-green-500/20 p-3 text-sm text-green-400">
          <span className="text-lg">✓</span>
          <span>App instalada correctamente en este dispositivo</span>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Android / Chrome */}
          {deferredPrompt && (
            <button
              onClick={handleInstall}
              className="w-full flex items-center justify-center gap-2 bg-primary text-on-primary py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]"
            >
              <Download size={16} />
              Instalar app ahora
            </button>
          )}

          {/* iOS instructions */}
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container p-4">
            <p className="text-sm font-semibold text-on-surface mb-3">
              {isIos ? "Instalar en este iPhone / iPad:" : "Instrucciones para iOS (iPhone / iPad):"}
            </p>
            <div className="space-y-2.5">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-bold text-primary">
                  1
                </div>
                <p className="text-sm text-on-surface-variant">
                  Abre esta página en <strong className="text-on-surface">Safari</strong>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-bold text-primary">
                  2
                </div>
                <p className="text-sm text-on-surface-variant">
                  Toca el botón <Share size={12} className="inline text-primary" /> <strong className="text-on-surface">Compartir</strong> en la barra inferior
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-bold text-primary">
                  3
                </div>
                <p className="text-sm text-on-surface-variant">
                  Selecciona <strong className="text-on-surface">"Agregar a inicio"</strong> y confirma
                </p>
              </div>
            </div>
          </div>

          {/* Android instructions (when no prompt available) */}
          {!deferredPrompt && !isIos && (
            <div className="rounded-xl border border-outline-variant/20 bg-surface-container p-4">
              <p className="text-sm font-semibold text-on-surface mb-3">
                Instrucciones para Android (Chrome):
              </p>
              <div className="space-y-2.5">
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-bold text-primary">
                    1
                  </div>
                  <p className="text-sm text-on-surface-variant">
                    Abre esta página en <strong className="text-on-surface">Chrome</strong>
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-bold text-primary">
                    2
                  </div>
                  <p className="text-sm text-on-surface-variant">
                    Toca los <strong className="text-on-surface">3 puntos ⋮</strong> arriba a la derecha
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-bold text-primary">
                    3
                  </div>
                  <p className="text-sm text-on-surface-variant">
                    Selecciona <strong className="text-on-surface">"Instalar app"</strong> o <strong className="text-on-surface">"Agregar a pantalla de inicio"</strong>
                  </p>
                </div>
              </div>
            </div>
          )}

          <p className="text-[11px] text-on-surface-variant/50 text-center">
            El icono de Pollón aparecerá en tu pantalla como una app nativa
          </p>
        </div>
      )}
    </section>
  );
}
