/**
 * In-tab Notification API helpers for customers (Rappi-style status updates).
 * Works while the tab/PWA is open or backgrounded — does NOT cover full-close
 * push (that requires a service worker + Web Push, intentionally not used here).
 */

export type NotifiableStatus =
  | "RECEIVED"
  | "PREPARING"
  | "READY"
  | "ON_THE_WAY"
  | "DELIVERED"
  | "CANCELLED";

type Copy = { title: string; body: string };

const COPY_PICKUP: Record<NotifiableStatus, Copy> = {
  RECEIVED: {
    title: "🍗 Pedido recibido",
    body: "Confirmamos tu pedido. En un momento empezamos a cocinar.",
  },
  PREPARING: {
    title: "🔥 Tu pollo está en la freidora",
    body: "Lo estamos cocinando con todo. Te avisamos cuando esté listo.",
  },
  READY: {
    title: "✅ Listo para recoger",
    body: "Pasa por tu pedido cuando puedas, te lo tenemos calientito.",
  },
  ON_THE_WAY: {
    title: "🛵 Tu pedido va en camino",
    body: "Estamos en ruta. Tenlo listo para recibirlo.",
  },
  DELIVERED: {
    title: "🎉 ¡Buen provecho!",
    body: "Disfruta tu pollo. Esperamos verte de nuevo.",
  },
  CANCELLED: {
    title: "❌ Pedido cancelado",
    body: "Tu pedido fue cancelado. Si fue un error, escríbenos.",
  },
};

const COPY_DELIVERY: Record<NotifiableStatus, Copy> = {
  ...COPY_PICKUP,
  READY: {
    title: "📦 Listo para envío",
    body: "Tu pedido sale rumbo a ti en unos minutos.",
  },
};

export function isNotifiableStatus(s: string): s is NotifiableStatus {
  return [
    "RECEIVED",
    "PREPARING",
    "READY",
    "ON_THE_WAY",
    "DELIVERED",
    "CANCELLED",
  ].includes(s);
}

export function notificationsAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    typeof Notification !== "undefined"
  );
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsAvailable()) return "unsupported";
  return Notification.permission;
}

/**
 * Ask the user for permission. Safe to call multiple times — no-ops if
 * already granted or denied.
 */
export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!notificationsAvailable()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

interface ShowOptions {
  status: NotifiableStatus;
  orderId: string;
  orderNumber?: number;
  orderType?: "DELIVERY" | "PICKUP";
  cancelReason?: string | null;
}

/**
 * Show a status notification. No-ops if permission isn't granted or the user
 * is already viewing this exact order (the tracker UI shows live updates).
 */
export function showOrderStatusNotification(opts: ShowOptions) {
  if (!notificationsAvailable()) return;
  if (Notification.permission !== "granted") return;

  // Don't double-notify if the user is already on this order's tracker.
  if (typeof window !== "undefined") {
    const onThisOrder =
      window.location.pathname === `/order/${opts.orderId}` &&
      document.visibilityState === "visible";
    if (onThisOrder) return;
  }

  const map = opts.orderType === "DELIVERY" ? COPY_DELIVERY : COPY_PICKUP;
  const base = map[opts.status];
  const title = opts.orderNumber
    ? `${base.title} · #${opts.orderNumber}`
    : base.title;
  const body =
    opts.status === "CANCELLED" && opts.cancelReason
      ? opts.cancelReason
      : base.body;

  try {
    const n = new Notification(title, {
      body,
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      tag: `pollon-order-${opts.orderId}`,
      renotify: true,
    } as NotificationOptions & { renotify?: boolean });

    n.onclick = () => {
      window.focus();
      window.location.href = `/order/${opts.orderId}`;
      n.close();
    };
  } catch {
    // Some browsers throw if called outside a user gesture window. Silent.
  }
}
