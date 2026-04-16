"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { LoyaltyInfo, LoyaltyEventItem } from "@pollon/types";
import { useSocket } from "./useSocket";
import { useEffect, useState } from "react";

export function useLoyalty() {
  const queryClient = useQueryClient();
  const [realtimeInfo, setRealtimeInfo] = useState<Partial<LoyaltyInfo> | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    setToken(getToken());
    setIsAuthReady(true);
  }, []);

  const { data: info, isLoading } = useQuery({
    queryKey: ["loyalty"],
    queryFn: () => api.get<LoyaltyInfo>("/api/loyalty/me", token || undefined),
    enabled: isAuthReady && !!token,
  });

  const { data: history } = useQuery({
    queryKey: ["loyalty-history"],
    queryFn: () => api.get<LoyaltyEventItem[]>("/api/loyalty/me/history", token || undefined),
    enabled: isAuthReady && !!token,
  });

  useSocket(
    "loyalty:points",
    ({ completedOrders, progress, ordersToNext, target, pendingReward }) => {
      setRealtimeInfo({ completedOrders, progress, ordersToNext, target, pendingReward });
      void queryClient.invalidateQueries({ queryKey: ["loyalty"] });
      void queryClient.invalidateQueries({ queryKey: ["loyalty-history"] });
    },
    { token: token || undefined, role: token ? "customer" : undefined }
  );

  useSocket(
    "loyalty:tier_up",
    () => {
      void queryClient.invalidateQueries({ queryKey: ["loyalty"] });
      void queryClient.invalidateQueries({ queryKey: ["loyalty-history"] });
    },
    { token: token || undefined, role: token ? "customer" : undefined }
  );

  const currentInfo = info ? { ...info, ...realtimeInfo } : info;

  return {
    info: currentInfo,
    completedOrders: currentInfo?.completedOrders ?? 0,
    progress: currentInfo?.progress ?? 0,
    ordersToNext: currentInfo?.ordersToNext ?? 5,
    target: currentInfo?.target ?? 5,
    pendingReward: currentInfo?.pendingReward ?? false,
    pendingProduct: currentInfo?.pendingProduct ?? null,
    history: history ?? [],
    isLoading: !isAuthReady || isLoading,
    isAuthenticated: !!token,
  };
}
