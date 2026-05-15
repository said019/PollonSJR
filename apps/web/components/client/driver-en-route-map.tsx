"use client";

import { useEffect, useRef, useState } from "react";
import { GoogleMap, OverlayView, useJsApiLoader } from "@react-google-maps/api";
import { useSocket } from "@/hooks/useSocket";
import { getToken } from "@/lib/auth";
import { Bike, Loader2, MapPin, Phone, Truck } from "lucide-react";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

interface DriverInfo {
  id: string;
  name: string;
  phone: string | null;
  photoUrl: string | null;
  vehicle: string | null;
  lat: number | null;
  lng: number | null;
  locationUpdatedAt: string | null;
}

/**
 * Mini-mapa que muestra:
 *  - El pin del repartidor en tiempo real (vía socket "driver:location" filtrado por orderId)
 *  - El pin del destino (cliente)
 *  - Datos del repartidor (nombre, vehículo, llamar)
 *
 * Sólo el backend emite "driver:location" al room del cliente cuando el pedido
 * está en estado ON_THE_WAY, así que no necesitamos filtrar adicionalmente.
 */
export function DriverEnRouteMap({
  orderId,
  driver,
  destinationLat,
  destinationLng,
  destinationAddress,
}: {
  orderId: string;
  driver: DriverInfo | null;
  destinationLat: number | null;
  destinationLng: number | null;
  destinationAddress: string | null;
}) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    language: "es",
    region: "MX",
  });

  const [driverPos, setDriverPos] = useState<{ lat: number; lng: number } | null>(
    driver?.lat && driver?.lng ? { lat: driver.lat, lng: driver.lng } : null
  );
  const [heading, setHeading] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(
    driver?.locationUpdatedAt || null
  );

  const customerToken = typeof window !== "undefined" ? getToken() : null;

  useSocket(
    "driver:location",
    (data) => {
      if (data.orderId !== orderId) return;
      setDriverPos({ lat: data.lat, lng: data.lng });
      if (typeof data.heading === "number") setHeading(data.heading);
      setUpdatedAt(data.ts);
    },
    { token: customerToken || undefined, role: "customer" }
  );

  // Sin repartidor asignado aún
  if (!driver) {
    return (
      <div className="mb-5 rounded-2xl border border-outline-variant/15 bg-surface-container p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Bike size={17} />
          </div>
          <div>
            <p className="font-headline text-sm font-bold text-tertiary">
              Asignando repartidor…
            </p>
            <p className="text-[11px] text-on-surface-variant">
              Pronto verás dónde viene tu pedido en el mapa.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const center = driverPos
    ? driverPos
    : destinationLat && destinationLng
      ? { lat: destinationLat, lng: destinationLng }
      : { lat: 20.5881, lng: -99.9953 };

  const ago = updatedAt
    ? Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000)
    : null;

  return (
    <div className="mb-5 overflow-hidden rounded-2xl border border-outline-variant/15 bg-surface-container">
      {/* Driver header */}
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 font-headline text-base font-bold text-primary">
          {driver.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={driver.photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            driver.name.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-headline text-sm font-bold text-tertiary">
            {driver.name}
          </p>
          <p className="truncate text-[11px] text-on-surface-variant">
            {driver.vehicle || "En camino"}
            {ago !== null && (
              <span className="ml-1 text-emerald-400">· hace {ago}s</span>
            )}
          </p>
        </div>
        {driver.phone && (
          <a
            href={`tel:${driver.phone}`}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-emerald-500/25"
            aria-label="Llamar al repartidor"
          >
            <Phone size={12} />
            Llamar
          </a>
        )}
      </div>

      {/* Map */}
      <div className="relative border-t border-outline-variant/10">
        {!isLoaded ? (
          <div className="flex h-56 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : !driverPos ? (
          <div className="flex h-32 items-center justify-center gap-2 text-xs text-on-surface-variant">
            <MapPin size={13} />
            Esperando primera ubicación del repartidor…
          </div>
        ) : (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: 240 }}
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
            <SmoothDriverPin lat={driverPos.lat} lng={driverPos.lng} heading={heading} />
            {destinationLat !== null && destinationLng !== null && (
              <OverlayView
                position={{ lat: destinationLat, lng: destinationLng }}
                mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
                getPixelPositionOffset={(w, h) => ({ x: -(w / 2), y: -(h / 2) })}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md ring-2 ring-white">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 2 3 11h2v9h5v-6h4v6h5v-9h2L12 2z" />
                  </svg>
                </div>
              </OverlayView>
            )}
          </GoogleMap>
        )}
      </div>

      {destinationAddress && (
        <div className="flex items-start gap-2 border-t border-outline-variant/10 px-4 py-2.5 text-[11px]">
          <Truck size={12} className="mt-0.5 flex-shrink-0 text-on-surface-variant" />
          <span className="text-on-surface-variant">{destinationAddress}</span>
        </div>
      )}

      <style jsx global>{`
        @keyframes pollon-driver-pulse-client {
          0% { transform: scale(0.6); opacity: 0.55; }
          80% { opacity: 0; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes pollon-driver-pop-client {
          from { transform: scale(0.85); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .pollon-pin-client { animation: pollon-driver-pop-client 320ms cubic-bezier(0.23,1,0.32,1) backwards; }
        @media (prefers-reduced-motion: reduce) {
          .pollon-pin-client { animation: none; }
          .pollon-pulse-client { animation: none !important; display: none; }
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── */
/*  SmoothDriverPin — pin con interpolación + pulse + heading   */
/* ──────────────────────────────────────────────────────────── */

function SmoothDriverPin({
  lat,
  lng,
  heading,
}: {
  lat: number;
  lng: number;
  heading: number | null;
}) {
  const [displayed, setDisplayed] = useState({ lat, lng });
  const startRef = useRef({ lat, lng, t: Date.now() });
  const targetRef = useRef({ lat, lng });

  useEffect(() => {
    startRef.current = { ...displayed, t: Date.now() };
    targetRef.current = { lat, lng };
    let raf = 0;
    const tick = () => {
      const elapsed = Date.now() - startRef.current.t;
      const p = Math.min(1, elapsed / 9000);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  return (
    <OverlayView
      position={displayed}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
      getPixelPositionOffset={(w, h) => ({ x: -(w / 2), y: -(h / 2) })}
    >
      <div className="pollon-pin-client">
        <div
          className="relative flex h-10 w-10 items-center justify-center"
          style={{
            transform: heading !== null ? `rotate(${heading}deg)` : undefined,
            transition: "transform 800ms cubic-bezier(0.77, 0, 0.175, 1)",
          }}
        >
          <span
            className="pollon-pulse-client absolute inset-0 rounded-full bg-orange-500"
            style={{
              animation:
                "pollon-driver-pulse-client 2.4s cubic-bezier(0.4,0,0.6,1) infinite",
            }}
          />
          <span
            className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full text-white"
            style={{
              background:
                "linear-gradient(180deg, #FF8A3D 0%, #F07820 60%, #DC5A0E 100%)",
              boxShadow:
                "0 6px 16px rgba(240,120,32,0.55), 0 0 0 2px white, 0 0 0 3px rgba(0,0,0,0.15)",
              transform:
                heading !== null ? `rotate(${-heading}deg)` : undefined,
            }}
          >
            <Bike size={16} strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </OverlayView>
  );
}
