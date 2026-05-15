"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { getDriverToken } from "@/lib/auth";

type PermState = "prompt" | "granted" | "denied" | "unsupported";

/**
 * Mientras `enabled` sea true, lee la posición continuamente y la manda al backend
 * cada `pushIntervalMs` (default 10s). El backend la persiste en Driver y la rebota
 * por socket a admin + cliente (cuando el pedido asignado está ON_THE_WAY).
 *
 * `activeOrderId` se manda en cada push para que el cliente reciba la ubicación
 * sólo si ese pedido está en marcha.
 */
export function useDriverGeolocation(
  enabled: boolean,
  options: { pushIntervalMs?: number; activeOrderId?: string | null } = {}
) {
  const { pushIntervalMs = 10_000, activeOrderId = null } = options;
  const [perm, setPerm] = useState<PermState>("prompt");
  const [lastCoords, setLastCoords] = useState<{
    lat: number;
    lng: number;
    ts: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastSentRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);

  // Detectar permiso inicial (Permissions API).
  useEffect(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setPerm("unsupported");
      return;
    }
    if (!("permissions" in navigator)) {
      // Safari iOS no soporta navigator.permissions.query con "geolocation" — asumimos prompt
      return;
    }
    (navigator as any).permissions
      .query({ name: "geolocation" })
      .then((res: any) => {
        setPerm(res.state as PermState);
        res.onchange = () => setPerm(res.state as PermState);
      })
      .catch(() => {});
  }, []);

  // Watch + push.
  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setPerm("unsupported");
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setLastCoords({ lat, lng, ts: now });
        setError(null);

        if (now - lastSentRef.current < pushIntervalMs) return;
        lastSentRef.current = now;

        const token = getDriverToken();
        if (!token) return;

        api
          .post(
            "/api/drivers/location",
            {
              lat,
              lng,
              accuracy: pos.coords.accuracy ?? undefined,
              speed: pos.coords.speed ?? undefined,
              heading: pos.coords.heading ?? undefined,
              orderId: activeOrderId || undefined,
            },
            token
          )
          .catch((err) => {
            console.warn("driver location push failed", err);
          });
      },
      (err) => {
        setError(err.message);
        if (err.code === err.PERMISSION_DENIED) setPerm("denied");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 15_000,
      }
    );

    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, pushIntervalMs, activeOrderId]);

  const requestPermission = () => {
    if (perm === "denied" || perm === "unsupported") return;
    // Disparar un getCurrentPosition fuerza el prompt si está en "prompt".
    navigator.geolocation.getCurrentPosition(
      () => setPerm("granted"),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setPerm("denied");
      }
    );
  };

  return { perm, lastCoords, error, requestPermission };
}
