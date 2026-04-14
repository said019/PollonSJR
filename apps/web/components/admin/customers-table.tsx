"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import { Search, Star, Phone } from "lucide-react";
import { useState } from "react";

interface CustomerRow {
  id: string;
  phone: string;
  name: string | null;
  totalOrders: number;
  totalSpent: number;
  loyaltyPoints: number;
  loyaltyTier: string;
  lastOrderAt: string | null;
  createdAt: string;
}

const TIER_BADGE: Record<string, string> = {
  POLLITO: "bg-surface-variant text-on-surface-variant",
  CRUJIENTE: "bg-orange-100 text-orange-700",
  VIP_POLLON: "bg-yellow-100 text-yellow-700",
};

export function CustomersTable() {
  const token = getAdminToken();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-customers", page, search],
    queryFn: () =>
      api.get<{ customers: CustomerRow[]; total: number; pages: number }>(
        `/api/admin/customers?page=${page}&limit=20&search=${encodeURIComponent(search)}`,
        token || undefined
      ),
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por nombre o teléfono..."
            className="pl-9 pr-4 py-2 border rounded-xl text-sm w-64"
          />
        </div>
      </div>

      <div className="bg-surface-container-high rounded-xl border border-outline-variant/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container border-b">
              <tr>
                <th className="text-left p-3 font-semibold">Cliente</th>
                <th className="text-left p-3 font-semibold">Teléfono</th>
                <th className="text-center p-3 font-semibold">Pedidos</th>
                <th className="text-center p-3 font-semibold">Gastado</th>
                <th className="text-center p-3 font-semibold">Puntos</th>
                <th className="text-center p-3 font-semibold">Nivel</th>
                <th className="text-left p-3 font-semibold">Último pedido</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7} className="p-3">
                        <div className="h-6 bg-surface-variant rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                : data?.customers.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-container">
                      <td className="p-3">
                        <p className="font-medium">{c.name || "Sin nombre"}</p>
                      </td>
                      <td className="p-3">
                        <span className="flex items-center gap-1 text-on-surface-variant">
                          <Phone size={14} /> {c.phone}
                        </span>
                      </td>
                      <td className="p-3 text-center font-semibold">{c.totalOrders}</td>
                      <td className="p-3 text-center">${(c.totalSpent / 100).toFixed(0)}</td>
                      <td className="p-3 text-center">
                        <span className="flex items-center justify-center gap-1">
                          <Star size={14} className="text-yellow-500" /> {c.loyaltyPoints}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${TIER_BADGE[c.loyaltyTier] || ""}`}>
                          {c.loyaltyTier}
                        </span>
                      </td>
                      <td className="p-3 text-on-surface-variant text-xs">
                        {c.lastOrderAt
                          ? new Date(c.lastOrderAt).toLocaleDateString("es-MX")
                          : "—"}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {data && data.pages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-on-surface-variant">
              Página {page} de {data.pages} ({data.total} clientes)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                disabled={page === data.pages}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
