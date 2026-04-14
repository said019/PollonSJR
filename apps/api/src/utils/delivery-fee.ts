import { haversineKm } from "./haversine";

interface DeliveryZone {
  id: string;
  name: string;
  minKm: number;
  maxKm: number;
  fee: number;
}

export interface DeliveryResult {
  available: boolean;
  fee?: number;
  feeMXN?: string;
  zoneName?: string;
  zoneId?: string;
  distanceKm: number;
  estimatedMinutes?: number;
  reason?: string;
}

/** Calculate delivery fee based on Haversine distance from store to client */
export function calculateDeliveryFee(
  storeLat: number,
  storeLng: number,
  clientLat: number,
  clientLng: number,
  zones: DeliveryZone[]
): DeliveryResult {
  const distanceKm = haversineKm(storeLat, storeLng, clientLat, clientLng);
  const rounded = Math.round(distanceKm * 10) / 10;

  const zone = zones.find((z) => distanceKm >= z.minKm && distanceKm < z.maxKm);

  if (!zone) {
    return {
      available: false,
      reason: "Fuera de zona de entrega",
      distanceKm: rounded,
    };
  }

  const estimatedMinutes = Math.round(15 + distanceKm * 4);

  return {
    available: true,
    fee: zone.fee,
    feeMXN: `$${zone.fee / 100}`,
    zoneName: zone.name,
    zoneId: zone.id,
    distanceKm: rounded,
    estimatedMinutes,
  };
}
