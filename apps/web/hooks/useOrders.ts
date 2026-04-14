"use client";

import { useEffect, useState, useCallback } from "react";
import type { OrderSummary, OrderStatusType } from "@pollon/types";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { getSocket } from "@/lib/socket";

function playNotificationSound() {
  if (typeof window === "undefined") return;
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // AudioContext may fail on some browsers
  }
}

export function useOrders() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const fetchOrders = useCallback(async () => {
    const token = getAdminToken();
    if (!token) return;
    try {
      const data = await api.get<OrderSummary[]>("/api/admin/orders", token);
      setOrders(data);
    } catch (err) {
      console.error("Error fetching orders:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;

    const socket = getSocket(token, "admin");
    if (!socket.connected) socket.connect();

    // Connection status
    const onConnect = () => {
      setConnected(true);
      // Refetch on reconnect to catch missed events
      fetchOrders();
    };
    const onDisconnect = () => setConnected(false);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    setConnected(socket.connected);

    // New order arrives
    socket.on("order:new", (order) => {
      setOrders((prev) => [order, ...prev]);
      playNotificationSound();
    });

    // Status changed
    socket.on("order:status", ({ orderId, status }) => {
      setOrders((prev) =>
        prev
          .map((o) => (o.id === orderId ? { ...o, status } : o))
          .filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status))
      );
    });

    // Initial fetch
    fetchOrders();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("order:new");
      socket.off("order:status");
    };
  }, [fetchOrders]);

  const updateStatus = useCallback(
    async (orderId: string, status: OrderStatusType) => {
      const token = getAdminToken();
      if (!token) return;
      await api.patch(`/api/admin/orders/${orderId}/status`, { status }, token);
      // State update will come via socket event
    },
    []
  );

  return { orders, loading, connected, updateStatus, refetch: fetchOrders };
}
