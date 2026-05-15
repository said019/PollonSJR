"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import type { RecommendationsResponse, ProductPublic } from "@pollon/types";
import { ProductCard } from "./product-card";
import { Sparkles, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Sección "Recomendado para ti" / "Lo más pedido".
 *
 * El backend devuelve { personal, global, source }:
 *  - source === "personal" → mostramos sólo `personal` (cliente con historial)
 *  - source === "mixed"    → mostramos `personal` (más relevante) y luego el resto del `global`
 *                            que no esté ya en personal, hasta 6 total.
 *  - source === "global"   → sin historial — mostramos `global`
 *  - source === "empty"    → no renderiza la sección.
 *
 * Se autoadapta: hoy con poca data dirá "Lo más pedido" para todos; conforme cada
 * cliente acumule pedidos, individualmente verá "Tu favorito".
 */
export function RecommendationsSection() {
  // Token via state — evita hydration mismatch entre SSR (no token) y client.
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    setToken(getToken());
  }, []);

  const { data } = useQuery({
    queryKey: ["menu-recommendations", token],
    queryFn: () =>
      api.get<RecommendationsResponse>(
        "/api/menu/recommendations",
        token || undefined
      ),
    // 5 min en server-cache, 1 min en client antes de re-fetch.
    staleTime: 60_000,
  });

  if (!data || data.source === "empty") return null;

  // Combinar sin duplicar IDs, preservando orden de relevancia.
  const seen = new Set<string>();
  const products: ProductPublic[] = [];
  const pushUnique = (list: ProductPublic[]) => {
    for (const p of list) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      products.push(p);
      if (products.length >= 6) return;
    }
  };
  pushUnique(data.personal);
  pushUnique(data.global);

  if (products.length === 0) return null;

  const isPersonal = data.source === "personal" || data.source === "mixed";

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        {isPersonal ? (
          <>
            <Sparkles size={16} className="text-secondary" />
            <h2 className="font-headline text-sm font-bold uppercase tracking-[0.2em] text-tertiary">
              Recomendado para ti
            </h2>
          </>
        ) : (
          <>
            <TrendingUp size={16} className="text-primary" />
            <h2 className="font-headline text-sm font-bold uppercase tracking-[0.2em] text-tertiary">
              Lo más pedido
            </h2>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              Últimos 30 días
            </span>
          </>
        )}
      </div>
      <p className="mb-3 text-[11px] text-on-surface-variant/70">
        {isPersonal
          ? "Basado en lo que más has pedido tú."
          : "Lo que más están pidiendo nuestros clientes ahorita."}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} variant="grid" />
        ))}
      </div>
    </section>
  );
}
