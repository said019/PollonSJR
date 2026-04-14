"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { LoyaltyInfo, LoyaltyEventItem } from "@pollon/types";
import { useSocket } from "./useSocket";
import { useState } from "react";

export function useLoyalty() {
  const [realtimePoints, setRealtimePoints] = useState<number | null>(null);
  const [realtimeTier, setRealtimeTier] = useState<string | null>(null);

  const token = getToken();

  const { data: info, isLoading } = useQuery({
    queryKey: ["loyalty"],
    queryFn: () => api.get<LoyaltyInfo>("/api/loyalty/me", token || undefined),
    enabled: !!token,
  });

  const { data: history } = useQuery({
    queryKey: ["loyalty-history"],
    queryFn: () => api.get<LoyaltyEventItem[]>("/api/loyalty/me/history", token || undefined),
    enabled: !!token,
  });

  useSocket("loyalty:points", ({ points, tier }) => {
    setRealtimePoints(points);
    setRealtimeTier(tier);
  });

  const currentPoints = realtimePoints ?? info?.points ?? 0;
  const currentTier = realtimeTier ?? info?.tier ?? "POLLITO";

  return {
    points: currentPoints,
    tier: currentTier,
    nextTier: info?.nextTier ?? null,
    pointsToNextTier: info?.pointsToNextTier ?? 0,
    history: history ?? [],
    isLoading,
  };
}
