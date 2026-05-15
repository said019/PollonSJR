"use client";

import { useEffect, useMemo, useState } from "react";
import { GoogleMap, Marker, InfoWindow, useJsApiLoader } from "@react-google-maps/api";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { useSocket } from "@/hooks/useSocket";
import { Bike, Loader2, MapPin, RefreshCw, WifiOff } from "lucide-react";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

interface DriverPin {
  id: string;
  name: string;
  phone: string | null;
  vehicle: string | null;
  photoUrl: string | null;
  lat: number;
  lng: number;
  locationUpdatedAt: string | null;
}

const DEFAULT_CENTER = { lat: 20.5881, lng: -99.9953 }; // SJR

export function LiveDriversMap() {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    language: "es",
    region: "MX",
  });

  // Initial snapshot — also refetch periodicamente como fallback si el socket cae.
  const { data: snapshot = [], refetch } = useQuery({
    queryKey: ["admin-drivers-active-snapshot"],
    queryFn: () =>
      api.get<DriverPin[]>(
        "/api/admin/drivers/active",
        getAdminToken() || undefined
      ),
    refetchInterval: 60_000,
  });

  // Mantén el estado vivo en un mapa por driverId — los socket events
  // actualizan en O(1) y la UI se rerenderea sólo lo que cambia.
  const [byId, setById] = useState<Map<string, DriverPin>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setById((prev) => {
      const next = new Map(prev);
      for (const d of snapshot) next.set(d.id, d);
      return next;
    });
  }, [snapshot]);

  const adminToken = typeof window !== "undefined" ? getAdminToken() : null;
  const socketAuth = { token: adminToken || undefined, role: "admin" as const };

  useSocket(
    "driver:location",
    (data) => {
      setById((prev) => {
        const next = new Map(prev);
        const existing = next.get(data.driverId);
        next.set(data.driverId, {
          id: data.driverId,
          name: data.driverName || existing?.name || "Repartidor",
          phone: existing?.phone ?? null,
          vehicle: existing?.vehicle ?? null,
          photoUrl: existing?.photoUrl ?? null,
          lat: data.lat,
          lng: data.lng,
          locationUpdatedAt: data.ts,
        });
        return next;
      });
    },
    socketAuth
  );

  useSocket(
    "driver:offline",
    (data) => {
      setById((prev) => {
        const next = new Map(prev);
        next.delete(data.driverId);
        return next;
      });
      if (selected === data.driverId) setSelected(null);
    },
    socketAuth
  );

  const drivers = useMemo(() => Array.from(byId.values()), [byId]);

  const center = drivers.length > 0
    ? { lat: drivers[0].lat, lng: drivers[0].lng }
    : DEFAULT_CENTER;

  if (loadError) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-error/30 bg-error/5 text-sm text-error">
        Error cargando el mapa de Google
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-outline-variant/15 bg-surface-container">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/15 bg-surface-container">
      <div className="flex items-center justify-between gap-2 border-b border-outline-variant/10 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Bike size={14} className="text-primary" />
          <h3 className="font-headline text-xs font-bold uppercase tracking-wider text-tertiary">
            Repartidores en vivo
          </h3>
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
            {drivers.length}
          </span>
        </div>
        <button
          onClick={() => refetch()}
          className="rounded-lg border border-outline-variant/20 p-1.5 text-on-surface-variant hover:border-primary/40 hover:text-primary"
          aria-label="Refrescar"
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {drivers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <WifiOff size={22} className="text-on-surface-variant/40" />
          <p className="text-xs text-on-surface-variant">
            Nadie en turno con GPS activo.
          </p>
        </div>
      ) : (
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: 320 }}
          center={center}
          zoom={13}
          options={{
            disableDefaultUI: true,
            zoomControl: true,
            clickableIcons: false,
            styles: [
              { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
            ],
          }}
        >
          {drivers.map((d) => (
            <Marker
              key={d.id}
              position={{ lat: d.lat, lng: d.lng }}
              onClick={() => setSelected(d.id)}
              icon={{
                path: "M -12,-8 L 12,-8 L 12,8 L -12,8 Z",
                fillColor: "#F07820",
                fillOpacity: 1,
                strokeColor: "#fff",
                strokeWeight: 2,
                scale: 1,
              }}
              label={{
                text: "🛵",
                fontSize: "16px",
              }}
            >
              {selected === d.id && (
                <InfoWindow onCloseClick={() => setSelected(null)}>
                  <div style={{ color: "#1e293b", fontFamily: "system-ui", minWidth: 160 }}>
                    <p style={{ fontWeight: 700, fontSize: 13 }}>{d.name}</p>
                    {d.vehicle && (
                      <p style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                        {d.vehicle}
                      </p>
                    )}
                    {d.locationUpdatedAt && (
                      <p style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
                        {timeAgo(d.locationUpdatedAt)}
                      </p>
                    )}
                  </div>
                </InfoWindow>
              )}
            </Marker>
          ))}
        </GoogleMap>
      )}
    </div>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `Hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `Hace ${m} min`;
  const h = Math.floor(m / 60);
  return `Hace ${h}h`;
}
