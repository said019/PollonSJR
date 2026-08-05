import { FastifyInstance } from "fastify";
import type { DashboardStats } from "@pollon/types";
import { mexicoStartOfToday } from "../../utils/timezone";
import {
  updateStoreConfig as updateConfig,
  updateStoreHours as updateHrs,
} from "./store-config.service";

export class AdminService {
  constructor(private app: FastifyInstance) {}

  async getDashboard(): Promise<DashboardStats> {
    // "Hoy" en TZ de México, no del servidor (Railway = UTC).
    const today = mexicoStartOfToday();

    const [ordersToday, salesToday, activeOrders, customersToday] =
      await this.app.prisma.$transaction([
        this.app.prisma.order.count({
          where: { createdAt: { gte: today }, status: { not: "CANCELLED" } },
        }),
        this.app.prisma.order.aggregate({
          where: { createdAt: { gte: today }, status: { in: ["RECEIVED", "PREPARING", "READY", "ON_THE_WAY", "DELIVERED"] } },
          _sum: { total: true },
        }),
        this.app.prisma.order.count({
          where: { status: { in: ["RECEIVED", "PREPARING", "READY", "ON_THE_WAY"] } },
        }),
        this.app.prisma.order.findMany({
          where: { createdAt: { gte: today } },
          select: { customerId: true },
          distinct: ["customerId"],
        }),
      ]);

    const sales = salesToday._sum.total || 0;

    return {
      ordersToday,
      salesToday: sales,
      averageTicket: ordersToday > 0 ? Math.round(sales / ordersToday) : 0,
      activeOrders,
      customersToday: customersToday.length,
    };
  }

  async updateStoreConfig(data: Partial<{
    isOpen: boolean;
    deliveryActive: boolean;
    acceptOrders: boolean;
    closedMessage: string | null;
    transferClabe: string | null;
    transferBank: string | null;
    transferAccountHolder: string | null;
  }>) {
    return updateConfig(this.app, data);
  }

  async updateHours(data: { openTime: string; closeTime: string; openDays: number[] }) {
    return updateHrs(this.app, data);
  }

