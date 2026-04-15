"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

export const DeliveryMap = dynamic(
  () => import("./delivery-map-inner").then((m) => m.DeliveryMapInner),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex h-[220px] w-full items-center justify-center rounded-lg bg-surface-container-high sm:h-[240px]"
      >
        <Loader2 size={24} className="animate-spin text-on-surface-variant" />
      </div>
    ),
  }
);
