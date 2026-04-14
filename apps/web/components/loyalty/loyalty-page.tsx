"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { LoyaltyInfo, LoyaltyEventItem } from "@pollon/types";
import { formatCents, getTier, pointsToNextTier } from "@pollon/utils";
import { Star, Gift, ChevronRight } from "lucide-react";

export function LoyaltyPage() {
  const token = getToken();

  const { data: info, isLoading } = useQuery({
    queryKey: ["loyalty"],
    queryFn: () => api.get<LoyaltyInfo>("/api/loyalty", token || undefined),
    enabled: !!token,
  });

  const { data: history } = useQuery({
    queryKey: ["loyalty-history"],
    queryFn: () => api.get<LoyaltyEventItem[]>("/api/loyalty/history", token || undefined),
    enabled: !!token,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-surface">
        <div className="text-center">
          <Star size={48} className="mx-auto text-on-surface-variant/30 mb-4" />
          <p className="text-on-surface-variant">Inicia sesión para ver tu programa de lealtad</p>
        </div>
      </div>
    );
  }

  const tier = info.tier;
  const remaining = info.pointsToNextTier;
  const progress = remaining > 0 ? Math.max(0, 100 - (remaining / (info.points + remaining)) * 100) : 100;

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-primary text-on-primary p-6">
        <div className="max-w-lg mx-auto">
          <h1 className="text-xl font-headline font-bold">Mi Lealtad</h1>
          <p className="text-sm opacity-80">Programa Pollón Rewards</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 -mt-4 pb-8">
        {/* Points card */}
        <div className="bg-surface-container-high rounded-2xl p-6 border border-outline-variant/20 shadow-lg mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-3xl font-headline font-black text-primary">{info.points}</p>
              <p className="text-sm text-on-surface-variant">puntos disponibles</p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-semibold">
                <Star size={14} /> {tier}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          {remaining > 0 && (
            <div>
              <div className="flex justify-between text-xs text-on-surface-variant mb-1">
                <span>{tier}</span>
                <span>{remaining} pts para siguiente nivel</span>
              </div>
              <div className="h-2 bg-surface-variant rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Redeem card */}
        <div className="bg-surface-container-high rounded-xl p-4 border border-outline-variant/20 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-secondary-container rounded-full flex items-center justify-center">
              <Gift size={24} className="text-on-secondary-container" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm text-on-surface">Canjear puntos</p>
              <p className="text-xs text-on-surface-variant">100 pts = $10 MXN de descuento</p>
            </div>
            <ChevronRight size={20} className="text-on-surface-variant" />
          </div>
        </div>

        {/* History */}
        <div className="bg-surface-container-high rounded-xl p-4 border border-outline-variant/20">
          <h2 className="font-headline font-bold mb-3 text-on-surface">Historial</h2>
          {history && history.length > 0 ? (
            <div className="divide-y divide-outline-variant/10">
              {history.map((event) => (
                <div key={event.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-on-surface">{event.type}</p>
                    <p className="text-xs text-on-surface-variant">
                      {new Date(event.createdAt).toLocaleDateString("es-MX")}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-bold ${
                      event.points > 0 ? "text-secondary" : "text-error"
                    }`}
                  >
                    {event.points > 0 ? "+" : ""}
                    {event.points}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant text-center py-4">Sin movimientos aún</p>
          )}
        </div>
      </main>
    </div>
  );
}
