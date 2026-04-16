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
 *
 * NOTE: watches primitive values of `initial` to avoid infinite render loops
 * when the caller passes a fresh object literal every render.
 */
export function useDashboardStats(initial: DashboardStats) {
  const [stats, setStats] = useState<DashboardStats>(initial);

  // Sync from server when primitive values change (not reference)
  useEffect(() => {
    setStats({
      totalOrdersToday: initial.totalOrdersToday,
      activeOrders: initial.activeOrders,
      revenueToday: initial.revenueToday,
      avgTicket: initial.avgTicket,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initial.totalOrdersToday,
    initial.activeOrders,
    initial.revenueToday,
    initial.avgTicket,
  ]);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;

    const socket = getSocket(token, "admin");
    if (!socket.connected) socket.connect();

    // New order arrives → increment counters
    const handleNew = (order: any) => {
      setStats((prev) => {
        const newTotal = prev.totalOrdersToday + 1;
        const newRevenue = prev.revenueToday + (order?.total ?? 0);
        return {
          totalOrdersToday: newTotal,
          activeOrders: prev.activeOrders + 1,
          revenueToday: newRevenue,
          avgTicket: newTotal > 0 ? Math.round(newRevenue / newTotal) : 0,
        };
      });
    };

    // Order delivered/cancelled → decrement active
    const handleStatus = ({ status }: { status: string }) => {
      if (["DELIVERED", "CANCELLED"].includes(status)) {
        setStats((prev) => ({
          ...prev,
          activeOrders: Math.max(0, prev.activeOrders - 1),
        }));
      }
    };

    socket.on("order:new", handleNew);
    socket.on("order:status", handleStatus);

    return () => {
      socket.off("order:new", handleNew);
      socket.off("order:status", handleStatus);
    };
  }, []);

  return stats;
}
