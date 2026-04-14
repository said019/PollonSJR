"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";
import { getAdminToken } from "@/lib/auth";

interface DashboardStats {
  totalOrdersToday: number;
  activeOrders: number;
  revenueToday: number; // in cents
  avgTicket: number; // in cents
}

/**
 * Live dashboard stats — initializes from server, then updates via Socket.io
 * as new orders arrive and complete.
 */
export function useDashboardStats(initial: DashboardStats) {
  const [stats, setStats] = useState<DashboardStats>(initial);

  useEffect(() => {
    setStats(initial);
  }, [initial]);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;

    const socket = getSocket(token, "admin");
    if (!socket.connected) socket.connect();

    // New order arrives → increment counters
    socket.on("order:new", (order) => {
      setStats((prev) => {
        const newTotal = prev.totalOrdersToday + 1;
        const newRevenue = prev.revenueToday + order.total;
        return {
          totalOrdersToday: newTotal,
          activeOrders: prev.activeOrders + 1,
          revenueToday: newRevenue,
          avgTicket: newTotal > 0 ? Math.round(newRevenue / newTotal) : 0,
        };
      });
    });

    // Order delivered/cancelled → decrement active
    socket.on("order:status", ({ status }) => {
      if (["DELIVERED", "CANCELLED"].includes(status)) {
        setStats((prev) => ({
          ...prev,
          activeOrders: Math.max(0, prev.activeOrders - 1),
        }));
      }
    });

    return () => {
      socket.off("order:new");
      socket.off("order:status");
    };
  }, []);

  return stats;
}
