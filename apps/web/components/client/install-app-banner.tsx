"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, Share, X } from "lucide-react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pollon_install_dismissed";

export function InstallAppBanner() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(true); // default hidden
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    // Already installed as PWA?
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Was dismissed recently? (7 days)
    const stored = localStorage.getItem(DISMISSED_KEY);
    if (stored && Date.now() - Number(stored) < 7 * 24 * 60 * 60 * 1000) {
      setDismissed(true);
      return;
    }

    if (!standalone) setDismissed(false);

    // Detect iOS
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIos(ios);

    // Android / Chrome prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setDismissed(true);
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  }, []);

  // Don't show if: already installed, dismissed, or not on mobile
  if (isStandalone || dismissed) return null;
  // On desktop without prompt and not iOS → hide
  if (!deferredPrompt && !isIos) return null;

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="pointer-events-auto relative overflow-hidden rounded-2xl border border-primary/25 bg-surface-container/95 shadow-xl shadow-black/20 backdrop-blur-xl"
        >
          {/* Dismiss X */}
          <button
            onClick={handleDismiss}
            className="absolute right-2 top-2 rounded-lg p-1 text-on-surface-variant/40 transition-colors hover:text-on-surface-variant"
            aria-label="Cerrar"
          >
            <X size={14} />
          </button>

          <div className="flex items-center gap-3 px-4 py-3">
            {/* App icon */}
            <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl border border-outline-variant/20 shadow-md">
              <Image
                src="/pollon-logo.jpg"
                alt="Pollón"
                width={44}
                height={44}
                className="h-full w-full object-cover"
              />
            </div>

            {/* Text */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-tertiary leading-tight">
                Instala Pollón
              </p>
              <p className="text-[11px] text-on-surface-variant/70 leading-tight">
                Acceso directo desde tu pantalla de inicio
              </p>
            </div>

            {/* Action button */}
            {isIos ? (
              <button
                onClick={() => setShowIosGuide(true)}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-on-primary shadow-md shadow-primary/25 transition-all active:scale-[0.96]"
              >
                <Share size={13} />
                Instalar
              </button>
            ) : (
              <button
                onClick={handleInstall}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-on-primary shadow-md shadow-primary/25 transition-all active:scale-[0.96]"
              >
                <Download size={13} />
                Instalar
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* iOS instruction modal */}
      <AnimatePresence>
        {showIosGuide && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black"
              onClick={() => setShowIosGuide(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-lg rounded-t-3xl border border-outline-variant/15 bg-surface-container p-6 shadow-2xl"
            >
              <div className="mb-1 flex justify-center">
                <div className="h-1 w-10 rounded-full bg-outline-variant/40" />
              </div>

              <div className="mb-5 flex items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-xl border border-outline-variant/20">
                  <Image
                    src="/pollon-logo.jpg"
                    alt="Pollón"
                    width={48}
                    height={48}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <h2 className="font-headline text-lg font-extrabold text-tertiary">
                    Instalar Pollón
                  </h2>
                  <p className="text-xs text-on-surface-variant">
                    Se agrega a tu pantalla de inicio
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/15 font-headline text-sm font-bold text-primary">
                    1
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-on-surface">
                      Toca el botón de compartir
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      El icono <Share size={12} className="inline" /> en la barra
                      inferior de Safari
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/15 font-headline text-sm font-bold text-primary">
                    2
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-on-surface">
                      Busca "Agregar a inicio"
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      Desliza hacia abajo en el menú hasta encontrar el icono +
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/15 font-headline text-sm font-bold text-primary">
                    3
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-on-surface">
                      Toca "Agregar"
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      Listo — Pollón aparece como app en tu pantalla
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIosGuide(false)}
                className="mt-6 w-full rounded-xl bg-primary py-3 font-headline text-sm font-bold text-on-primary transition-all active:scale-[0.98]"
              >
                Entendido
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
