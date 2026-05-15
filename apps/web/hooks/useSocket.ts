"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { getSocket } from "@/lib/socket";
import type { ServerToClientEvents } from "@pollon/types";

type EventName = keyof ServerToClientEvents;

export function useSocket<E extends EventName>(
  event: E,
  handler: ServerToClientEvents[E],
  opts?: { token?: string; role?: "admin" | "customer" | "driver" }
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket(opts?.token, opts?.role);

    if (!socket.connected) {
      socket.connect();
    }

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    setConnected(socket.connected);

    const wrapped = (...args: any[]) => {
      (handlerRef.current as any)(...args);
    };

    // @ts-expect-error – event is a valid key but TS can't narrow the union
    socket.on(event, wrapped);

    return () => {
      // @ts-expect-error – same as above
      socket.off(event, wrapped);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [event, opts?.token, opts?.role]);

  const emit = useCallback(
    (eventName: string, data?: unknown) => {
      const socket = getSocket(opts?.token, opts?.role);
      socket.emit(eventName as any, data as any);
    },
    [opts?.token, opts?.role]
  );

  return { emit, connected };
}
