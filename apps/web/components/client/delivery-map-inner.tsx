"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Briefcase, Crosshair, Home, Loader2, MapPin, Plus, Search, Star, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { CreateSavedAddressPayload, SavedAddressPublic } from "@pollon/types";

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
const STATIC_GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
const GOOGLE_MAPS_SCRIPT_ID = "pollon-google-maps";

type GoogleMapPosition = { lat: number; lng: number };
type GoogleLatLng = { lat: () => number; lng: () => number };
type GoogleMapMouseEvent = { latLng?: GoogleLatLng };
type GoogleGeocoderStatus = string;

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeocoderResult {
  address_components?: GoogleAddressComponent[];
  formatted_address: string;
  geometry: {
    location: GoogleLatLng;
  };
  place_id?: string;
}

interface GoogleGeocodeRequest {
  address?: string;
  componentRestrictions?: { country: string };
  location?: GoogleMapPosition;
  region?: string;
}

interface GoogleMapInstance {
  addListener: (
    eventName: string,
    handler: (event: GoogleMapMouseEvent) => void
  ) => unknown;
  panTo: (position: GoogleMapPosition) => void;
  setCenter: (position: GoogleMapPosition) => void;
  setZoom: (zoom: number) => void;
}

interface GoogleMarkerInstance {
  addListener: (
    eventName: string,
    handler: (event?: GoogleMapMouseEvent) => void
  ) => unknown;
  getPosition: () => GoogleLatLng | null;
  setMap: (map: GoogleMapInstance | null) => void;
  setPosition: (position: GoogleMapPosition) => void;
}

interface GoogleGeocoderInstance {
  geocode: (
    request: GoogleGeocodeRequest,
    callback: (
      results: GoogleGeocoderResult[] | null,
      status: GoogleGeocoderStatus
    ) => void
  ) => void;
}

interface GoogleMapsApi {
  maps: {
    event: {
      clearInstanceListeners: (instance: unknown) => void;
    };
    Geocoder: new () => GoogleGeocoderInstance;
    Map: new (
      element: HTMLElement,
      options: Record<string, unknown>
    ) => GoogleMapInstance;
    Marker: new (options: Record<string, unknown>) => GoogleMarkerInstance;
  };
}

declare global {
  interface Window {
    __pollonGoogleMapsPromise?: Promise<GoogleMapsApi>;
    __pollonGoogleMapsKey?: string;
    google?: GoogleMapsApi;
  }
}

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

interface AddressSuggestion {
  place_id: number | string;
  lat: number | string;
  lon: number | string;
  display_name: string;
  address?: {
    road?: string;
    house_number?: string;
    suburb?: string;
    neighbourhood?: string;
    city_district?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
  };
  source?: "google" | "osm";
}

interface Props {
  onDeliveryChange: (result: DeliveryResult, lat: number, lng: number) => void;
  onAddressChange?: (address: string) => void;
}

function buildSearchQuery(query: string) {
  if (/san juan|quer[eé]taro|qro/i.test(query)) return query;
  return `${query}, San Juan del Rio, Queretaro, Mexico`;
}

function suggestionTitle(suggestion: AddressSuggestion) {
  const a = suggestion.address;
  const title = [a?.road, a?.house_number].filter(Boolean).join(" ");
  return title || suggestion.display_name.split(",")[0] || "Ubicación encontrada";
}

function suggestionSubtitle(suggestion: AddressSuggestion) {
  const a = suggestion.address;
  if (!a) {
    return suggestion.display_name.split(",").slice(1, 4).join(",").trim();
  }
  const zone = a?.suburb || a?.neighbourhood || a?.city_district;
  const city = a?.city || a?.town || a?.village || a?.municipality;
  return [zone, city, a?.state].filter(Boolean).join(", ");
}

async function getGoogleMapsApiKey() {
  if (STATIC_GOOGLE_MAPS_API_KEY) return STATIC_GOOGLE_MAPS_API_KEY;

  try {
    const response = await fetch("/api/public-config", { cache: "no-store" });
    if (!response.ok) return "";
    const data = (await response.json()) as { googleMapsApiKey?: string };
    return data.googleMapsApiKey || "";
  } catch {
    return "";
  }
}

