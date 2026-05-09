"use client";

import { useEffect, useMemo, useState } from "react";
import { getSocket } from "@/lib/socket";
import { Bell, BellOff, Clock, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface StoreStatus {
  accepting: boolean;
  reason?: string;
  openTime?: string;
  closeTime?: string;
  openDays?: number[];
  closedMessage?: string | null;
}

function nowMexicoMinutes(): number {
  const nowMx = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" })
  );
  return nowMx.getHours() * 60 + nowMx.getMinutes();
}

function nowMexicoDay(): number {
  const nowMx = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" })
  );
  return nowMx.getDay();
}

function parseHHMM(t?: string): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

export function StoreStatusBanner() {
  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [notified, setNotified] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    fetch(`${apiUrl}/api/store/status`)
      .then((r) => r.json())
      .then((d) =>
        setStatus({
          accepting: d.accepting,
          reason: d.reason,
          openTime: d.openTime,
          closeTime: d.closeTime,
          openDays: d.openDays,
          closedMessage: d.closedMessage,
        })
      )
      .catch(() => {});

    const socket = getSocket();
    if (!socket.connected) socket.connect();

    const handleStoreStatus = (data: {
      isOpen: boolean;
      acceptOrders: boolean;
      message?: string;
      openTime?: string;
      closeTime?: string;
    }) => {
      setStatus((prev) => ({
        ...prev,
        accepting: data.isOpen && data.acceptOrders,
        reason: data.message ?? prev?.reason,
        openTime: data.openTime ?? prev?.openTime,
        closeTime: data.closeTime ?? prev?.closeTime,
      }));
      if (data.isOpen && data.acceptOrders) {
        setDismissed(false);
        setNotified(false);
      }
    };

    socket.on("store:status", handleStoreStatus);
    return () => {
      socket.off("store:status", handleStoreStatus);
    };
  }, []);

  // Tick every minute to refresh "abrimos en X min"
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const opensInLabel = useMemo(() => {
    if (!status || status.accepting) return null;
    const openMin = parseHHMM(status.openTime);
    if (openMin == null) return null;
    const dayOk =
      !status.openDays ||
      status.openDays.length === 0 ||
      status.openDays.includes(nowMexicoDay());
    if (!dayOk) return null;
    const current = nowMexicoMinutes();
    if (current >= openMin) return null;
    const diff = openMin - current;
    if (diff <= 0) return null;
    if (diff < 60) return `Abrimos en ${diff} min`;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return m === 0 ? `Abrimos en ${h}h` : `Abrimos en ${h}h ${m}min`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tick]);

  if (!status || status.accepting || dismissed) return null;

  const message =
    status.closedMessage ||
    status.reason ||
    "Estamos cerrados en este momento.";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="overflow-hidden"
      >
        <div className="bg-gradient-to-r from-error/90 to-error text-on-error px-4 py-2.5">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
            <div className="flex flex-1 flex-col items-center gap-0.5 text-center sm:flex-row sm:gap-3 sm:text-left">
              <p className="text-sm font-headline font-bold">{message}</p>
              {opensInLabel && (
                <span className="inline-flex items-center gap-1 rounded-full bg-on-error/20 px-2 py-0.5 font-headline text-[10px] font-bold uppercase tracking-wider text-on-error">
                  <Clock size={10} />
                  {opensInLabel}
                </span>
              )}
            </div>

            <div className="flex flex-shrink-0 items-center gap-2">
              {!notified ? (
                <button
                  onClick={() => setNotified(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-on-error/30 bg-on-error/10 px-2.5 py-1 font-headline text-[10px] font-bold uppercase tracking-wider text-on-error transition-colors hover:bg-on-error/20 active:scale-[0.97]"
                >
                  <Bell size={11} />
                  Avísame cuando abra
                </button>
              ) : (
                <span className="flex items-center gap-1.5 rounded-lg bg-on-error/20 px-2.5 py-1 font-headline text-[10px] font-bold uppercase tracking-wider text-on-error">
                  <BellOff size={11} />
                  Te avisamos
                </span>
              )}

              <button
                onClick={() => setDismissed(true)}
                aria-label="Cerrar aviso"
                className="rounded-lg p-1 text-on-error/60 transition-colors hover:bg-on-error/20 hover:text-on-error"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
