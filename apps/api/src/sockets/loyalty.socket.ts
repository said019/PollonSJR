import { Server } from "socket.io";
import type { ServerToClientEvents, ClientToServerEvents } from "@pollon/types";

export function registerLoyaltySockets(
  io: Server<ClientToServerEvents, ServerToClientEvents>
) {
  // Loyalty events are emitted from LoyaltyService directly
  // This file exists for any additional loyalty-specific socket logic
}
