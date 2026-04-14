"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";

interface StoreStatus {
  accepting: boolean;
  reason?: string;
}

export function StoreStatusBanner() {
  const [status, setStatus] = useState<StoreStatus | null>(null);

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
    };

    socket.on("store:status", handleStoreStatus);

    return () => {
      socket.off("store:status", handleStoreStatus);
    };
  }, []);

  if (!status || status.accepting) return null;

  return (
    <div className="bg-error text-on-error px-5 py-3 text-center font-headline font-bold text-sm">
      {status.reason ?? "Estamos cerrados en este momento."}
    </div>
  );
}
