"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
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

function DraggablePin({
  position,
  onMove,
}: {
  position: [number, number] | null;
  onMove: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });

  if (!position) return null;

  return (
    <Marker
      position={position}
      icon={CLIENT_ICON}
      draggable
      eventHandlers={{
        dragend(e) {
          const p = e.target.getLatLng();
          onMove(p.lat, p.lng);
        },
      }}
    />
  );
}

export function DeliveryMapInner({ onDeliveryChange }: Props) {
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<DeliveryResult | null>(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const p: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setMarkerPos(p);
        calculate(p[0], p[1]);
      },
      () => {
        setMarkerPos(STORE_POS);
        calculate(STORE_POS[0], STORE_POS[1]);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function calculate(lat: number, lng: number) {
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
      setResult(data);
      onDeliveryChange(data, lat, lng);
      reverseGeocode(lat, lng);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function reverseGeocode(lat: number, lng: number) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`
      );
      const data = await res.json();
      const a = data.address;
      const addr = [a?.road, a?.house_number, a?.suburb || a?.city_district]
        .filter(Boolean)
        .join(" ");
      setAddress(addr || data.display_name || "");
    } catch {
      setAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    }
  }

  function handleMove(lat: number, lng: number) {
    setMarkerPos([lat, lng]);
    calculate(lat, lng);
  }

  return (
    <div className="space-y-3">
      <MapContainer
        center={markerPos || STORE_POS}
        zoom={15}
        style={{ height: "280px", borderRadius: "10px" }}
        className="z-0"
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <DraggablePin position={markerPos} onMove={handleMove} />
      </MapContainer>

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
