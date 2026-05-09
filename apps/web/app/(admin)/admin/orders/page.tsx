"use client";

import { OrdersKanban } from "@/components/admin/orders-kanban";
import { OrdersHistory } from "@/components/admin/orders-history";
import { useSearchParams, useRouter } from "next/navigation";
import { useCallback } from "react";

export default function AdminOrdersPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") === "history" ? "history" : "active";

  const setTab = useCallback(
    (next: "active" | "history") => {
      const newParams = new URLSearchParams(params.toString());
      if (next === "history") newParams.set("tab", "history");
      else newParams.delete("tab");
      router.replace(`/admin/orders${newParams.toString() ? `?${newParams.toString()}` : ""}`);
    },
    [params, router]
  );

  return (
    <div>
      <div className="border-b border-outline-variant/20 bg-surface-container-high px-6 pt-4">
        <div className="flex gap-4">
          <button
            onClick={() => setTab("active")}
            className={`pb-3 text-sm font-medium border-b-2 transition ${
              tab === "active"
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant"
            }`}
          >
            Pedidos activos
          </button>
          <button
            onClick={() => setTab("history")}
            className={`pb-3 text-sm font-medium border-b-2 transition ${
              tab === "history"
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant"
            }`}
          >
            Historial
          </button>
        </div>
      </div>
      {tab === "active" ? <OrdersKanban /> : <OrdersHistory />}
    </div>
  );
}
