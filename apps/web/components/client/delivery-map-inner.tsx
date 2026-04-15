"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Loader2 } from "lucide-react";

const CLIENT_ICON = L.divIcon({
  html: `<div style="
    width:20px;height:20px;
    background:#F07820;
    border-radius:50%;
    border:3px solid #fff;
    box-shadow:0 2px 10px rgba(240,120,32,.6)
  "></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  className: "",
});

const STORE_POS: [number, number] = [
  parseFloat(process.env.NEXT_PUBLIC_STORE_LAT || "20.5881"),
  parseFloat(process.env.NEXT_PUBLIC_STORE_LNG || "-99.9953"),
];

interface DeliveryResult {
  available: boolean;
  fee?: number;
  feeMXN?: string;
  zoneName?: string;
  zoneId?: string;
  distanceKm?: number;
  estimatedMinutes?: number;
  reason?: string;
}

interface Props {
  onDeliveryChange: (result: DeliveryResult, lat: number, lng: number) => void;
}

export function DeliveryMapInner({ onDeliveryChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<DeliveryResult | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onDeliveryChangeRef = useRef(onDeliveryChange);
  const handleMoveRef = useRef<(lat: number, lng: number) => void>(() => {});
  const deliveryRequestRef = useRef(0);
  const addressRequestRef = useRef(0);

  useEffect(() => {
    onDeliveryChangeRef.current = onDeliveryChange;
  }, [onDeliveryChange]);

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    const requestId = ++addressRequestRef.current;

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`
      );
      const data = await res.json();
      const a = data.address;
      const addr = [a?.road, a?.house_number, a?.suburb || a?.city_district]
        .filter(Boolean)
        .join(" ");

      if (requestId === addressRequestRef.current) {
        setAddress(addr || data.display_name || "");
      }
    } catch {
      if (requestId === addressRequestRef.current) {
        setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    }
  }, []);

  const calculate = useCallback(async (lat: number, lng: number) => {
    const requestId = ++deliveryRequestRef.current;
    setLoading(true);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ""}/api/delivery/calculate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng }),
        }
      );
      const data: DeliveryResult = await res.json();

      if (requestId !== deliveryRequestRef.current) return;

      setResult(data);
      if (typeof onDeliveryChangeRef.current === "function") {
        onDeliveryChangeRef.current(data, lat, lng);
      }
      void reverseGeocode(lat, lng);
    } catch {
      if (requestId === deliveryRequestRef.current) {
        setResult(null);
      }
    } finally {
      if (requestId === deliveryRequestRef.current) {
        setLoading(false);
      }
    }
  }, [reverseGeocode]);

  const placeMarker = useCallback((lat: number, lng: number, centerMap = false) => {
    const map = mapRef.current;
    if (!map) return;

    const position: [number, number] = [lat, lng];

    if (!markerRef.current) {
      const marker = L.marker(position, {
        icon: CLIENT_ICON,
        draggable: true,
      }).addTo(map);

      marker.on("dragend", () => {
        const point = marker.getLatLng();
        handleMoveRef.current(point.lat, point.lng);
      });

      markerRef.current = marker;
    } else {
      markerRef.current.setLatLng(position);
    }

    if (centerMap) {
      map.setView(position, 15);
    } else {
      map.panTo(position);
    }
  }, []);

  const handleMove = useCallback(
    (lat: number, lng: number) => {
      placeMarker(lat, lng);
      void calculate(lat, lng);
    },
    [calculate, placeMarker]
  );

  useEffect(() => {
    handleMoveRef.current = handleMove;
  }, [handleMove]);

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current).setView(STORE_POS, 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    map.on("click", (event: L.LeafletMouseEvent) => {
      handleMoveRef.current(event.latlng.lat, event.latlng.lng);
    });

    mapRef.current = map;
    const invalidateTimer = window.setTimeout(() => map.invalidateSize(), 0);

    return () => {
      window.clearTimeout(invalidateTimer);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const selectLocation = (lat: number, lng: number) => {
      if (cancelled) return;
      placeMarker(lat, lng, true);
      void calculate(lat, lng);
    };

    if (!navigator.geolocation) {
      selectLocation(STORE_POS[0], STORE_POS[1]);
      return () => {
        cancelled = true;
      };
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => selectLocation(pos.coords.latitude, pos.coords.longitude),
      () => selectLocation(STORE_POS[0], STORE_POS[1]),
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 8_000 }
    );

    return () => {
      cancelled = true;
    };
  }, [calculate, placeMarker]);

  return (
    <div className="space-y-3">
      <div
        ref={mapContainerRef}
        style={{ height: "280px", borderRadius: "10px" }}
        className="z-0 w-full overflow-hidden"
      />

      {address && (
        <p className="text-xs text-on-surface-variant bg-surface-container-high p-2 rounded-lg truncate">
          <MapPin size={12} className="inline mr-1" />
          {address}
        </p>
      )}

      <p className="text-xs text-on-surface-variant">
        Arrastra el pin o haz clic en tu puerta exacta
      </p>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-primary">
          <Loader2 size={14} className="animate-spin" /> Calculando costo de envío...
        </div>
      )}

      {result && !loading && (
        <div
          className={`p-3 rounded-xl text-sm ${
            result.available
              ? "bg-green-50 border border-green-200"
              : "bg-red-50 border border-red-200"
          }`}
        >
          {result.available ? (
            <div className="space-y-1">
              <p className="font-semibold text-green-800">
                Envío a {result.zoneName}: {result.feeMXN}
              </p>
              <p className="text-green-600">
                {result.distanceKm} km · ~{result.estimatedMinutes} min
              </p>
            </div>
          ) : (
            <p className="font-semibold text-red-700">
              {result.reason || "No llegamos a tu zona"} ({result.distanceKm} km)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
