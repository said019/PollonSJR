"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, OverlayView, InfoWindow, useJsApiLoader } from "@react-google-maps/api";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { useSocket } from "@/hooks/useSocket";
import { Bike, Loader2, RefreshCw, WifiOff } from "lucide-react";

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
  heading?: number | null;
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
          heading: data.heading ?? existing?.heading ?? null,
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
          mapContainerClassName="w-full h-[420px] sm:h-[520px] md:h-[600px]"
          center={center}
          zoom={14}
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
            <DriverMapPin
              key={d.id}
              driver={d}
              isSelected={selected === d.id}
              onClick={() => setSelected(d.id)}
              onCloseInfo={() => setSelected(null)}
            />
          ))}
        </GoogleMap>
      )}

      <style jsx global>{`
        @keyframes pollon-driver-pulse {
          0% {
            transform: scale(0.6);
            opacity: 0.55;
          }
          80% {
            opacity: 0;
          }
          100% {
            transform: scale(2.4);
            opacity: 0;
          }
        }
        .pollon-driver-pin-wrap {
          /* Interrumpible: la posición la mueve OverlayView con top/left,
             pero el wrapper se queda en 0,0 dejando solo el pin animar. */
          will-change: transform;
        }
        .pollon-driver-pin {
          /* Entrada subtle: nunca desde scale(0) — nada nace de la nada. */
          animation: pollon-driver-pop 320ms cubic-bezier(0.23, 1, 0.32, 1) backwards;
        }
        @keyframes pollon-driver-pop {
          from {
            transform: scale(0.85);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        .pollon-driver-pin button {
          transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
        }
        .pollon-driver-pin button:active {
          transform: scale(0.92);
        }
        @media (prefers-reduced-motion: reduce) {
          .pollon-driver-pin {
            animation: none;
          }
          .pollon-driver-pulse {
            animation: none !important;
            display: none;
          }
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/*  DriverMapPin — pin custom con pulse + interpolación suave   */
/* ──────────────────────────────────────────────────────────── */

function DriverMapPin({
  driver,
  isSelected,
  onClick,
  onCloseInfo,
}: {
  driver: DriverPin;
  isSelected: boolean;
  onClick: () => void;
  onCloseInfo: () => void;
}) {
  // Interpolación cliente: en vez de teletransportar entre pings (cada 10s),
  // animamos suavemente la posición mostrada hacia la nueva con ease-out cubic.
  // Duración 9s para que el viaje termine justo antes del próximo ping y no
  // se acumule lag perceptible.
  const [displayed, setDisplayed] = useState({ lat: driver.lat, lng: driver.lng });
  const startRef = useRef({ lat: driver.lat, lng: driver.lng, t: Date.now() });
  const targetRef = useRef({ lat: driver.lat, lng: driver.lng });

  useEffect(() => {
    startRef.current = { ...displayed, t: Date.now() };
    targetRef.current = { lat: driver.lat, lng: driver.lng };

    let raf = 0;
    const tick = () => {
      const elapsed = Date.now() - startRef.current.t;
      const p = Math.min(1, elapsed / 9000);
      // ease-out cubic — fast inicio, settling al final
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayed({
        lat:
          startRef.current.lat +
          (targetRef.current.lat - startRef.current.lat) * eased,
        lng:
          startRef.current.lng +
          (targetRef.current.lng - startRef.current.lng) * eased,
      });
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // displayed se omite a propósito — sólo reaccionamos al target real
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver.lat, driver.lng]);

  const heading = typeof driver.heading === "number" ? driver.heading : null;

  return (
    <OverlayView
      position={displayed}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={(width, height) => ({
        x: -(width / 2),
        y: -(height / 2),
      })}
    >
      <div className="pollon-driver-pin-wrap pollon-driver-pin">
        <button
          onClick={onClick}
          aria-label={`Repartidor ${driver.name}`}
          className="relative flex h-10 w-10 items-center justify-center"
          style={{
            // Rotación si tenemos heading. transform-origin center.
            transform: heading !== null ? `rotate(${heading}deg)` : undefined,
            transition: "transform 800ms cubic-bezier(0.77, 0, 0.175, 1)",
          }}
        >
          {/* Pulse ring — calmo, infinito, ease-in-out */}
          <span
            className="pollon-driver-pulse absolute inset-0 rounded-full bg-primary"
            style={{
              animation:
                "pollon-driver-pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            }}
          />
          {/* Badge sólido */}
          <span
            className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full text-white shadow-lg"
            style={{
              background:
                "linear-gradient(180deg, #FF8A3D 0%, #F07820 60%, #DC5A0E 100%)",
              boxShadow:
                "0 6px 16px rgba(240,120,32,0.55), 0 0 0 2px white, 0 0 0 3px rgba(0,0,0,0.15)",
              // Contra-rotar para que el ícono no gire con el heading
              transform:
                heading !== null ? `rotate(${-heading}deg)` : undefined,
            }}
          >
            <Bike size={16} strokeWidth={2.5} />
          </span>
        </button>
      </div>

      {isSelected && (
        <InfoWindowAttached driver={driver} onClose={onCloseInfo} />
      )}
    </OverlayView>
  );
}

function InfoWindowAttached({
  driver,
  onClose,
}: {
  driver: DriverPin;
  onClose: () => void;
}) {
  // InfoWindow oficial de Google necesita ir como sibling al Marker.
  // Como ahora usamos OverlayView, levantamos un mini-tooltip propio.
  return (
    <div
      role="dialog"
      className="absolute left-1/2 -translate-x-1/2 -translate-y-full bottom-[calc(100%+10px)] min-w-[160px] rounded-xl bg-white px-3 py-2 shadow-xl"
      style={{ animation: "pollon-driver-pop 200ms cubic-bezier(0.23,1,0.32,1)" }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
        aria-label="Cerrar"
      >
        ×
      </button>
      <p className="font-headline text-sm font-bold text-neutral-900">
        {driver.name}
      </p>
      {driver.vehicle && (
        <p className="text-[11px] text-neutral-500">{driver.vehicle}</p>
      )}
      {driver.locationUpdatedAt && (
        <p className="mt-1 text-[10px] font-medium text-emerald-600">
          {timeAgo(driver.locationUpdatedAt)}
        </p>
      )}
      {/* Arrow */}
      <span className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-px h-0 w-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-white" />
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
