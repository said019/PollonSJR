import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@pollon/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let currentAuth: { token?: string; role?: string } = {};

export function getSocket(
  token?: string,
  role?: "admin" | "customer"
): Socket<ServerToClientEvents, ClientToServerEvents> {
  // If auth changed, disconnect and recreate
  if (socket && (currentAuth.token !== token || currentAuth.role !== role)) {
    socket.disconnect();
    socket = null;
  }

  if (!socket) {
    currentAuth = { token, role };
    socket = io(API_URL, {
      auth: { token, role },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      console.log("Socket connected:", socket?.id);
    });

    socket.on("disconnect", (reason) => {
      console.warn("Socket disconnected:", reason);
      if (reason === "io server disconnect") {
        socket?.connect();
      }
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
    });
  }

  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  currentAuth = {};
}
