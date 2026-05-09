import { haversineKm } from "./haversine";

interface DeliveryZone {
  id: string;
  name: string;
  minKm: number;
  maxKm: number;
  fee: number;
  startTime?: string | null;
  endTime?: string | null;
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
  zoneStartTime?: string | null;
  zoneEndTime?: string | null;
  outsideTimeWindow?: boolean;
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

  // Check if zone has a time window and we're outside it
  let outsideTimeWindow = false;
  if (zone.startTime || zone.endTime) {
    const nowMx = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" })
    );
    const nowHHMM = `${String(nowMx.getHours()).padStart(2, "0")}:${String(
      nowMx.getMinutes()
    ).padStart(2, "0")}`;
    const start = zone.startTime ?? "00:00";
    const end = zone.endTime ?? "23:59";
    if (start <= end) {
      if (nowHHMM < start || nowHHMM > end) outsideTimeWindow = true;
    } else if (nowHHMM < start && nowHHMM > end) {
      outsideTimeWindow = true;
    }
  }

  return {
    available: true,
    fee: zone.fee,
    feeMXN: `$${zone.fee / 100}`,
    zoneName: zone.name,
    zoneId: zone.id,
    distanceKm: rounded,
    estimatedMinutes,
    zoneStartTime: zone.startTime ?? null,
    zoneEndTime: zone.endTime ?? null,
    outsideTimeWindow,
  };
}
