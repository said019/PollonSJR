import { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { mexicoTodayISO, mexicoDayRange, mexicoStartOfDaysAgo } from "../../utils/timezone";

export class ReportsService {
  constructor(private app: FastifyInstance) {}

  /**
   * Dashboard stats — real-time header for admin kanban.
   */
  async getDashboardStats() {
    // "Hoy" en México, no en UTC del servidor (Railway corre en UTC).
    const { start: today } = mexicoDayRange(mexicoTodayISO());

    const [orderStats, revenueStats, activeOrders, breakdown, byHour, topProducts, avgTime] =
      await Promise.all([
        this.app.prisma.order.count({
          where: { createdAt: { gte: today }, status: { notIn: ["PENDING_PAYMENT", "CANCELLED"] } },
        }),
        this.app.prisma.order.aggregate({
          where: { createdAt: { gte: today }, status: { notIn: ["PENDING_PAYMENT", "CANCELLED"] } },
          _sum: { subtotal: true, total: true, deliveryFee: true },
          _avg: { total: true },
        }),
        this.app.prisma.order.count({
          where: { status: { in: ["RECEIVED", "PREPARING", "READY", "ON_THE_WAY"] } },
        }),
        this.app.prisma.order.groupBy({
          by: ["type"],
          where: { createdAt: { gte: today }, status: { notIn: ["PENDING_PAYMENT", "CANCELLED"] } },
          _count: true,
        }),
        this.app.prisma.$queryRaw<Array<{ hour: number; orders: bigint }>>`
          SELECT EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'America/Mexico_City')::int as hour,
                 COUNT(*)::bigint as orders
          FROM "Order"
          WHERE DATE("createdAt" AT TIME ZONE 'America/Mexico_City') = CURRENT_DATE
          AND "status" NOT IN ('PENDING_PAYMENT','CANCELLED')
          GROUP BY hour ORDER BY hour`,
        this.app.prisma.$queryRaw<Array<{ name: string; units: bigint }>>`
          SELECT p.name, SUM(oi.qty)::bigint as units
          FROM "OrderItem" oi
          JOIN "Product" p ON p.id = oi."productId"
          JOIN "Order" o ON o.id = oi."orderId"
          WHERE DATE(o."createdAt" AT TIME ZONE 'America/Mexico_City') = CURRENT_DATE
          AND o."status" NOT IN ('PENDING_PAYMENT','CANCELLED')
          GROUP BY p.id, p.name
          ORDER BY units DESC LIMIT 5`,
        this.app.prisma.$queryRaw<Array<{ avg_minutes: number | null }>>`
          SELECT AVG(EXTRACT(EPOCH FROM (
            (SELECT "createdAt" FROM "OrderStatusLog" WHERE "orderId"=o.id AND "to"='DELIVERED' LIMIT 1)
            - (SELECT "createdAt" FROM "OrderStatusLog" WHERE "orderId"=o.id AND "to"='RECEIVED' LIMIT 1)
          )))/60.0 as avg_minutes
          FROM "Order" o
          WHERE DATE(o."createdAt" AT TIME ZONE 'America/Mexico_City') = CURRENT_DATE
          AND o."status" = 'DELIVERED'`,
      ]);

    return {
      orders: {
        total: orderStats,
        active: activeOrders,
      },
      revenue: {
        subtotal: revenueStats._sum.subtotal || 0,
        deliveryFees: revenueStats._sum.deliveryFee || 0,
        total: revenueStats._sum.total || 0,
        avgTicket: Math.round(revenueStats._avg.total || 0),
      },
      breakdown: breakdown.map((b) => ({
        type: b.type,
        count: b._count,
      })),
      byHour: byHour.map((h) => ({
        hour: h.hour,
        orders: Number(h.orders),
      })),
      topProducts: topProducts.map((p) => ({
        name: p.name,
        units: Number(p.units),
      })),
      avgPrepMinutes: avgTime[0]?.avg_minutes
        ? Math.round(avgTime[0].avg_minutes)
        : null,
    };
  }

  /**
   * Daily report for a specific date.
   */
  async getDailyReport(date?: string) {
    // Fechas en TZ de México (no UTC directo). Antes los pedidos creados después
    // de las 6pm México del día anterior caían en "hoy" porque parseábamos UTC.
    const targetDate = date ?? mexicoTodayISO();
    const { start: dayStart, end: dayEnd } = mexicoDayRange(targetDate);

    const [orders, products, customersToday] = await Promise.all([
      this.app.prisma.order.findMany({
        where: {
          createdAt: { gte: dayStart, lte: dayEnd },
          status: { notIn: ["PENDING_PAYMENT", "CANCELLED"] },
        },
        include: { items: { include: { product: true } }, customer: true, payment: true },
        orderBy: { createdAt: "asc" },
      }),
      this.app.prisma.$queryRaw<Array<{ name: string; category: string; units: bigint; revenue: bigint }>>`
        SELECT p.name, p.category, SUM(oi.qty)::bigint as units,
               SUM(oi.qty * oi."unitPrice")::bigint as revenue
        FROM "OrderItem" oi
        JOIN "Product" p ON p.id = oi."productId"
        JOIN "Order" o ON o.id = oi."orderId"
        WHERE DATE(o."createdAt" AT TIME ZONE 'America/Mexico_City') = ${targetDate}::date
        AND o."status" NOT IN ('PENDING_PAYMENT','CANCELLED')
        GROUP BY p.id, p.name, p.category ORDER BY units DESC`,
      this.app.prisma.order.findMany({
        where: { createdAt: { gte: dayStart, lte: dayEnd } },
        select: { customerId: true },
        distinct: ["customerId"],
      }),
    ]);

    const totalSales = orders.reduce((s, o) => s + o.total, 0);
    const deliveryOrders = orders.filter((o) => o.type === "DELIVERY").length;
    const pickupOrders = orders.filter((o) => o.type === "PICKUP").length;

    return {
      date: targetDate,
      summary: {
        totalOrders: orders.length,
        subtotal: orders.reduce((s, o) => s + o.subtotal, 0),
        deliveryFees: orders.reduce((s, o) => s + o.deliveryFee, 0),
        totalRevenue: totalSales,
        avgTicket: orders.length > 0 ? Math.round(totalSales / orders.length) : 0,
        deliveryOrders,
        pickupOrders,
        customersToday: customersToday.length,
      },
      products: products.map((p) => ({
        name: p.name,
        category: p.category,
        units: Number(p.units),
        revenue: Number(p.revenue),
      })),
    };
  }

  /**
   * Weekly report — last 7 days breakdown.
   */
  async getWeeklyReport() {
    const rows = await this.app.prisma.$queryRaw<
      Array<{
        day: Date;
        day_name: string;
        orders: bigint;
        revenue: bigint;
        avg_ticket: number;
      }>
    >`
      SELECT
        DATE("createdAt" AT TIME ZONE 'America/Mexico_City') as day,
        TO_CHAR("createdAt" AT TIME ZONE 'America/Mexico_City', 'Dy') as day_name,
        COUNT(*)::bigint as orders,
        COALESCE(SUM("subtotal"),0)::bigint as revenue,
        COALESCE(AVG("total"),0) as avg_ticket
      FROM "Order"
      WHERE "createdAt" >= NOW() - INTERVAL '7 days'
      AND "status" NOT IN ('PENDING_PAYMENT','CANCELLED')
      GROUP BY day, day_name
      ORDER BY day`;

    return {
      week: rows.map((r) => ({
        day: r.day,
        dayName: r.day_name,
        orders: Number(r.orders),
        revenue: Number(r.revenue),
        avgTicket: Math.round(r.avg_ticket),
      })),
    };
  }

  /**
   * Reports for the frontend view (N days with summary + comparison).
   */
  async getReportsView(days: number = 7, type?: "DELIVERY" | "PICKUP") {
    // N días hacia atrás desde el comienzo de hoy en TZ de México.
    const from = mexicoStartOfDaysAgo(days);

    // Comparison window: same length as current period, immediately preceding it.
    // Special case: when days=0 ("Hoy") compare against yesterday (1 full day).
    const prevFrom = new Date(from);
    prevFrom.setDate(prevFrom.getDate() - Math.max(days, 1));

    const typeWhere = type ? { type } : {};

    // Current period
    const currentOrders = await this.app.prisma.order.findMany({
      where: {
        createdAt: { gte: from },
        status: { notIn: ["PENDING_PAYMENT"] },
        ...typeWhere,
      },
      select: { total: true, subtotal: true, type: true, status: true, customerId: true, createdAt: true },
    });

    // Previous period for comparison
    const prevOrders = await this.app.prisma.order.findMany({
      where: {
        createdAt: { gte: prevFrom, lt: from },
        status: { notIn: ["PENDING_PAYMENT"] },
        ...typeWhere,
      },
      select: { total: true },
    });

    // Group by day
    const byDay = new Map<string, {
      totalOrders: number; totalRevenue: number; avgTicket: number;
      deliveryOrders: number; pickupOrders: number; cancelledOrders: number;
      customers: Set<string>;
    }>();

    for (const o of currentOrders) {
      const day = o.createdAt.toISOString().split("T")[0];
      if (!byDay.has(day)) {
        byDay.set(day, {
          totalOrders: 0, totalRevenue: 0, avgTicket: 0,
          deliveryOrders: 0, pickupOrders: 0, cancelledOrders: 0,
          customers: new Set(),
        });
      }
      const d = byDay.get(day)!;
      if (o.status !== "CANCELLED") {
        d.totalOrders++;
        d.totalRevenue += o.total;
        if (o.type === "DELIVERY") d.deliveryOrders++;
        else d.pickupOrders++;
      } else {
        d.cancelledOrders++;
      }
      d.customers.add(o.customerId);
    }

    const reports = Array.from(byDay.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, d]) => ({
        date,
        totalOrders: d.totalOrders,
        totalRevenue: d.totalRevenue,
        avgTicket: d.totalOrders > 0 ? Math.round(d.totalRevenue / d.totalOrders) : 0,
        deliveryOrders: d.deliveryOrders,
        pickupOrders: d.pickupOrders,
        cancelledOrders: d.cancelledOrders,
        newCustomers: d.customers.size,
      }));

    const validCurrent = currentOrders.filter((o) => o.status !== "CANCELLED");
    const periodRevenue = validCurrent.reduce((s, o) => s + o.total, 0);
    const periodOrders = validCurrent.length;
    const prevRevenue = prevOrders.reduce((s, o) => s + o.total, 0);
    const prevOrderCount = prevOrders.length;

    return {
      reports,
      summary: {
        periodRevenue,
        periodOrders,
        periodAvgTicket: periodOrders > 0 ? Math.round(periodRevenue / periodOrders) : 0,
        revenueChange: prevRevenue > 0
          ? ((periodRevenue - prevRevenue) / prevRevenue) * 100
          : 0,
        ordersChange: prevOrderCount > 0
          ? ((periodOrders - prevOrderCount) / prevOrderCount) * 100
          : 0,
      },
    };
  }

  /**
   * CSV export for a specific date.
   */
  async getDailyCsv(date?: string): Promise<{ csv: string; filename: string } | null> {
    const targetDate = date ?? mexicoTodayISO();
    const { start: dayStart, end: dayEnd } = mexicoDayRange(targetDate);

    const orders = await this.app.prisma.order.findMany({
      where: {
        createdAt: { gte: dayStart, lte: dayEnd },
        status: { notIn: ["PENDING_PAYMENT", "CANCELLED"] },
      },
      include: { customer: true, payment: true },
      orderBy: { createdAt: "asc" },
    });

    if (orders.length === 0) return null;

    const headers = [
      "# Pedido", "Hora", "Cliente", "WhatsApp", "Tipo", "Status",
      "Subtotal", "Envío", "Total", "Método de pago",
    ];

    const rows = orders.map((o) => [
      o.orderNumber,
      o.createdAt.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
      `"${(o.customer.name || "Sin nombre").replace(/"/g, '""')}"`,
      o.customer.phone,
      o.type,
      o.status,
      (o.subtotal / 100).toFixed(2),
      (o.deliveryFee / 100).toFixed(2),
      (o.total / 100).toFixed(2),
      o.payment?.paymentMethod || "N/A",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    return {
      csv: "\uFEFF" + csv, // BOM for Excel
      filename: `pollon-sjr-${targetDate}.csv`,
    };
  }
}
