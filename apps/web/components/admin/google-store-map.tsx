"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleMap, Marker, Circle, useJsApiLoader, Autocomplete } from "@react-google-maps/api";
import { Search, Navigation, Loader2 } from "lucide-react";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
const LIBRARIES: ("places")[] = ["places"];

interface Zone {
  id?: string;
  name: string;
  minKm: number;
  maxKm: number;
  fee: number;
  color: string;
  active: boolean;
  sortOrder: number;
}

interface StoreLocationMapProps {
  lat: number;
  lng: number;
  address: string;
  onChange: (lat: number, lng: number, address: string) => void;
  height?: number;
}

/**
 * Small editable Google Map for the store location.
 * Includes drag + click + "My location" + Places Autocomplete search.
 */
export function StoreLocationMap({ lat, lng, address, onChange, height = 280 }: StoreLocationMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
    language: "es",
    region: "MX",
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  const handleDragEnd = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const newLat = e.latLng.lat();
      const newLng = e.latLng.lng();
      reverseGeocode(newLat, newLng);
    },
    []
  );

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return;
    const newLat = e.latLng.lat();
    const newLng = e.latLng.lng();
    reverseGeocode(newLat, newLng);
  }, []);

  const reverseGeocode = useCallback(
    async (newLat: number, newLng: number) => {
      setGeocoding(true);
      try {
        if (typeof google !== "undefined" && google.maps?.Geocoder) {
          const geocoder = new google.maps.Geocoder();
          const result = await geocoder.geocode({
            location: { lat: newLat, lng: newLng },
            language: "es",
            region: "MX",
          });
          const addr = result.results[0]?.formatted_address || `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`;
          onChange(newLat, newLng, addr);
        } else {
          onChange(newLat, newLng, `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`);
        }
      } catch {
        onChange(newLat, newLng, `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`);
      } finally {
        setGeocoding(false);
      }
    },
    [onChange]
  );

  const handlePlaceChanged = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    if (place?.geometry?.location) {
      const newLat = place.geometry.location.lat();
      const newLng = place.geometry.location.lng();
      const addr = place.formatted_address || place.name || `${newLat.toFixed(6)}, ${newLng.toFixed(6)}`;
      onChange(newLat, newLng, addr);
      mapRef.current?.panTo({ lat: newLat, lng: newLng });
      mapRef.current?.setZoom(17);
    }
  }, [onChange]);

  const handleMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setGeocoding(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        mapRef.current?.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        mapRef.current?.setZoom(17);
      },
      () => setGeocoding(false),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [reverseGeocode]);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-outline-variant/40 bg-surface-container text-center p-4"
        style={{ height }}
      >
        <p className="text-sm text-on-surface-variant">
          Google Maps API key no configurada.
        </p>
        <p className="text-xs text-on-surface-variant/60">
          Configura <code className="text-primary">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> en Railway.
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-error/30 bg-error-container/20 text-error text-sm"
        style={{ height }}
      >
        Error cargando Google Maps
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div
        className="flex items-center justify-center rounded-lg bg-surface-container"
        style={{ height }}
      >
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Search bar with autocomplete */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/60 pointer-events-none"
          />
          <Autocomplete
            onLoad={(ac) => (autocompleteRef.current = ac)}
            onPlaceChanged={handlePlaceChanged}
            options={{
              componentRestrictions: { country: "mx" },
              fields: ["geometry", "formatted_address", "name"],
            }}
          >
            <input
              type="text"
              placeholder="Buscar dirección en México..."
              className="w-full pl-9 pr-3 py-2.5 bg-surface-container-high border border-outline-variant text-on-surface rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary placeholder:text-on-surface-variant/40"
            />
          </Autocomplete>
        </div>
        <button
          type="button"
          onClick={handleMyLocation}
          title="Mi ubicación"
          className="px-3 py-2 bg-primary/15 border border-primary/30 text-primary rounded-lg hover:bg-primary/25 transition-colors flex items-center gap-1.5 text-xs font-headline font-bold"
        >
          <Navigation size={13} />
          GPS
        </button>
      </div>

      {/* Map */}
      <div style={{ height }} className="rounded-lg overflow-hidden border border-outline-variant/30 relative">
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "100%" }}
          center={{ lat, lng }}
          zoom={16}
          onLoad={(map) => {
            mapRef.current = map;
          }}
          onClick={handleMapClick}
          options={{
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            zoomControl: true,
            gestureHandling: "greedy",
            styles: [
              { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
              { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
              { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
              { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
              { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
              { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
              { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
              { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
              { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
              { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
            ],
          }}
        >
          <Marker
            position={{ lat, lng }}
            draggable
            onDragEnd={handleDragEnd}
          />
        </GoogleMap>
        {geocoding && (
          <div className="absolute top-2 right-2 bg-surface/90 backdrop-blur px-2 py-1 rounded-md text-xs text-on-surface flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" />
            Buscando dirección...
          </div>
        )}
      </div>

      <p className="text-xs text-on-surface-variant truncate">
        {address || "Arrastra el pin o busca una dirección"}
      </p>
      <div className="flex gap-3 text-xs text-on-surface-variant">
        <span>Lat: {lat.toFixed(6)}</span>
        <span>Lng: {lng.toFixed(6)}</span>
      </div>
    </div>
  );
}

interface CoverageMapProps {
  storeLat: number;
  storeLng: number;
  zones: Zone[];
  testMode?: boolean;
  onTestClick?: (lat: number, lng: number) => void;
  testMarker?: { lat: number; lng: number } | null;
  height?: number;
}

/**
 * Large coverage map showing store + zone circles.
 */
export function CoverageMap({
  storeLat,
  storeLng,
  zones,
  testMode = false,
  onTestClick,
  testMarker,
  height = 500,
}: CoverageMapProps) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
    language: "es",
    region: "MX",
  });

  const handleClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      if (!testMode || !onTestClick || !e.latLng) return;
      onTestClick(e.latLng.lat(), e.latLng.lng());
    },
    [testMode, onTestClick]
  );

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-outline-variant/40 bg-surface-container text-center p-4"
        style={{ height }}
      >
        <p className="text-sm text-on-surface-variant">Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-surface-container"
        style={{ height }}
      >
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div
      style={{ height, cursor: testMode ? "crosshair" : undefined }}
      className="rounded-xl overflow-hidden border border-outline-variant/30"
    >
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={{ lat: storeLat, lng: storeLng }}
        zoom={13}
        onClick={handleClick}
        options={{
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        }}
      >
        <Marker position={{ lat: storeLat, lng: storeLng }} />
        {zones
          .filter((z) => z.active)
          .map((zone, i) => (
            <Circle
              key={zone.id || i}
              center={{ lat: storeLat, lng: storeLng }}
              radius={zone.maxKm * 1000}
              options={{
                fillColor: zone.color,
                fillOpacity: 0.08,
                strokeColor: zone.color,
                strokeOpacity: 0.6,
                strokeWeight: 2,
              }}
            />
          ))}
        {testMarker && (
          <Marker
            position={{ lat: testMarker.lat, lng: testMarker.lng }}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: "#F97316",
              fillOpacity: 1,
              strokeColor: "#fff",
              strokeWeight: 2,
            }}
          />
        )}
      </GoogleMap>
    </div>
  );
}
