"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getToken } from "@/lib/auth";
import { useSocket } from "@/hooks/useSocket";
import { api } from "@/lib/api";
import {
  isNotifiableStatus,
  showOrderStatusNotification,
  pushSupported,
  subscribeToPush,
} from "@/lib/customer-notifications";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface ActiveOrder {
  id: string;
  type?: "DELIVERY" | "PICKUP";
}

/**
 * Mounted once in the customer layout. Listens to order:status socket
 * events and shows a Rappi-style browser notification while the tab/PWA
 * is open or backgrounded. Permission is requested elsewhere (the order
 * tracker prompts the user when there is an active order).
 */
export function CustomerNotificationsBootstrap() {
  const [token, setToken] = useState<string | null>(null);
  const qc = useQueryClient();

  // Tiny in-memory cache of orderType per orderId, so the notification
  // copy can be tailored to PICKUP vs DELIVERY without an extra API hop.
  const [orderTypes, setOrderTypes] = useState<Record<string, "DELIVERY" | "PICKUP">>({});

  useEffect(() => {
    setToken(getToken());
    const onStorage = () => setToken(getToken());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // When the customer is logged in AND has granted notification permission,
  // register the device for web push so they receive updates with the tab closed.
  useEffect(() => {
    if (!token || !pushSupported()) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    void subscribeToPush(token, API_URL);
  }, [token]);

  useSocket(
    "order:status",
    async (payload) => {
      // Refresh React Query caches so banners/lists stay in sync globally
      qc.invalidateQueries({ queryKey: ["order", payload.orderId] });
      qc.invalidateQueries({ queryKey: ["my-active-orders"] });

      if (!isNotifiableStatus(payload.status)) return;

      let orderType = orderTypes[payload.orderId];
      if (!orderType && token) {
        // Fetch once to learn whether this order is delivery or pickup
        try {
          const order = await api.get<ActiveOrder>(
            `/api/orders/${payload.orderId}`,
            token
          );
          if (order?.type) {
            orderType = order.type;
            setOrderTypes((prev) => ({ ...prev, [payload.orderId]: order.type! }));
          }
        } catch {
          // ignore — we'll fall back to the pickup copy
        }
      }

      showOrderStatusNotification({
        status: payload.status,
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        orderType,
        cancelReason: payload.cancelReason ?? null,
      });
    },
    { token: token || undefined, role: "customer" }
  );

  return null;
}
