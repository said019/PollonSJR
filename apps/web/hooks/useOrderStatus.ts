"use client";

import { useEffect, useState } from "react";
import { getSocket } from "@/lib/socket";
import type { OrderStatusType } from "@pollon/types";

const STATUS_MESSAGES: Record<OrderStatusType, string> = {
  PENDING_PAYMENT: "Esperando confirmación de pago...",
  SCHEDULED: "Pedido programado para más tarde.",
  RECEIVED: "¡Pedido recibido! Lo están revisando.",
  PREPARING: "Tu pollo está en la freidora",
  READY: "¡Listo para recoger!",
  ON_THE_WAY: "Tu repartidor ya va en camino",
  DELIVERED: "¡Buen provecho!",
  CANCELLED: "Pedido cancelado.",
};

interface OrderState {
  status: OrderStatusType;
  message: string;
  estimatedMinutes?: number;
}

export function useOrderStatus(
  orderId: string,
  customerToken: string,
  initialStatus: OrderStatusType
) {
  const [state, setState] = useState<OrderState>({
    status: initialStatus,
    message: STATUS_MESSAGES[initialStatus] ?? "Procesando...",
  });

  useEffect(() => {
    const socket = getSocket(customerToken, "customer");
    if (!socket.connected) socket.connect();

    const handleStatus = (data: {
      orderId: string;
      status: OrderStatusType;
      message?: string;
      estimatedMinutes?: number;
    }) => {
      if (data.orderId !== orderId) return;
      setState({
        status: data.status,
        message: data.message || STATUS_MESSAGES[data.status] || "Estado actualizado",
        estimatedMinutes: data.estimatedMinutes,
      });
    };

    const handleRejected = (data: { orderNumber: number; message: string }) => {
      setState({
        status: "CANCELLED",
        message: data.message,
      });
    };

    socket.on("order:status", handleStatus);
    socket.on("order:rejected", handleRejected);

    return () => {
      socket.off("order:status", handleStatus);
      socket.off("order:rejected", handleRejected);
    };
  }, [orderId, customerToken]);

  return state;
}
