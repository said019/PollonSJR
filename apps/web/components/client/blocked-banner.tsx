"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";
import { useEffect, useState } from "react";
import { ShieldOff, MessageCircle } from "lucide-react";

interface CustomerProfile {
  id: string;
  phone: string;
  name: string | null;
  blocked?: boolean;
  blockedReason?: string | null;
}

const SUPPORT_PHONE = "525555555555"; // TODO: leer de config

export function BlockedBanner() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(getToken());
  }, []);

  const { data: profile } = useQuery({
    queryKey: ["customer-me"],
    queryFn: () =>
      api.get<CustomerProfile>("/api/customers/me", token || undefined),
    enabled: !!token,
  });

  if (!profile?.blocked) return null;

  const message =
    profile.blockedReason ||
    "Tu cuenta tiene una restricción para hacer pedidos.";

  const waText = encodeURIComponent(
    `Hola, tengo un problema con mi cuenta de Pollón SJR. Mi teléfono es ${profile.phone}. Motivo: ${message}`
  );

  return (
    <div className="border-b border-error/30 bg-gradient-to-r from-error/95 to-error text-on-error px-4 py-3">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-start gap-2">
          <ShieldOff size={16} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-headline font-bold">Cuenta restringida</p>
            <p className="text-xs opacity-90">{message}</p>
          </div>
        </div>
        <a
          href={`https://wa.me/${SUPPORT_PHONE}?text=${waText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-on-error px-3 py-1.5 font-headline text-[11px] font-bold uppercase tracking-wider text-error transition-colors hover:bg-on-error/90"
        >
          <MessageCircle size={11} />
          Contactar soporte
        </a>
      </div>
    </div>
  );
}
