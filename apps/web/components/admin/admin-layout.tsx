"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, ShoppingBag, UtensilsCrossed, Users, BarChart3, Settings, LogOut, Truck } from "lucide-react";
import { getAdminToken, removeAdminToken, parseJwt } from "@/lib/auth";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Pedidos", icon: ShoppingBag },
  { href: "/admin/menu", label: "Menú", icon: UtensilsCrossed },
  { href: "/admin/delivery", label: "Envíos", icon: Truck },
  { href: "/admin/customers", label: "Clientes", icon: Users },
  { href: "/admin/reports", label: "Reportes", icon: BarChart3 },
  { href: "/admin/settings", label: "Config", icon: Settings },
];

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Skip auth check on the login page itself
    if (pathname === "/admin/login") {
      setReady(true);
      return;
    }
    const token = getAdminToken();
    if (!token) {
      router.replace("/admin/login");
      return;
    }

    // Check token expiry before any API call
    const payload = parseJwt(token);
    const expMs = payload?.exp ? (payload.exp as number) * 1000 : 0;
    if (!payload || expMs < Date.now()) {
      removeAdminToken();
      router.replace("/admin/login");
      return;
    }

    setReady(true);
  }, [pathname, router]);

  const handleLogout = () => {
    removeAdminToken();
    router.push("/admin/login");
  };

  // On login page, render children directly without sidebar
  if (pathname === "/admin/login") return <>{children}</>;

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-surface-container">
      {/* Sidebar */}
      <aside className="w-64 bg-surface-container-high border-r hidden md:flex flex-col">
        <div className="p-4 border-b flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg overflow-hidden border border-primary/20 flex-shrink-0">
            <Image
              src="/pollon-logo.jpg"
              alt="Pollón SJR"
              width={40}
              height={40}
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-lg font-headline font-bold text-primary">POLLÓN Admin</h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  active
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:bg-surface-variant"
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-error transition"
          >
            <LogOut size={18} /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-surface-container-high border-b z-30 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-primary/20">
              <Image
                src="/pollon-logo.jpg"
                alt="Pollón SJR"
                width={32}
                height={32}
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-base font-headline font-bold text-primary">POLLÓN</h1>
          </div>
          <div className="flex gap-3 overflow-x-auto">
            {NAV_ITEMS.slice(0, 4).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`p-2 rounded-lg ${
                  pathname === item.href ? "bg-primary text-on-primary" : "text-on-surface-variant"
                }`}
              >
                <item.icon size={18} />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 md:overflow-y-auto mt-14 md:mt-0">
        {children}
      </main>
    </div>
  );
}
