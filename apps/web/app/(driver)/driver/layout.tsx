"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getDriverToken, removeDriverToken, parseJwt } from "@/lib/auth";

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (pathname === "/driver/login") {
      setReady(true);
      return;
    }
    const token = getDriverToken();
    if (!token) {
      router.replace("/driver/login");
      return;
    }
    const payload = parseJwt(token);
    const expMs = payload?.exp ? (payload.exp as number) * 1000 : 0;
    if (!payload || expMs < Date.now()) {
      removeDriverToken();
      router.replace("/driver/login");
      return;
    }
    setReady(true);
  }, [pathname, router]);

  if (pathname === "/driver/login") return <>{children}</>;

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <div className="min-h-screen bg-surface">{children}</div>;
}
