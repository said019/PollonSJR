"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { formatCents } from "@pollon/utils";
import type { DeliveryZonePublic, StoreLocationPublic, DeliveryResult } from "@pollon/types";
import { StoreLocationMap, CoverageMap } from "./google-store-map";
import {
  Save,
  Loader2,
  MapPin,
  Plus,
  Trash2,
  Navigation,
  Crosshair,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
} from "lucide-react";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

interface ZoneForm {
  id?: string;
  name: string;
  minKm: number;
  maxKm: number;
  fee: number;
  color: string;
  active: boolean;
  sortOrder: number;
}

function AdminDeliveryPageInner() {
  const token = getAdminToken();
  const qc = useQueryClient();

  const { data: zones = [], isLoading: loadingZones } = useQuery({
    queryKey: ["admin-delivery-zones"],
    queryFn: () => api.get<DeliveryZonePublic[]>("/api/admin/delivery/zones", token || undefined),
  });

  const { data: storeLocation, isLoading: loadingStore } = useQuery({
    queryKey: ["admin-store-location"],
    queryFn: () => api.get<StoreLocationPublic>("/api/admin/delivery/store", token || undefined),
  });

  const [zoneList, setZoneList] = useState<ZoneForm[]>([]);
  const [storeLat, setStoreLat] = useState(20.5881);
  const [storeLng, setStoreLng] = useState(-99.9953);
  const [storeAddress, setStoreAddress] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [testResult, setTestResult] = useState<DeliveryResult | null>(null);
  const [testMarker, setTestMarker] = useState<{ lat: number; lng: number } | null>(null);
  const [expandedZone, setExpandedZone] = useState<number | null>(null);
  const [showZones, setShowZones] = useState(true);

  // Map state is now handled by Google Maps components (google-store-map.tsx)

  // Stats computed from zoneList
  const activeZones = zoneList.filter((z) => z.active);
  const maxCoverageKm = activeZones.length
    ? Math.max(...activeZones.map((z) => z.maxKm))
    : 0;
  const minFee = activeZones.length ? Math.min(...activeZones.map((z) => z.fee)) : 0;
  const maxFee = activeZones.length ? Math.max(...activeZones.map((z) => z.fee)) : 0;

  useEffect(() => {
    if (zones.length > 0 && zoneList.length === 0) {
      setZoneList(zones.map((z) => ({ ...z })));
    }
  }, [zones, zoneList.length]);

  useEffect(() => {
    if (storeLocation) {
      setStoreLat(storeLocation.lat);
      setStoreLng(storeLocation.lng);
      setStoreAddress(storeLocation.address);
    }
  }, [storeLocation]);

  // Map rendering is now handled by google-store-map.tsx (StoreLocationMap + CoverageMap)

  // Mutations
  const saveZonesMut = useMutation({
    mutationFn: (data: ZoneForm[]) =>
      api.put("/api/admin/delivery/zones", data, token || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-delivery-zones"] }),
  });

  const saveStoreMut = useMutation({
    mutationFn: (data: { lat: number; lng: number; address: string }) =>
      api.put("/api/admin/delivery/store", data, token || undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-store-location"] }),
  });

  const handleSaveAll = () => {
    saveStoreMut.mutate({ lat: storeLat, lng: storeLng, address: storeAddress });
    saveZonesMut.mutate(zoneList);
  };

  const addZone = () => {
    const lastZone = zoneList[zoneList.length - 1];
    const newMinKm = lastZone ? lastZone.maxKm : 0;
    const newIdx = zoneList.length;
    setZoneList([
      ...zoneList,
      {
        name: "Nueva zona",
        minKm: newMinKm,
        maxKm: newMinKm + 2,
        fee: 5000,
        color: "#F07820",
        active: true,
        sortOrder: newIdx,
      },
    ]);
    setExpandedZone(newIdx);
  };

  const removeZone = (index: number) => {
    setZoneList(zoneList.filter((_, i) => i !== index));
    if (expandedZone === index) setExpandedZone(null);
  };

  const updateZone = (index: number, field: keyof ZoneForm, value: any) => {
    const updated = [...zoneList];
    (updated[index] as any)[field] = value;
    setZoneList(updated);
  };

  // "Mi ubicación" is now inside the StoreLocationMap component

  if (loadingZones || loadingStore) {
    return (
      <div className="p-6 flex justify-center py-12">
        <Loader2 size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Zonas de envío</h1>
        <button
          onClick={handleSaveAll}
          disabled={saveZonesMut.isPending || saveStoreMut.isPending}
          className="bg-primary text-on-primary px-4 py-2 rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50"
        >
          {saveZonesMut.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          Guardar todo
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-surface-container-high rounded-xl border p-3 text-center">
          <p className="text-xs text-on-surface-variant">Cobertura máxima</p>
          <p className="text-lg font-bold">{maxCoverageKm} km</p>
        </div>
        <div className="bg-surface-container-high rounded-xl border p-3 text-center">
          <p className="text-xs text-on-surface-variant">Zonas activas</p>
          <p className="text-lg font-bold">{activeZones.length}</p>
        </div>
        <div className="bg-surface-container-high rounded-xl border p-3 text-center">
          <p className="text-xs text-on-surface-variant">Tarifa mín / máx</p>
          <p className="text-lg font-bold">
            {formatCents(minFee)} / {formatCents(maxFee)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left panel: config */}
        <div className="space-y-6">
          {/* Store location with Google Maps + Places autocomplete */}
          <div className="bg-surface-container-high rounded-xl border border-outline-variant/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-headline font-semibold flex items-center gap-2">
                <MapPin size={18} /> Ubicación del negocio
              </h2>
            </div>
            <StoreLocationMap
              lat={storeLat}
              lng={storeLng}
              address={storeAddress}
              height={260}
              onChange={(newLat, newLng, newAddr) => {
                setStoreLat(newLat);
                setStoreLng(newLng);
                setStoreAddress(newAddr);
              }}
            />
          </div>

          {/* Zones */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Zonas</h2>
              <button
                onClick={addZone}
                className="text-sm text-primary flex items-center gap-1"
              >
                <Plus size={14} /> Nueva zona
              </button>
            </div>

            {zoneList.map((zone, idx) => {
              const isExpanded = expandedZone === idx;
              return (
                <div key={idx} className="bg-surface-container-high rounded-xl border overflow-hidden">
                  {/* Header — always visible */}
                  <button
                    type="button"
                    onClick={() => setExpandedZone(isExpanded ? null : idx)}
                    className="w-full flex items-center justify-between p-3 hover:bg-surface-container text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full inline-block"
                        style={{ backgroundColor: zone.color }}
                      />
                      <span className="font-semibold text-sm">{zone.name}</span>
                      <span className="text-xs text-on-surface-variant">
                        {zone.minKm}–{zone.maxKm} km
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        {formatCents(zone.fee)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <label
                        className="flex items-center gap-1 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={zone.active}
                          onChange={(e) => updateZone(idx, "active", e.target.checked)}
                        />
                        {zone.active ? "Activa" : "Inactiva"}
                      </label>
                      {isExpanded ? (
                        <ChevronUp size={16} className="text-on-surface-variant" />
                      ) : (
                        <ChevronDown size={16} className="text-on-surface-variant" />
                      )}
                    </div>
                  </button>

                  {/* Body — expandable */}
                  {isExpanded && (
                    <div className="border-t p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <label className="text-xs text-on-surface-variant">Nombre</label>
                          <input
                            value={zone.name}
                            onChange={(e) => updateZone(idx, "name", e.target.value)}
                            className="w-full border rounded-lg p-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-on-surface-variant">Color</label>
                          <input
                            type="color"
                            value={zone.color}
                            onChange={(e) => updateZone(idx, "color", e.target.value)}
                            className="w-10 h-10 rounded cursor-pointer border"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-on-surface-variant">Desde (km)</label>
                          <input
                            type="number"
                            step="0.5"
                            value={zone.minKm}
                            onChange={(e) =>
                              updateZone(idx, "minKm", Number(e.target.value))
                            }
                            className="w-full border rounded-lg p-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-on-surface-variant">Hasta (km)</label>
                          <input
                            type="number"
                            step="0.5"
                            value={zone.maxKm}
                            onChange={(e) =>
                              updateZone(idx, "maxKm", Number(e.target.value))
                            }
                            className="w-full border rounded-lg p-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-on-surface-variant">Costo (centavos)</label>
                          <input
                            type="number"
                            value={zone.fee}
                            onChange={(e) =>
                              updateZone(idx, "fee", Number(e.target.value))
                            }
                            className="w-full border rounded-lg p-2 text-sm"
                          />
                          <span className="text-xs text-on-surface-variant">
                            {formatCents(zone.fee)}
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={() => removeZone(idx)}
                          className="text-error hover:text-red-700 text-sm flex items-center gap-1"
                        >
                          <Trash2 size={14} /> Borrar zona
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right panel: coverage map */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Mapa de cobertura</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowZones(!showZones)}
                className={`text-sm flex items-center gap-1 px-3 py-1 rounded-lg ${
                  showZones
                    ? "bg-blue-100 text-blue-700"
                    : "bg-surface-variant text-on-surface-variant"
                }`}
              >
                {showZones ? <Eye size={14} /> : <EyeOff size={14} />}
                Zonas
              </button>
              <button
                onClick={() => {
                  setTestMode(!testMode);
                  setTestMarker(null);
                  setTestResult(null);
                }}
                className={`text-sm flex items-center gap-1 px-3 py-1 rounded-lg ${
                  testMode
                    ? "bg-primary text-on-primary"
                    : "bg-surface-variant text-on-surface-variant"
                }`}
              >
                <Crosshair size={14} /> Modo prueba
              </button>
            </div>
          </div>

          <CoverageMap
            storeLat={storeLat}
            storeLng={storeLng}
            zones={zoneList}
            testMode={testMode}
            testMarker={testMarker}
            onTestClick={async (lat, lng) => {
              setTestMarker({ lat, lng });
              try {
                const result = await api.post<DeliveryResult>("/api/delivery/calculate", { lat, lng });
                setTestResult(result);
              } catch {
                setTestResult(null);
              }
            }}
            height={500}
          />

          {testResult && (
            <div
              className={`p-3 rounded-xl text-sm ${
                testResult.available
                  ? "bg-secondary-container/20 border border-green-200"
                  : "bg-error-container/20 border border-red-200"
              }`}
            >
              {testResult.available ? (
                <div>
                  <p className="font-semibold text-secondary">
                    Zona: {testResult.zoneName} · {testResult.feeMXN}
                  </p>
                  <p className="text-secondary">
                    {testResult.distanceKm} km · ~{testResult.estimatedMinutes} min
                  </p>
                </div>
              ) : (
                <p className="font-semibold text-red-700">
                  Fuera de zona ({testResult.distanceKm} km)
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default dynamic(() => Promise.resolve(AdminDeliveryPageInner), { ssr: false });
