import { Server } from "socket.io";
import type { ServerToClientEvents, ClientToServerEvents } from "@pollon/types";

export function registerOrderSockets(
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  // Room joins are now handled in socket.ts plugin via JWT auth.
  // This file is kept for any future order-specific socket handlers.
}
