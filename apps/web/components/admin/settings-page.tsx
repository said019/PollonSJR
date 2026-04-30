"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { Save, Loader2, Clock, Store, Download, Share, Smartphone, Check, Landmark } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";

interface StoreConfig {
  isOpen: boolean;
  deliveryActive: boolean;
  acceptOrders: boolean;
  openTime: string;
  closeTime: string;
  openDays: number[];
  transferClabe?: string | null;
  transferBank?: string | null;
  transferAccountHolder?: string | null;
}

const ALL_DAYS: { label: string; short: string; value: number }[] = [
  { value: 1, label: "Lunes", short: "Lun" },
  { value: 2, label: "Martes", short: "Mar" },
  { value: 3, label: "Miércoles", short: "Mié" },
  { value: 4, label: "Jueves", short: "Jue" },
  { value: 5, label: "Viernes", short: "Vie" },
  { value: 6, label: "Sábado", short: "Sáb" },
  { value: 0, label: "Domingo", short: "Dom" },
];

export function SettingsPage() {
  const token = getAdminToken();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();

  const { data: config, isLoading } = useQuery({
    queryKey: ["admin-config"],
    queryFn: () =>
      api.get<StoreConfig>("/api/admin/store", token || undefined).catch(
        () =>
          ({
            isOpen: true,
            deliveryActive: true,
            acceptOrders: true,
            openTime: "14:00",
            closeTime: "22:00",
            openDays: [1, 2, 3, 4, 5, 6, 0],
            transferClabe: null,
            transferBank: null,
            transferAccountHolder: null,
          }) as StoreConfig
      ),
  });

  const [form, setForm] = useState<StoreConfig | null>(null);

  useEffect(() => {
    if (config) setForm(config);
  }, [config]);

  // Save both config + hours in parallel
  const saveMut = useMutation({
    mutationFn: async (data: StoreConfig) => {
      await Promise.all([
        api.patch(
          "/api/admin/store",
          {
            isOpen: data.isOpen,
            deliveryActive: data.deliveryActive,
            acceptOrders: data.acceptOrders,
            transferClabe: data.transferClabe?.trim() || null,
            transferBank: data.transferBank?.trim() || null,
            transferAccountHolder: data.transferAccountHolder?.trim() || null,
          },
          token || undefined
        ),
        api.put(
          "/api/admin/store/hours",
          {
            openTime: data.openTime,
            closeTime: data.closeTime,
            openDays: data.openDays,
          },
          token || undefined
        ),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-config"] });
      setSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), 3000);
    },
  });

  const clabeError = form?.transferClabe
    ? /^\d{18}$/.test(form.transferClabe.trim())
      ? null
      : "La CLABE debe tener exactamente 18 dígitos"
    : null;

  const handleSave = () => {
    if (form && !clabeError) saveMut.mutate(form);
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
      <div className="flex justify-center py-20">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Configuración</h1>
        <button
          onClick={handleSave}
          disabled={saveMut.isPending || !!clabeError}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
        >
          {saveMut.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : saved ? (
            <Check size={16} />
          ) : (
            <Save size={16} />
          )}
          {saved ? "Guardado" : "Guardar"}
        </button>
      </div>

      {saveMut.isError && (
        <div className="mb-4 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
          Error al guardar. Intenta de nuevo.
        </div>
      )}

      {saved && (
        <div className="mb-4 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-400">
          Configuración guardada correctamente
        </div>
      )}

      {/* ── Estado de la tienda ── */}
      <section className="mb-6 rounded-xl border border-outline-variant/20 bg-surface-container-high p-5">
        <div className="mb-4 flex items-center gap-2">
          <Store size={20} className="text-primary" />
          <h2 className="font-bold">Estado de la tienda</h2>
        </div>
        <div className="space-y-4">
          <ToggleRow
            checked={form.isOpen}
            onChange={(v) => setForm({ ...form, isOpen: v })}
            title="Tienda abierta"
            description="Visible para los clientes"
          />
          <ToggleRow
            checked={form.acceptOrders}
            onChange={(v) => setForm({ ...form, acceptOrders: v })}
            title="Aceptar pedidos"
            description="Desactiva para pausar temporalmente"
          />
          <ToggleRow
            checked={form.deliveryActive}
            onChange={(v) => setForm({ ...form, deliveryActive: v })}
            title="Envíos activos"
            description={
              <>
                Habilitar entregas a domicilio ·{" "}
                <Link href="/admin/delivery" className="text-primary underline">
                  Configurar zonas
                </Link>
              </>
            }
          />
        </div>
      </section>

      {/* ── Horario ── */}
      <section className="mb-6 rounded-xl border border-outline-variant/20 bg-surface-container-high p-5">
        <div className="mb-4 flex items-center gap-2">
          <Clock size={20} className="text-primary" />
          <h2 className="font-bold">Horario</h2>
        </div>

        {/* Days */}
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium">Días de atención</label>
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
            Deja vacío para aceptar pedidos todos los días
          </p>
        </div>

        {/* Time inputs */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Hora apertura</label>
            <input
              type="time"
              value={form.openTime}
              onChange={(e) => setForm({ ...form, openTime: e.target.value })}
              className="w-full rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-sm text-on-surface [color-scheme:dark]"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Hora cierre</label>
            <input
              type="time"
              value={form.closeTime}
              onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
              className="w-full rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-sm text-on-surface [color-scheme:dark]"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-on-surface-variant/60">
          Horario en tiempo de México (CST/CDT)
        </p>
      </section>

      {/* ── Datos de transferencia ── */}
      <section className="mb-6 rounded-xl border border-outline-variant/20 bg-surface-container-high p-5">
        <div className="mb-4 flex items-center gap-2">
          <Landmark size={20} className="text-primary" />
          <h2 className="font-bold">Datos de transferencia</h2>
        </div>
        <p className="mb-4 text-xs text-on-surface-variant/70">
          Los clientes que paguen por transferencia verán estos datos en su
          pedido. La CLABE debe tener 18 dígitos.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">CLABE interbancaria</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={18}
              placeholder="012345678901234567"
              value={form.transferClabe ?? ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 18);
                setForm({ ...form, transferClabe: digits });
              }}
              className={`w-full rounded-xl border bg-surface-container p-3 font-mono text-sm tracking-wider text-on-surface ${
                clabeError
                  ? "border-error/60 focus:border-error"
                  : "border-outline-variant/30 focus:border-primary/60"
              } outline-none transition-colors`}
            />
            {clabeError && (
              <p className="mt-1 text-xs font-semibold text-error">{clabeError}</p>
            )}
            <p className="mt-1 text-[11px] text-on-surface-variant/60">
              {form.transferClabe?.length ?? 0} / 18 dígitos
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Banco</label>
            <input
              type="text"
              maxLength={60}
              placeholder="BBVA"
              value={form.transferBank ?? ""}
              onChange={(e) => setForm({ ...form, transferBank: e.target.value })}
              className="w-full rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-sm text-on-surface outline-none transition-colors focus:border-primary/60"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Titular de la cuenta</label>
            <input
              type="text"
              maxLength={120}
              placeholder="Pollón SJR"
              value={form.transferAccountHolder ?? ""}
              onChange={(e) =>
                setForm({ ...form, transferAccountHolder: e.target.value })
              }
              className="w-full rounded-xl border border-outline-variant/30 bg-surface-container p-3 text-sm text-on-surface outline-none transition-colors focus:border-primary/60"
            />
          </div>
        </div>
      </section>

      {/* ── Instalar app ── */}
      <InstallAppSection />
    </div>
  );
}

