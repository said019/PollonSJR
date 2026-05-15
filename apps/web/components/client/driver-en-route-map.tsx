"use client";

import { useEffect, useState } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
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
  const [updatedAt, setUpdatedAt] = useState<string | null>(
    driver?.locationUpdatedAt || null
  );

  const customerToken = typeof window !== "undefined" ? getToken() : null;

  useSocket(
    "driver:location",
    (data) => {
      if (data.orderId !== orderId) return;
      setDriverPos({ lat: data.lat, lng: data.lng });
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
            <Marker
              position={driverPos}
              icon={{
                path: "M -12,-8 L 12,-8 L 12,8 L -12,8 Z",
                fillColor: "#F07820",
                fillOpacity: 1,
                strokeColor: "#fff",
                strokeWeight: 2,
                scale: 1,
              }}
              label={{ text: "🛵", fontSize: "16px" }}
            />
            {destinationLat !== null && destinationLng !== null && (
              <Marker
                position={{ lat: destinationLat, lng: destinationLng }}
                icon={{
                  path: "M 0 0 m -10 0 a 10 10 0 1 0 20 0 a 10 10 0 1 0 -20 0",
                  fillColor: "#22c55e",
                  fillOpacity: 1,
                  strokeColor: "#fff",
                  strokeWeight: 2,
                  scale: 1,
                }}
                label={{ text: "🏠", fontSize: "14px" }}
              />
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
    </div>
  );
}
