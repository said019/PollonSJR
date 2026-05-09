"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useEffect, useState } from "react";

interface FavResponse {
  productIds: string[];
}

export function useFavorites() {
  const qc = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setToken(getToken());
    setHydrated(true);
  }, []);

  const { data } = useQuery({
    queryKey: ["favorites"],
    queryFn: () => api.get<FavResponse>("/api/customers/me/favorites", token || undefined),
    enabled: hydrated && !!token,
  });

  const productIds = data?.productIds ?? [];

  const addMut = useMutation({
    mutationFn: (productId: string) =>
      api.post<FavResponse>(
        `/api/customers/me/favorites/${productId}`,
        {},
        token || undefined
      ),
    onMutate: async (productId) => {
      await qc.cancelQueries({ queryKey: ["favorites"] });
      const prev = qc.getQueryData<FavResponse>(["favorites"]);
      qc.setQueryData<FavResponse>(["favorites"], (old) => ({
        productIds: Array.from(new Set([...(old?.productIds ?? []), productId])),
      }));
      return { prev };
    },
    onError: (_err, _productId, ctx) => {
      if (ctx?.prev) qc.setQueryData(["favorites"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });

  const removeMut = useMutation({
    mutationFn: (productId: string) =>
      api.delete<FavResponse>(
        `/api/customers/me/favorites/${productId}`,
        token || undefined
      ),
    onMutate: async (productId) => {
      await qc.cancelQueries({ queryKey: ["favorites"] });
      const prev = qc.getQueryData<FavResponse>(["favorites"]);
      qc.setQueryData<FavResponse>(["favorites"], (old) => ({
        productIds: (old?.productIds ?? []).filter((id) => id !== productId),
      }));
      return { prev };
    },
    onError: (_err, _productId, ctx) => {
      if (ctx?.prev) qc.setQueryData(["favorites"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });

  const toggle = (productId: string) => {
    if (!token) return;
    if (productIds.includes(productId)) {
      removeMut.mutate(productId);
    } else {
      addMut.mutate(productId);
    }
  };

  return {
    isAuthenticated: !!token,
    favoriteIds: productIds,
    isFavorite: (id: string) => productIds.includes(id),
    toggle,
  };
}
