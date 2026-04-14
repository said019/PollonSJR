"use client";

import { useState } from "react";

interface DeliveryState {
  available: boolean | null;
  fee: number;
  feeMXN: string;
  zoneName: string;
  zoneId: string;
  distanceKm: number;
  estimatedMinutes: number;
  reason: string;
  lat: number | null;
  lng: number | null;
}

const INITIAL: DeliveryState = {
  available: null,
  fee: 0,
  feeMXN: "",
  zoneName: "",
  zoneId: "",
  distanceKm: 0,
  estimatedMinutes: 0,
  reason: "",
  lat: null,
  lng: null,
};

export function useDelivery() {
  const [delivery, setDelivery] = useState<DeliveryState>(INITIAL);

  function onDeliveryChange(result: any, lat: number, lng: number) {
    setDelivery({
      available: result.available,
      fee: result.fee ?? 0,
      feeMXN: result.feeMXN ?? "",
      zoneName: result.zoneName ?? "",
      zoneId: result.zoneId ?? "",
      distanceKm: result.distanceKm ?? 0,
      estimatedMinutes: result.estimatedMinutes ?? 0,
      reason: result.reason ?? "",
      lat,
      lng,
    });
  }

  function reset() {
    setDelivery(INITIAL);
  }

  return { delivery, onDeliveryChange, reset };
}
