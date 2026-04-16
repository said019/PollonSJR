"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";
import { Bell, BellOff, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface StoreStatus {
  accepting: boolean;
  reason?: string;
}

export function StoreStatusBanner() {
  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [notified, setNotified] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Initial fetch via HTTP
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
    fetch(`${apiUrl}/api/store/status`)
      .then((r) => r.json())
      .then((d) => setStatus({ accepting: d.accepting, reason: d.reason }))
      .catch(() => {});

    // Listen for real-time changes
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    const handleStoreStatus = (data: {
      isOpen: boolean;
      acceptOrders: boolean;
      message?: string;
    }) => {
      setStatus({
        accepting: data.isOpen && data.acceptOrders,
        reason: data.message,
      });
      // If store reopened, reset notification state
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

  if (!status || status.accepting || dismissed) return null;

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
            <p className="text-sm font-headline font-bold text-center flex-1">
              {status.reason ?? "Estamos cerrados en este momento."}
            </p>

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
