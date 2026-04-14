import type { LoyaltyTierType } from "@pollon/types";

/** 1 punto por cada $10 MXN gastados (el monto viene en centavos) */
export function calculatePoints(totalCents: number): number {
  return Math.floor(totalCents / 1000);
}

/** Determina el tier basado en puntos acumulados */
export function getTier(points: number): LoyaltyTierType {
  if (points >= 300) return "VIP_POLLON";
  if (points >= 100) return "CRUJIENTE";
  return "POLLITO";
}

/** Puntos que faltan para el siguiente tier. 0 si ya es VIP. */
export function pointsToNextTier(points: number): number {
  if (points >= 300) return 0;
  if (points >= 100) return 300 - points;
  return 100 - points;
}
