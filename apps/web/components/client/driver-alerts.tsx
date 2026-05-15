"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSocket } from "@/hooks/useSocket";
import { getDriverToken } from "@/lib/auth";
import { playNewOrderSound, preloadNewOrderSound } from "@/lib/notification-sound";
import { Bell, BellOff, Download, X, Volume2, CheckCircle2 } from "lucide-react";

type NotifPerm = "default" | "granted" | "denied" | "unsupported";

/**
 * Bloque del dashboard del repartidor que junta:
 *  - Banner para activar notificaciones del navegador
 *  - Sonido + toast cuando entra `order:assigned`
 *  - Instrucciones para "Instalar app" (iOS Safari + Android Chrome)
 *
 * El driver es quien escucha. Cuando admin le asigna un pedido, el backend emite
 * order:assigned al room `driver:<id>` y este componente:
 *   1. Reproduce notification-sound.ts:playNewOrderSound (compartido con admin)
 *   2. Lanza una in-tab Notification si el usuario dio permiso
 *   3. Muestra un toast en pantalla
 */
export function DriverAlerts() {
  const [perm, setPerm] = useState<NotifPerm>("default");
  const [toast, setToast] = useState<{ orderNumber: number } | null>(null);
  const [installState, setInstallState] = useState<
    "ios" | "android-prompt" | "android-no-prompt" | "installed" | "desktop"
  >("desktop");
  const deferredPromptRef = useRef<any>(null);
  const [installDismissed, setInstallDismissed] = useState(false);

  const token = typeof window !== "undefined" ? getDriverToken() : null;

  // ── 1. Notification permission ─────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPerm("unsupported");
      return;
    }
    setPerm(Notification.permission as NotifPerm);
  }, []);

  // ── 2. Preload del sonido en el primer mount ───────────────
  useEffect(() => {
    preloadNewOrderSound();
  }, []);

  // ── 3. PWA install detection ───────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) {
      setInstallState("installed");
      return;
    }

    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);

    if (isIOS) {
      setInstallState("ios");
    } else if (isAndroid) {
      setInstallState("android-no-prompt");
    } else {
      setInstallState("desktop");
    }

    const handler = (e: any) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      if (isAndroid) setInstallState("android-prompt");
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setInstallDismissed(
      localStorage.getItem("pollon:driver_install_dismissed") === "1"
    );
  }, []);

  const dismissInstall = () => {
    localStorage.setItem("pollon:driver_install_dismissed", "1");
    setInstallDismissed(true);
  };

  // ── 4. Socket listener para pedidos asignados ──────────────
  useSocket(
    "order:assigned",
    (data) => {
      // Sonido — el browser bloquea audio antes del primer click, por eso el botón
      // de "Iniciar turno" cuenta como gesture: el sonido empieza a funcionar después.
      playNewOrderSound();

      // In-tab notification (Notification API, fuera del tab solo si tab está
      // backgrounded — para tab cerrado se necesita Web Push real)
      if (typeof window !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("🛵 Nuevo pedido asignado", {
            body: `Pedido #${data.orderNumber} para ${data.driverName}`,
            tag: `order-assigned-${data.orderId}`,
            icon: "/icon-192x192.png",
          });
        } catch {
          // Ignored — algunos navegadores móviles tiran error sin sw.
        }
      }

      // Toast in-app
      setToast({ orderNumber: data.orderNumber });
      setTimeout(() => setToast(null), 6000);
    },
    { token: token || undefined, role: "driver" }
  );

  const requestPerm = async () => {
    if (perm === "unsupported" || perm === "denied") return;
    const next = await Notification.requestPermission();
    setPerm(next as NotifPerm);
  };

  const promptInstall = async () => {
    const ev = deferredPromptRef.current;
    if (!ev) return;
    ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === "accepted") setInstallState("installed");
    deferredPromptRef.current = null;
  };

  // ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Notification permission banner — solo si default */}
      {perm === "default" && (
        <button
          onClick={requestPerm}
          className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-3 text-left transition-all hover:border-primary/50 active:scale-[0.99]"
        >
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
            <Bell size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-headline text-sm font-bold text-tertiary">
              Activa las alertas de pedidos
            </p>
            <p className="text-[11px] text-on-surface-variant">
              Sonido + notificación del celular cuando te asignen uno.
            </p>
          </div>
          <span className="flex-shrink-0 rounded-lg bg-primary px-3 py-1.5 text-[10px] font-headline font-bold uppercase tracking-wider text-on-primary">
            Activar
          </span>
        </button>
      )}

      {perm === "denied" && (
        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
            <BellOff size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-headline text-sm font-bold text-amber-400">
              Notificaciones bloqueadas
            </p>
            <p className="text-[11px] text-on-surface-variant">
              Vas a oír el sonido pero no llegará pop-up. Habilítalas en los
              ajustes del navegador (candado en la URL → notificaciones → permitir).
            </p>
          </div>
        </div>
      )}

      {perm === "granted" && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-400">
          <Volume2 size={12} />
          <span className="font-semibold">
            Alertas activas — recibirás sonido + notificación al asignarte un pedido.
          </span>
        </div>
      )}

      {/* PWA install card — sólo si no está instalada y no fue descartada */}
      {installState !== "installed" &&
        installState !== "desktop" &&
        !installDismissed && (
          <InstallAppCard
            state={installState}
            onPromptInstall={promptInstall}
            onDismiss={dismissInstall}
          />
        )}

      {/* Toast cuando llega nuevo pedido */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: -20, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 220 }}
            className="fixed left-1/2 top-4 z-50 -translate-x-1/2 max-w-sm w-[calc(100vw-2rem)]"
          >
            <button
              onClick={() => setToast(null)}
              className="flex w-full items-center gap-3 rounded-2xl border-2 border-primary bg-surface-container shadow-2xl shadow-primary/50 p-4 text-left active:scale-[0.98]"
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary text-on-primary">
                <span className="text-2xl">🛵</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-headline text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                  Nuevo pedido
                </p>
                <p className="font-headline text-base font-extrabold text-tertiary">
                  Pedido #{toast.orderNumber} asignado
                </p>
                <p className="text-[11px] text-on-surface-variant">
                  Tap para ver el detalle ↓
                </p>
              </div>
              <CheckCircle2 size={16} className="flex-shrink-0 text-primary" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function InstallAppCard({
  state,
  onPromptInstall,
  onDismiss,
}: {
  state: "ios" | "android-prompt" | "android-no-prompt";
  onPromptInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-3 rounded-2xl border border-secondary/30 bg-gradient-to-br from-secondary/10 to-secondary/5 p-3.5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-secondary/20 text-secondary">
          <Download size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-headline text-sm font-bold text-tertiary">
            Instala Pollón Repartidor
          </p>
          <p className="text-[11px] text-on-surface-variant">
            Acceso directo, pantalla completa, GPS más estable y sonido más fuerte.
          </p>

          {state === "android-prompt" && (
            <button
              onClick={onPromptInstall}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-secondary px-3 py-2 text-xs font-headline font-bold uppercase tracking-wider text-on-secondary"
            >
              <Download size={12} />
              Instalar ahora
            </button>
          )}

          {state === "android-no-prompt" && (
            <ol className="mt-2 space-y-1 text-[11px] text-on-surface-variant">
              <li>
                <strong className="text-on-surface">1.</strong> Toca el menú{" "}
                <strong>⋮</strong> de Chrome arriba a la derecha
              </li>
              <li>
                <strong className="text-on-surface">2.</strong> Elige{" "}
                <strong>"Instalar app"</strong> o{" "}
                <strong>"Agregar a pantalla principal"</strong>
              </li>
              <li>
                <strong className="text-on-surface">3.</strong> Confirma →
                aparece un ícono naranja 🍗 en tu home
              </li>
            </ol>
          )}

          {state === "ios" && (
            <ol className="mt-2 space-y-1 text-[11px] text-on-surface-variant">
              <li>
                <strong className="text-on-surface">1.</strong> Abre esta página en{" "}
                <strong>Safari</strong> (no Chrome iOS)
              </li>
              <li>
                <strong className="text-on-surface">2.</strong> Toca el botón{" "}
                <strong>Compartir</strong> ⎙ abajo
              </li>
              <li>
                <strong className="text-on-surface">3.</strong>{" "}
                <strong>"Agregar a pantalla de inicio"</strong>
              </li>
              <li>
                <strong className="text-on-surface">4.</strong> Listo → ícono 🍗
                en tu home, abre como app nativa
              </li>
            </ol>
          )}
        </div>
        <button
          onClick={onDismiss}
          aria-label="Descartar"
          className="rounded-lg p-1 text-on-surface-variant/60 hover:text-on-surface-variant"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
