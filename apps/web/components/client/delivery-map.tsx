"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

export const DeliveryMap = dynamic(
  () => import("./delivery-map-inner").then((m) => m.DeliveryMapInner),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full bg-gray-100 rounded-xl flex items-center justify-center"
        style={{ height: "280px" }}
      >
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    ),
  }
);