  async getCustomers(
    page: number = 1,
    limit: number = 20,
    search?: string,
    segment?: string,
    sort?: string
  ) {
    const where = search?.trim()
      ? {
          OR: [
            { name: { contains: search.trim(), mode: "insensitive" as const } },
            { phone: { contains: search.trim() } },
            { email: { contains: search.trim(), mode: "insensitive" as const } },
          ],
        }
      : {};

    // Se traen TODOS los clientes que cumplen la búsqueda para poder segmentar,
    // ordenar y contar sobre el total — antes el filtro por segmento se aplicaba
    // en el navegador sobre la página visible, así que "VIP" sólo encontraba los
    // VIP de esos 20 y parecía que no había ninguno.
    const customers = await this.app.prisma.customer.findMany({
      where,
      include: {
        loyalty: {
          select: {
            completedOrders: true,
            pendingReward: true,
            freeProductsEarned: true,
            freeProductsUsed: true,
          },
        },
        _count: { select: { savedAddresses: true } },
        orders: {
          select: {
            total: true,
            status: true,
            rating: true,
            createdAt: true,
            type: true,
            paymentMethod: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const now = Date.now();
    const mapped = customers.map((c) => {
      const delivered = c.orders.filter((o) => o.status === "DELIVERED");
      const totalSpent = delivered.reduce((sum, o) => sum + o.total, 0);
      const rated = delivered.filter((o) => o.rating !== null);
      const avgRating =
        rated.length > 0
          ? Math.round((rated.reduce((sum, o) => sum + (o.rating ?? 0), 0) / rated.length) * 10) / 10
          : null;

      const lastOrderAt = c.orders[0]?.createdAt;
      const daysSinceLast = lastOrderAt
        ? Math.floor((now - lastOrderAt.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Auto segment based on behavior
      let segment: "VIP" | "REGULAR" | "NEW" | "AT_RISK" | "INACTIVE" = "NEW";
      if (delivered.length === 0) {
        segment = "NEW";
      } else if (delivered.length >= 10 && totalSpent >= 100000 /* $1000 */) {
        segment = "VIP";
      } else if (daysSinceLast != null && daysSinceLast > 60) {
        segment = "INACTIVE";
      } else if (daysSinceLast != null && daysSinceLast > 30 && delivered.length >= 3) {
        segment = "AT_RISK";
      } else if (delivered.length >= 3) {
        segment = "REGULAR";
      }

      // Métricas de negocio que antes no se calculaban
      const cancelled = c.orders.filter((o) => o.status === "CANCELLED").length;
      const avgTicket =
        delivered.length > 0 ? Math.round(totalSpent / delivered.length) : 0;

      // Cómo suele pedir: a domicilio o a recoger, y con qué paga
      const cuenta = <T extends string>(vals: T[]) => {
        const m = new Map<T, number>();
        vals.forEach((v) => m.set(v, (m.get(v) ?? 0) + 1));
        let top: T | null = null;
        let max = 0;
        m.forEach((n, v) => { if (n > max) { max = n; top = v; } });
        return top;
      };
      const preferredType = delivered.length ? cuenta(delivered.map((o) => o.type as string)) : null;
      const preferredPayment = delivered.length
        ? cuenta(delivered.map((o) => o.paymentMethod as string))
        : null;

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email ?? null,
        // Con el acceso sin contraseña importa saber quién todavía usa una
        hasPassword: !!c.password,
        createdAt: c.createdAt.toISOString(),
        internalNote: c.internalNote ?? null,
        blocked: c.blocked,
        blockedReason: c.blockedReason ?? null,
        totalOrders: c.orders.length,
        deliveredOrders: delivered.length,
        cancelledOrders: cancelled,
        totalSpent,
        avgTicket,
        avgRating,
        ratingCount: rated.length,
        loyaltyProgress: c.loyalty?.completedOrders ?? 0,
        pendingReward: c.loyalty?.pendingReward ?? false,
        freeProductsEarned: c.loyalty?.freeProductsEarned ?? 0,
        freeProductsUsed: c.loyalty?.freeProductsUsed ?? 0,
        savedAddresses: c._count.savedAddresses,
        preferredType,
        preferredPayment,
        lastOrderAt: lastOrderAt?.toISOString() ?? null,
        daysSinceLast,
        segment,
      };
    });

    // Conteo por segmento sobre el TOTAL (para mostrarlo en los filtros)
    const segmentCounts = mapped.reduce(
      (acc, c) => {
        acc[c.segment] = (acc[c.segment] ?? 0) + 1;
        if (c.blocked) acc.BLOCKED += 1;
        return acc;
      },
      { VIP: 0, REGULAR: 0, NEW: 0, AT_RISK: 0, INACTIVE: 0, BLOCKED: 0 } as Record<string, number>
    );

    // Filtro por segmento en el SERVIDOR (antes era sobre la página visible)
    let lista = mapped;
    if (segment && segment !== "ALL") {
      lista = segment === "BLOCKED"
        ? mapped.filter((c) => c.blocked)
        : mapped.filter((c) => c.segment === segment);
    }

    // Orden configurable
    const orden: Record<string, (a: typeof lista[0], b: typeof lista[0]) => number> = {
      recientes: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      gasto: (a, b) => b.totalSpent - a.totalSpent,
      pedidos: (a, b) => b.deliveredOrders - a.deliveredOrders,
      ultimo: (a, b) => (a.daysSinceLast ?? 9e9) - (b.daysSinceLast ?? 9e9),
      lealtad: (a, b) => b.loyaltyProgress - a.loyaltyProgress,
    };
    lista = [...lista].sort(orden[sort ?? "recientes"] ?? orden.recientes);

    // Resumen del negocio (sobre la lista filtrada)
    const conCompra = lista.filter((c) => c.deliveredOrders > 0);
    const resumen = {
      clientes: lista.length,
      conCompra: conCompra.length,
      recurrentes: lista.filter((c) => c.deliveredOrders >= 2).length,
      ingresos: lista.reduce((s, c) => s + c.totalSpent, 0),
      ticketPromedio: conCompra.length
        ? Math.round(conCompra.reduce((s, c) => s + c.totalSpent, 0) /
            conCompra.reduce((s, c) => s + c.deliveredOrders, 0))
        : 0,
      premiosPendientes: lista.filter((c) => c.pendingReward).length,
    };

    const total = lista.length;
    const skip = (page - 1) * limit;

    return {
      customers: lista.slice(skip, skip + limit),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      segmentCounts,
      resumen,
    };
  }

  async getCustomerOrders(customerId: string, limit = 20) {
    const orders = await this.app.prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        type: true,
        total: true,
        createdAt: true,
        rating: true,
      },
    });
    return orders.map((o) => ({
      ...o,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  async getDailyReport() {
    const today = mexicoStartOfToday();

    const orders = await this.app.prisma.order.findMany({
      where: { createdAt: { gte: today }, status: { not: "CANCELLED" } },
      include: { items: { include: { product: true } }, customer: true },
      orderBy: { createdAt: "asc" },
    });

    const totalSales = orders.reduce((sum, o) => sum + o.total, 0);
    const avgTicket = orders.length > 0 ? Math.round(totalSales / orders.length) : 0;

    return {
      date: today.toISOString().split("T")[0],
      totalOrders: orders.length,
      totalSales,
      averageTicket: avgTicket,
      orders: orders.map((o) => ({
        orderNumber: o.orderNumber,
        status: o.status,
        total: o.total,
        customerPhone: o.customer.phone,
        items: o.items.map((i) => `${i.qty}x ${i.product.name}`).join(", "),
        createdAt: o.createdAt.toISOString(),
      })),
    };
  }
}
