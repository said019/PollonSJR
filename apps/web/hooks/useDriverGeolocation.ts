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
  const { pushIntervalMs = 8_000, activeOrderId = null } = options;
  const [perm, setPerm] = useState<PermState>("prompt");
  const [lastCoords, setLastCoords] = useState<{
    lat: number;
    lng: number;
    ts: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lastSentRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const activeOrderIdRef = useRef<string | null>(activeOrderId);
  activeOrderIdRef.current = activeOrderId;

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

  // Manda una posición al backend (respeta el throttle salvo force=true).
  const sendPosition = (pos: GeolocationPosition, force = false) => {
    const now = Date.now();
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    setLastCoords({ lat, lng, ts: now });
    setError(null);

    if (!force && now - lastSentRef.current < pushIntervalMs) return;
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
          orderId: activeOrderIdRef.current || undefined,
        },
        token
      )
      .catch((err) => {
        console.warn("driver location push failed", err);
      });
  };

  // Watch + push + Wake Lock.
  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      // Liberar wake lock al cerrar turno.
      if (wakeLockRef.current) {
        wakeLockRef.current.release?.().catch(() => {});
        wakeLockRef.current = null;
      }
      return;
    }
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setPerm("unsupported");
      return;
    }

    // Screen Wake Lock: el SO pausa watchPosition cuando la pantalla se
    // apaga o la app pasa a segundo plano. Sin esto el admin/cliente ve
    // la ubicación congelada ("hace 36 min"). Mantenemos la pantalla
    // encendida mientras el repartidor está en turno.
    const acquireWakeLock = async () => {
      try {
        if ("wakeLock" in navigator && !wakeLockRef.current) {
          wakeLockRef.current = await (navigator as any).wakeLock.request(
            "screen"
          );
          wakeLockRef.current.addEventListener?.("release", () => {
            wakeLockRef.current = null;
          });
        }
      } catch {
        // Algunos navegadores lo rechazan si no hay user gesture reciente.
      }
    };
    void acquireWakeLock();

    const id = navigator.geolocation.watchPosition(
      (pos) => sendPosition(pos),
      (err) => {
        setError(err.message);
        if (err.code === err.PERMISSION_DENIED) setPerm("denied");
      },
      {
        enableHighAccuracy: true,
        // maximumAge bajo: no servir posiciones viejas cacheadas, queremos
        // la más fresca posible.
        maximumAge: 2_000,
        timeout: 15_000,
      }
    );
    watchIdRef.current = id;

    // Al volver a foreground (desbloquear pantalla / volver a la app):
    // re-adquirir wake lock Y forzar un push inmediato — no esperar al
    // próximo tick de 8s, porque mientras estuvo en background no se mandó
    // nada y la ubicación quedó vieja.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void acquireWakeLock();
      navigator.geolocation.getCurrentPosition(
        (pos) => sendPosition(pos, true),
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 }
      );
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      document.removeEventListener("visibilitychange", onVisible);
      if (wakeLockRef.current) {
        wakeLockRef.current.release?.().catch(() => {});
        wakeLockRef.current = null;
      }
    };
    // sendPosition se omite a propósito (usa refs, no necesita re-bind)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pushIntervalMs]);

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
