"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "@/lib/socket";
import { getAdminToken } from "@/lib/auth";

interface DashboardStats {
  totalOrdersToday: number;
  activeOrders: number;
  revenueToday: number; // in cents
  avgTicket: number; // in cents
}

/**
 * Live dashboard stats — server is the only source of truth.
 *
 * Antes: este hook mantenía contadores en memoria y los
 * incrementaba/decrementaba con eventos socket. Cuando el socket se
 * desconectaba un instante (token vencido, internet inestable), perdía
 * algún order:status y el contador local se desincronizaba del backend
 * hasta el próximo refetch (60s). Caso real: #217 cancelado pero
 * "Activos ahora: 1" en pantalla por minutos.
 *
 * Ahora: el hook NO mantiene estado. Devuelve directo el `initial` del
 * servidor y al recibir cualquier socket event invalida el query del
 * dashboard, forzando un refetch inmediato. La data del servidor SIEMPRE
 * gana — no hay forma de que UI y backend queden desincronizados.
 */
export function useDashboardStats(initial: DashboardStats) {
  const qc = useQueryClient();

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;

    const socket = getSocket(token, "admin");
    if (!socket.connected) socket.connect();

    const refresh = () => {
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    };

    socket.on("order:new", refresh);
    socket.on("order:status", refresh);

    return () => {
      socket.off("order:new", refresh);
      socket.off("order:status", refresh);
    };
  }, [qc]);

  return initial;
}