/* ─── Toggle Row ──────────────────────────────────────────── */

function ToggleRow({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-outline-variant/40"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-on-surface-variant">{description}</p>
      </div>
    </label>
  );
}

/* ─── Install App Section ─────────────────────────────────── */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function InstallAppSection() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
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
    <section className="mb-6 rounded-xl border border-outline-variant/20 bg-surface-container-high p-5">
      <div className="mb-4 flex items-center gap-2">
        <Smartphone size={20} className="text-primary" />
        <h2 className="font-bold">Instalar app en celular</h2>
      </div>

      <div className="mb-5 flex items-center gap-4">
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
        <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-400">
          <Check size={16} />
          App instalada correctamente en este dispositivo
        </div>
      ) : (
        <div className="space-y-3">
          {deferredPrompt && (
            <button
              onClick={handleInstall}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-on-primary transition-all active:scale-[0.98]"
            >
              <Download size={16} />
              Instalar app ahora
            </button>
          )}

          {/* iOS */}
          <InstructionCard
            title={isIos ? "Instalar en este iPhone / iPad:" : "En iPhone / iPad (Safari):"}
            steps={[
              <>Abre esta página en <strong className="text-on-surface">Safari</strong></>,
              <>Toca <Share size={12} className="inline text-primary" /> <strong className="text-on-surface">Compartir</strong> en la barra inferior</>,
              <>Selecciona <strong className="text-on-surface">&quot;Agregar a inicio&quot;</strong> y confirma</>,
            ]}
          />

          {/* Android (fallback when no native prompt) */}
          {!deferredPrompt && !isIos && (
            <InstructionCard
              title="En Android (Chrome):"
              steps={[
                <>Abre esta página en <strong className="text-on-surface">Chrome</strong></>,
                <>Toca los <strong className="text-on-surface">3 puntos ⋮</strong> arriba a la derecha</>,
                <>Selecciona <strong className="text-on-surface">&quot;Instalar app&quot;</strong></>,
              ]}
            />
          )}

          <p className="text-center text-[11px] text-on-surface-variant/50">
            El icono de Pollón aparecerá en tu pantalla como una app nativa
          </p>
        </div>
      )}
    </section>
  );
}

function InstructionCard({ title, steps }: { title: string; steps: React.ReactNode[] }) {
  return (
    <div className="rounded-xl border border-outline-variant/20 bg-surface-container p-4">
      <p className="mb-3 text-sm font-semibold text-on-surface">{title}</p>
      <div className="space-y-2.5">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-bold text-primary">
              {i + 1}
            </div>
            <p className="text-sm text-on-surface-variant">{step}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