function loadGoogleMaps(apiKey: string) {
  if (!apiKey) {
    return Promise.reject(new Error("Google Maps API key is not configured"));
  }

  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps only loads in the browser"));
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google);
  }

  if (window.__pollonGoogleMapsPromise && window.__pollonGoogleMapsKey === apiKey) {
    return window.__pollonGoogleMapsPromise;
  }

  const staleScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
  if (staleScript && window.__pollonGoogleMapsKey !== apiKey) {
    staleScript.remove();
    window.__pollonGoogleMapsPromise = undefined;
  }

  window.__pollonGoogleMapsKey = apiKey;
  window.__pollonGoogleMapsPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const existingScript = document.getElementById(
      GOOGLE_MAPS_SCRIPT_ID
    ) as HTMLScriptElement | null;

    const handleLoad = () => {
      if (window.google?.maps) {
        resolve(window.google);
      } else {
        reject(new Error("Google Maps did not initialize"));
      }
    };
    const handleError = () => reject(new Error("Google Maps could not load"));

    if (existingScript) {
      existingScript.addEventListener("load", handleLoad, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&language=es&region=MX&v=weekly`;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    document.head.appendChild(script);
  });

  return window.__pollonGoogleMapsPromise;
}

function geocodeWithGoogle(
  geocoder: GoogleGeocoderInstance,
  request: GoogleGeocodeRequest
) {
  return new Promise<GoogleGeocoderResult[]>((resolve, reject) => {
    geocoder.geocode(request, (results, status) => {
      if (status === "OK") {
        resolve(results || []);
        return;
      }

      if (status === "ZERO_RESULTS") {
        resolve([]);
        return;
      }

      reject(new Error(`Google geocoder failed with status ${status}`));
    });
  });
}

function AddressAliasIcon({ alias }: { alias: string }) {
  const normalized = alias.trim().toLowerCase();
  if (normalized.includes("casa")) return <Home size={15} />;
  if (normalized.includes("trabajo") || normalized.includes("oficina")) {
    return <Briefcase size={15} />;
  }
  return <MapPin size={15} />;
}

export function DeliveryMapInner({ onDeliveryChange, onAddressChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [loadingSavedAddresses, setLoadingSavedAddresses] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [saveAddressError, setSaveAddressError] = useState("");
  const [savedAddresses, setSavedAddresses] = useState<SavedAddressPublic[]>([]);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [saveAlias, setSaveAlias] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [addressError, setAddressError] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<DeliveryResult | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const googleApiRef = useRef<GoogleMapsApi | null>(null);
  const googleMapRef = useRef<GoogleMapInstance | null>(null);
  const googleMarkerRef = useRef<GoogleMarkerInstance | null>(null);
  const googleGeocoderRef = useRef<GoogleGeocoderInstance | null>(null);
  const googleMapsApiKeyRef = useRef(STATIC_GOOGLE_MAPS_API_KEY);
  const [mapProvider, setMapProvider] = useState<"loading" | "google" | "osm">("loading");
  const onDeliveryChangeRef = useRef(onDeliveryChange);
  const handleMoveRef = useRef<(lat: number, lng: number) => void>(() => {});
  const deliveryRequestRef = useRef(0);
  const addressRequestRef = useRef(0);

  useEffect(() => {
    onDeliveryChangeRef.current = onDeliveryChange;
  }, [onDeliveryChange]);

  const loadSavedAddresses = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    setLoadingSavedAddresses(true);
    try {
      const addresses = await api.get<SavedAddressPublic[]>(
        "/api/customers/me/addresses",
        token
      );
      setSavedAddresses(addresses);
      setSaveAsDefault(addresses.length === 0);
    } catch {
      setSaveAddressError("No pude cargar tus direcciones guardadas.");
    } finally {
      setLoadingSavedAddresses(false);
    }
  }, []);

  useEffect(() => {
    void loadSavedAddresses();
  }, [loadSavedAddresses]);

  const updateSelectedAddress = useCallback(
    (nextAddress: string) => {
      setAddress(nextAddress);
      onAddressChange?.(nextAddress);
    },
    [onAddressChange]
  );

  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    const requestId = ++addressRequestRef.current;

    try {
      const geocoder = googleGeocoderRef.current;

      if (geocoder) {
        const results = await geocodeWithGoogle(geocoder, {
          location: { lat, lng },
          region: "mx",
        });
        const bestMatch = results[0];

        if (requestId === addressRequestRef.current) {
          updateSelectedAddress(
            bestMatch?.formatted_address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
          );
        }
        return;
      }
    } catch {
      // Fall through to OpenStreetMap if Google cannot reverse geocode this point.
    }

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
        updateSelectedAddress(addr || data.display_name || "");
      }
    } catch {
      if (requestId === addressRequestRef.current) {
        updateSelectedAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    }
  }, [updateSelectedAddress]);

  const calculate = useCallback(async (lat: number, lng: number, shouldReverseGeocode = true) => {
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
      if (shouldReverseGeocode) {
        void reverseGeocode(lat, lng);
      }
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
    setSelectedLocation({ lat, lng });
    const googleApi = googleApiRef.current;
    const googleMap = googleMapRef.current;

    if (googleApi && googleMap) {
      const position = { lat, lng };

      if (!googleMarkerRef.current) {
        const marker = new googleApi.maps.Marker({
          draggable: true,
          map: googleMap,
          position,
          title: "Tu ubicación de entrega",
        });

        marker.addListener("dragend", () => {
          const point = marker.getPosition();
          if (!point) return;
          handleMoveRef.current(point.lat(), point.lng());
        });

        googleMarkerRef.current = marker;
      } else {
        googleMarkerRef.current.setPosition(position);
      }

      if (centerMap) {
        googleMap.setCenter(position);
        googleMap.setZoom(17);
      } else {
        googleMap.panTo(position);
      }
      return;
    }

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
      setSuggestions([]);
      setAddressError("");
      setSaveAddressError("");
      setSelectedSavedAddressId(null);
      placeMarker(lat, lng);
      void calculate(lat, lng);
    },
    [calculate, placeMarker]
  );

  useEffect(() => {
    handleMoveRef.current = handleMove;
  }, [handleMove]);

  useEffect(() => {
    if (mapRef.current || googleMapRef.current || !mapContainerRef.current) return;

    let cancelled = false;
    let invalidateTimer: number | null = null;
    let leafletMap: L.Map | null = null;

    const initLeafletMap = () => {
      if (cancelled || mapRef.current || !mapContainerRef.current) return;
      setMapProvider("osm");

      const map = L.map(mapContainerRef.current).setView(STORE_POS, 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      map.on("click", (event: L.LeafletMouseEvent) => {
        handleMoveRef.current(event.latlng.lat, event.latlng.lng);
      });

      mapRef.current = map;
      leafletMap = map;
      invalidateTimer = window.setTimeout(() => map.invalidateSize(), 0);
    };

    void getGoogleMapsApiKey().then((apiKey) => {
      if (cancelled) return;
      googleMapsApiKeyRef.current = apiKey;

      if (!apiKey) {
        initLeafletMap();
        return;
      }

      void loadGoogleMaps(apiKey)
        .then((googleApi) => {
          if (cancelled || !mapContainerRef.current) return;

          const initialPosition = { lat: STORE_POS[0], lng: STORE_POS[1] };
          const map = new googleApi.maps.Map(mapContainerRef.current, {
            center: initialPosition,
            clickableIcons: false,
            fullscreenControl: false,
            mapTypeControl: false,
            streetViewControl: false,
            zoom: 15,
          });

          map.addListener("click", (event: GoogleMapMouseEvent) => {
            const point = event.latLng;
            if (!point) return;
            handleMoveRef.current(point.lat(), point.lng());
          });

          googleApiRef.current = googleApi;
          googleMapRef.current = map;
          googleGeocoderRef.current = new googleApi.maps.Geocoder();
          setMapProvider("google");
          invalidateTimer = window.setTimeout(() => map.setCenter(initialPosition), 0);
        })
        .catch(() => initLeafletMap());
    });

    return () => {
      cancelled = true;
      if (invalidateTimer) {
        window.clearTimeout(invalidateTimer);
      }

      if (googleApiRef.current) {
        if (googleMarkerRef.current) {
          googleApiRef.current.maps.event.clearInstanceListeners(googleMarkerRef.current);
          googleMarkerRef.current.setMap(null);
        }
        if (googleMapRef.current) {
          googleApiRef.current.maps.event.clearInstanceListeners(googleMapRef.current);
        }
      }

      leafletMap?.remove();
      googleApiRef.current = null;
      googleMapRef.current = null;
      googleMarkerRef.current = null;
      googleGeocoderRef.current = null;
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  const handleAddressSearch = useCallback(
    async () => {
      const query = addressQuery.trim();

      if (query.length < 5) {
        setAddressError("Escribe calle, número o colonia para buscar.");
        setSuggestions([]);
        return;
      }

      setSearchingAddress(true);
      setAddressError("");

      try {
        let geocoder = googleGeocoderRef.current;
        let data: AddressSuggestion[] = [];
        let shouldSearchOpenStreetMap = false;

        if (!geocoder) {
          const apiKey =
            googleMapsApiKeyRef.current ||
            (await getGoogleMapsApiKey());
          googleMapsApiKeyRef.current = apiKey;

          if (apiKey) {
            try {
              const googleApi = await loadGoogleMaps(apiKey);
              googleApiRef.current = googleApi;
              geocoder = new googleApi.maps.Geocoder();
              googleGeocoderRef.current = geocoder;
            } catch {
              geocoder = null;
            }
          }
        }

        if (!geocoder && STATIC_GOOGLE_MAPS_API_KEY) {
          try {
            const googleApi = await loadGoogleMaps(STATIC_GOOGLE_MAPS_API_KEY);
            googleApiRef.current = googleApi;
            geocoder = new googleApi.maps.Geocoder();
            googleGeocoderRef.current = geocoder;
          } catch {
            geocoder = null;
          }
        }

        if (geocoder) {
          try {
            const googleResults = await geocodeWithGoogle(geocoder, {
              address: buildSearchQuery(query),
              componentRestrictions: { country: "MX" },
              region: "mx",
            });

            data = googleResults.slice(0, 6).map((item, index) => ({
              display_name: item.formatted_address,
              lat: item.geometry.location.lat(),
              lon: item.geometry.location.lng(),
              place_id: item.place_id || `${item.formatted_address}-${index}`,
              source: "google",
            }));
          } catch {
            shouldSearchOpenStreetMap = true;
          }
        } else {
          shouldSearchOpenStreetMap = true;
        }

        if (shouldSearchOpenStreetMap) {
          const params = new URLSearchParams({
            q: buildSearchQuery(query),
            format: "json",
            addressdetails: "1",
            limit: "6",
            countrycodes: "mx",
            "accept-language": "es",
          });
          const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
          data = (await response.json()) as AddressSuggestion[];
        }

        setSuggestions(data);
        if (!data.length) {
          setAddressError("No encontré esa dirección. Prueba con calle, número y colonia.");
        }
      } catch {
        setSuggestions([]);
        setAddressError("No pude buscar la dirección. Intenta de nuevo.");
      } finally {
        setSearchingAddress(false);
      }
    },
    [addressQuery]
  );

  const selectSuggestion = useCallback(
    (suggestion: AddressSuggestion) => {
      const lat = Number(suggestion.lat);
      const lng = Number(suggestion.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setAddressError("Esa dirección no tiene coordenadas válidas.");
        return;
      }

      setSuggestions([]);
      setAddressError("");
      setSaveAddressError("");
      setSelectedSavedAddressId(null);
      setAddressQuery(suggestionTitle(suggestion));
      updateSelectedAddress(suggestion.display_name);
      placeMarker(lat, lng, true);
      void calculate(lat, lng, false);
    },
    [calculate, placeMarker, updateSelectedAddress]
  );

  const selectSavedAddress = useCallback(
    (savedAddress: SavedAddressPublic) => {
      setSelectedSavedAddressId(savedAddress.id);
      setSuggestions([]);
      setAddressError("");
      setSaveAddressError("");
      setAddressQuery(savedAddress.alias);
      updateSelectedAddress(savedAddress.address);
      placeMarker(savedAddress.lat, savedAddress.lng, true);
      void calculate(savedAddress.lat, savedAddress.lng, false);
    },
    [calculate, placeMarker, updateSelectedAddress]
  );

  const handleSaveCurrentAddress = useCallback(async () => {
    const token = getToken();
    const alias = saveAlias.trim();

    if (!token) {
      setSaveAddressError("Inicia sesión para guardar direcciones.");
      return;
    }

    if (!selectedLocation || !address) {
      setSaveAddressError("Primero busca tu dirección o mueve el pin.");
      return;
    }

    if (alias.length < 2) {
      setSaveAddressError("Ponle un alias, por ejemplo Casa o Trabajo.");
      return;
    }

    setSavingAddress(true);
    setSaveAddressError("");

    try {
      const payload: CreateSavedAddressPayload = {
        alias,
        address,
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
        isDefault: saveAsDefault || savedAddresses.length === 0,
      };
      const saved = await api.post<SavedAddressPublic>(
        "/api/customers/me/addresses",
        payload,
        token
      );

      setSavedAddresses((current) => {
        const next = payload.isDefault
          ? current.map((item) => ({ ...item, isDefault: false }))
          : current;
        return [...next, saved].sort((a, b) => {
          if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
      });
      setSelectedSavedAddressId(saved.id);
      setSaveAlias("");
      setSaveAsDefault(false);
    } catch (error) {
      setSaveAddressError(
        error instanceof Error ? error.message : "No pude guardar la dirección."
      );
    } finally {
      setSavingAddress(false);
    }
  }, [address, saveAlias, saveAsDefault, savedAddresses.length, selectedLocation]);

  const handleDeleteSavedAddress = useCallback(
    async (savedAddress: SavedAddressPublic) => {
      const token = getToken();
      if (!token) return;

      const shouldDelete = window.confirm(`¿Borrar la dirección "${savedAddress.alias}"?`);
      if (!shouldDelete) return;

      try {
        await api.delete<{ ok: boolean }>(
          `/api/customers/me/addresses/${savedAddress.id}`,
          token
        );
        setSavedAddresses((current) =>
          current.filter((item) => item.id !== savedAddress.id)
        );
        if (selectedSavedAddressId === savedAddress.id) {
          setSelectedSavedAddressId(null);
        }
        void loadSavedAddresses();
      } catch (error) {
        setSaveAddressError(
          error instanceof Error ? error.message : "No pude borrar la dirección."
        );
      }
    },
    [loadSavedAddresses, selectedSavedAddressId]
  );

  const handleMakeDefaultAddress = useCallback(
    async (savedAddress: SavedAddressPublic) => {
      const token = getToken();
      if (!token || savedAddress.isDefault) return;

      try {
        const updated = await api.patch<SavedAddressPublic>(
          `/api/customers/me/addresses/${savedAddress.id}`,
          { isDefault: true },
          token
        );
        setSavedAddresses((current) =>
          current
            .map((item) => ({
              ...item,
              isDefault: item.id === updated.id,
            }))
            .sort((a, b) => {
              if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
              return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            })
        );
      } catch (error) {
        setSaveAddressError(
          error instanceof Error ? error.message : "No pude cambiar la predeterminada."
        );
      }
    },
    []
  );

  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setAddressError("Tu navegador no permite usar ubicación actual.");
      return;
    }

    setLocating(true);
    setAddressError("");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setSuggestions([]);
        setSelectedSavedAddressId(null);
        setSaveAddressError("");
        placeMarker(pos.coords.latitude, pos.coords.longitude, true);
        void calculate(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setLocating(false);
        setAddressError("No pude obtener tu ubicación. Busca tu calle o colonia.");
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 8_000 }
    );
  }, [calculate, placeMarker]);

  const [addingNew, setAddingNew] = useState(false);
  const handleStartNewAddress = useCallback(() => {
    setSelectedSavedAddressId(null);
    setSuggestions([]);
    setAddressError("");
    setSaveAddressError("");
    setSaveAlias("");
    setAddressQuery("");
    setAddress("");
    setSaveAsDefault(savedAddresses.length === 0);
    setAddingNew(true);
    // Scroll + focus el search input. En mobile, focus solo no scrollea
    // automáticamente; sin scrollIntoView el cliente toca "+ NUEVA" y no
    // ve cambio en pantalla.
    setTimeout(() => {
      searchInputRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      searchInputRef.current?.focus({ preventScroll: true });
    }, 50);
  }, [savedAddresses.length]);

  // Cuando el cliente selecciona una saved address, salir del modo "adding"
  useEffect(() => {
    if (selectedSavedAddressId) setAddingNew(false);
  }, [selectedSavedAddressId]);

  return (
    <div className="space-y-3">
      {(loadingSavedAddresses || savedAddresses.length > 0) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-on-surface-variant">
              Mis direcciones
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-on-surface-variant">
                {savedAddresses.length}/3
              </span>
              {savedAddresses.length < 3 && (
                <button
                  type="button"
                  onClick={handleStartNewAddress}
                  className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary transition-colors hover:bg-primary/20"
                >
                  <Plus size={12} />
                  Nueva
                </button>
              )}
            </div>
          </div>

          {loadingSavedAddresses ? (
            <div className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-high px-3 py-2 text-xs text-on-surface-variant">
              <Loader2 size={13} className="animate-spin" />
              Cargando direcciones...
            </div>
          ) : (
            <div className="space-y-2">
              {savedAddresses.map((savedAddress) => {
                const selected = selectedSavedAddressId === savedAddress.id;
                return (
                  <div
                    key={savedAddress.id}
                    className={`flex items-stretch gap-2 rounded-lg border p-2 ${
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-outline-variant bg-surface-container-high"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectSavedAddress(savedAddress)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          selected
                            ? "bg-primary text-on-primary"
                            : "bg-surface text-primary"
                        }`}
                      >
                        <AddressAliasIcon alias={savedAddress.alias} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                          {savedAddress.alias}
                          {savedAddress.isDefault && (
                            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
                              Default
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-on-surface-variant">
                          {savedAddress.address}
                        </span>
                      </span>
                    </button>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleMakeDefaultAddress(savedAddress)}
                        disabled={savedAddress.isDefault}
                        title="Hacer predeterminada"
                        className="rounded-lg p-2 text-on-surface-variant hover:bg-surface disabled:opacity-40"
                      >
                        <Star size={14} className={savedAddress.isDefault ? "fill-current text-primary" : ""} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSavedAddress(savedAddress)}
                        title="Borrar dirección"
                        className="rounded-lg p-2 text-on-surface-variant hover:bg-surface hover:text-error"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {addingNew && (
          <div className="flex items-start gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5">
            <Plus size={14} className="mt-0.5 flex-shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-headline text-xs font-bold text-primary">
                Nueva dirección
              </p>
              <p className="text-[11px] text-on-surface-variant/80">
                Busca abajo o usa tu ubicación actual, luego dale un alias y guarda.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAddingNew(false)}
              className="flex-shrink-0 text-[11px] font-bold text-on-surface-variant/70 hover:text-error"
              aria-label="Cancelar"
            >
              ✕
            </button>
          </div>
        )}
        <label className="text-sm font-medium text-on-surface">
          {addingNew ? "Busca o pega la nueva dirección" : "Busca tu dirección"}
        </label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
            />
            <input
              ref={searchInputRef}
              value={addressQuery}
              onChange={(event) => setAddressQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleAddressSearch();
                }
              }}
              placeholder="Calle, número, colonia"
              autoComplete="street-address"
              className={`w-full rounded-lg border bg-white py-2.5 pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                addingNew
                  ? "border-primary/60 ring-2 ring-primary/20"
                  : "border-outline-variant/40 focus:border-primary"
              }`}
            />
          </div>
          <button
            type="button"
            onClick={() => void handleAddressSearch()}
            disabled={searchingAddress}
            className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary disabled:opacity-50"
          >
            {searchingAddress ? <Loader2 size={16} className="animate-spin" /> : "Buscar"}
          </button>
        </div>

        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={locating}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary disabled:opacity-50"
        >
          {locating ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Crosshair size={13} />
          )}
          Usar mi ubicación actual
        </button>

        {addressError && <p className="text-xs text-error">{addressError}</p>}

        {suggestions.length > 0 && (
          <div className="max-h-44 overflow-y-auto rounded-lg border border-outline-variant bg-surface shadow-sm">
            {suggestions.map((suggestion) => {
              const subtitle = suggestionSubtitle(suggestion);
              return (
                <button
                  key={suggestion.place_id}
                  type="button"
                  onClick={() => selectSuggestion(suggestion)}
                  className="block w-full border-b border-outline-variant/70 px-3 py-2 text-left last:border-b-0 hover:bg-surface-container-high"
                >
                  <span className="block text-sm font-semibold text-on-surface">
                    {suggestionTitle(suggestion)}
                  </span>
                  <span className="block truncate text-xs text-on-surface-variant">
                    {subtitle || suggestion.display_name}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div
        ref={mapContainerRef}
        className="z-0 h-[220px] w-full overflow-hidden rounded-lg sm:h-[240px]"
      />
      <p
        className={`text-[11px] font-medium ${
          mapProvider === "google" ? "text-green-600" : "text-on-surface-variant"
        }`}
      >
        {mapProvider === "google"
          ? "Google Maps activo"
          : mapProvider === "osm"
            ? "Mapa alterno activo"
            : "Cargando mapa..."}
      </p>

      {address && (
        <p className="text-xs text-on-surface-variant bg-surface-container-high p-2 rounded-lg truncate">
          <MapPin size={12} className="inline mr-1" />
          {address}
        </p>
      )}

      <p className="text-xs text-on-surface-variant">
        Busca tu dirección, elige una sugerencia y ajusta el pin en tu puerta exacta.
      </p>

      {selectedLocation && address && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
          {savedAddresses.length >= 3 && !selectedSavedAddressId ? (
            <div className="flex items-start gap-2">
              <MapPin size={14} className="mt-0.5 shrink-0 text-on-surface-variant" />
              <p className="text-xs font-medium text-on-surface-variant">
                Ya tienes 3 direcciones guardadas. Borra una para guardar esta.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Plus size={14} className="mt-0.5 shrink-0 text-primary" />
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  {selectedSavedAddressId
                    ? "Guardar como nueva dirección"
                    : "Guardar esta dirección"}
                </p>
              </div>
              {selectedSavedAddressId && (
                <p className="pl-5 text-[11px] text-on-surface-variant">
                  Ponle un alias distinto para crear otra entrada.
                </p>
              )}
              <div className="flex gap-2">
                <input
                  value={saveAlias}
                  onChange={(event) => setSaveAlias(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleSaveCurrentAddress();
                    }
                  }}
                  placeholder="Alias: Casa, Trabajo, Novia..."
                  maxLength={30}
                  className="min-w-0 flex-1 rounded-lg border border-outline-variant/40 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveCurrentAddress()}
                  disabled={savingAddress || saveAlias.trim().length < 2}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {savingAddress ? <Loader2 size={16} className="animate-spin" /> : "Guardar"}
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs text-on-surface-variant">
                <input
                  type="checkbox"
                  checked={saveAsDefault}
                  onChange={(event) => setSaveAsDefault(event.target.checked)}
                  className="h-4 w-4 rounded border-outline-variant text-primary"
                />
                Usar como predeterminada
              </label>
            </div>
          )}

          {saveAddressError && (
            <p className="mt-2 text-xs text-error">{saveAddressError}</p>
          )}
        </div>
      )}

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
