import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { BusinessReports } from "@pollon/types";
import { mexicoDayRange, mexicoTodayISO } from "../../utils/timezone";

const DAY_MS = 86_400_000;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Fecha inválida");

export const reportFiltersSchema = z.object({
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
  days: z.coerce.number().int().min(0).max(366).optional(),
  type: z.enum(["DELIVERY", "PICKUP"]).optional(),
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER"]).optional(),
}).superRefine((value, ctx) => {
  if (Boolean(value.dateFrom) !== Boolean(value.dateTo)) {
    ctx.addIssue({ code: "custom", message: "Selecciona fecha inicial y final" });
  }
  if (value.dateFrom && value.dateTo) {
    const days = (Date.parse(value.dateTo) - Date.parse(value.dateFrom)) / DAY_MS + 1;
    if (days < 1 || days > 366) {
      ctx.addIssue({ code: "custom", message: "El período debe ser de 1 a 366 días" });
    }
  }
});

export type ReportFilters = z.infer<typeof reportFiltersSchema>;

export function reportPeriod(filters: ReportFilters, today = mexicoTodayISO()) {
  const days = Math.max(filters.days ?? 7, 1);
  const dateTo = filters.dateTo ?? today;
  const dateFrom = filters.dateFrom ?? shiftDate(dateTo, 1 - days);
  const length = Math.round((Date.parse(dateTo) - Date.parse(dateFrom)) / DAY_MS) + 1;
  return {
    dateFrom, dateTo, days: length,
    previousFrom: shiftDate(dateFrom, -length),
    previousTo: shiftDate(dateFrom, -1),
    timeZone: "America/Mexico_City",
  };
}

function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Prisma DateTime columns are timestamp without time zone and store UTC. */
const localCreated = Prisma.sql`(o."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City')`;
const validOrder = Prisma.sql`o.status NOT IN ('PENDING_PAYMENT', 'CANCELLED')`;

function wherePeriod(filters: ReportFilters, dateFrom: string, dateTo: string) {
  return Prisma.sql`o."createdAt" >= (${mexicoDayRange(dateFrom).start.toISOString()}::timestamptz AT TIME ZONE 'UTC')
    AND o."createdAt" <= (${mexicoDayRange(dateTo).end.toISOString()}::timestamptz AT TIME ZONE 'UTC')
    ${filters.type ? Prisma.sql`AND o.type::text = ${filters.type}` : Prisma.empty}
    ${filters.paymentMethod ? Prisma.sql`AND o."paymentMethod"::text = ${filters.paymentMethod}` : Prisma.empty}`;
}

export function percentageChange(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : current === 0 ? 0 : null;
}

export async function getBusinessReports(
  app: { prisma: Pick<Prisma.TransactionClient, "$queryRaw"> },
  filters: ReportFilters
): Promise<BusinessReports> {
  const period = reportPeriod(filters);
  const where = wherePeriod(filters, period.dateFrom, period.dateTo);
  const previousWhere = wherePeriod(filters, period.previousFrom, period.previousTo);
  const [days, previous, financial, payments, statuses, topProducts, byHour, customers] = await Promise.all([
    app.prisma.$queryRaw<Array<{
      date: string; totalOrders: number; totalRevenue: number; deliveryOrders: number;
      pickupOrders: number; cancelledOrders: number; pendingOrders: number; customers: number;
    }>>(Prisma.sql`
      SELECT TO_CHAR(${localCreated}, 'YYYY-MM-DD') AS date,
        COUNT(*) FILTER (WHERE ${validOrder})::float8 AS "totalOrders",
        COALESCE(SUM(o.total) FILTER (WHERE ${validOrder}), 0)::float8 AS "totalRevenue",
        COUNT(*) FILTER (WHERE ${validOrder} AND o.type = 'DELIVERY')::float8 AS "deliveryOrders",
        COUNT(*) FILTER (WHERE ${validOrder} AND o.type = 'PICKUP')::float8 AS "pickupOrders",
        COUNT(*) FILTER (WHERE o.status = 'CANCELLED')::float8 AS "cancelledOrders",
        COUNT(*) FILTER (WHERE o.status = 'PENDING_PAYMENT')::float8 AS "pendingOrders",
        COUNT(DISTINCT o."customerId") FILTER (WHERE ${validOrder})::float8 AS customers
      FROM "Order" o WHERE ${where} GROUP BY date ORDER BY date DESC`),
    app.prisma.$queryRaw<Array<{ orders: number; revenue: number }>>(Prisma.sql`
      SELECT COUNT(*)::float8 AS orders, COALESCE(SUM(o.total), 0)::float8 AS revenue
      FROM "Order" o WHERE ${previousWhere} AND ${validOrder}`),
    app.prisma.$queryRaw<Array<{
      subtotal: number; discounts: number; deliveryFees: number; tips: number; appFees: number; refunds: number;
    }>>(Prisma.sql`
      SELECT
        COALESCE(SUM(o.subtotal) FILTER (WHERE ${validOrder}), 0)::float8 AS subtotal,
        COALESCE(SUM(o."discountAmount") FILTER (WHERE ${validOrder}), 0)::float8 AS discounts,
        COALESCE(SUM(o."deliveryFee") FILTER (WHERE ${validOrder}), 0)::float8 AS "deliveryFees",
        COALESCE(SUM(o."tipAmount") FILTER (WHERE ${validOrder}), 0)::float8 AS tips,
        COALESCE(SUM(o."appFeeAmount") FILTER (WHERE ${validOrder}), 0)::float8 AS "appFees",
        COALESCE(SUM(p."refundedAmount"), 0)::float8 AS refunds
      FROM "Order" o LEFT JOIN "Payment" p ON p."orderId" = o.id WHERE ${where}`),
    app.prisma.$queryRaw<BusinessReports["payments"]>(Prisma.sql`
      SELECT o."paymentMethod"::text AS method, COUNT(*)::float8 AS orders,
        COALESCE(SUM(o.total), 0)::float8 AS revenue
      FROM "Order" o WHERE ${where} AND ${validOrder}
      GROUP BY o."paymentMethod" ORDER BY revenue DESC`),
    app.prisma.$queryRaw<BusinessReports["statuses"]>(Prisma.sql`
      SELECT o.status::text AS status, COUNT(*)::float8 AS orders
      FROM "Order" o WHERE ${where} GROUP BY o.status ORDER BY orders DESC`),
    app.prisma.$queryRaw<BusinessReports["topProducts"]>(Prisma.sql`
      SELECT p.id, p.name, SUM(oi.qty)::float8 AS units,
        SUM(oi.qty::bigint * oi."unitPrice")::float8 AS "grossRevenue"
      FROM "Order" o JOIN "OrderItem" oi ON oi."orderId" = o.id
      JOIN "Product" p ON p.id = oi."productId"
      WHERE ${where} AND ${validOrder}
      GROUP BY p.id, p.name ORDER BY units DESC, p.name LIMIT 10`),
    app.prisma.$queryRaw<BusinessReports["byHour"]>(Prisma.sql`
      SELECT EXTRACT(HOUR FROM ${localCreated})::int AS hour, COUNT(*)::float8 AS orders
      FROM "Order" o WHERE ${where} AND ${validOrder} GROUP BY hour ORDER BY hour`),
    app.prisma.$queryRaw<Array<{ date: string; customers: number; newCustomers: number }>>(Prisma.sql`
      WITH buyers AS (
        SELECT o."customerId", MIN(o."createdAt") AS "firstInPeriod"
        FROM "Order" o WHERE ${where} AND ${validOrder} GROUP BY o."customerId"
      ), classified AS (
        SELECT b.*, NOT EXISTS (
          SELECT 1 FROM "Order" earlier WHERE earlier."customerId" = b."customerId"
            AND earlier.status NOT IN ('PENDING_PAYMENT', 'CANCELLED')
            AND earlier."createdAt" < b."firstInPeriod"
        ) AS "isNew" FROM buyers b
      )
      SELECT TO_CHAR("firstInPeriod" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD') AS date,
        COUNT(*)::float8 AS customers, COUNT(*) FILTER (WHERE "isNew")::float8 AS "newCustomers"
      FROM classified GROUP BY date`),
  ]);

  const reportDays = new Map(days.map((day) => [day.date, day]));
  const newByDay = new Map(customers.map((day) => [day.date, day.newCustomers]));
  const reports = Array.from({ length: period.days }, (_, i) => {
    const date = shiftDate(period.dateTo, -i);
    const day = reportDays.get(date) ?? {
      date, totalOrders: 0, totalRevenue: 0, deliveryOrders: 0, pickupOrders: 0,
      cancelledOrders: 0, pendingOrders: 0, customers: 0,
    };
    return { ...day, avgTicket: day.totalOrders ? Math.round(day.totalRevenue / day.totalOrders) : 0, newCustomers: newByDay.get(date) ?? 0 };
  });
  const total = (key: "totalOrders" | "totalRevenue" | "cancelledOrders" | "pendingOrders" | "deliveryOrders" | "pickupOrders") =>
    reports.reduce((sum, day) => sum + day[key], 0);
  const statusCount = (status: string) => statuses.find((row) => row.status === status)?.orders ?? 0;
  const periodOrders = total("totalOrders");
  const periodRevenue = total("totalRevenue");
  const cancelledOrders = total("cancelledOrders");
  const customerCount = customers.reduce((sum, row) => sum + row.customers, 0);
  const newCustomers = customers.reduce((sum, row) => sum + row.newCustomers, 0);
  return {
    period, reports, payments, statuses, topProducts, byHour,
    summary: {
      periodOrders, periodRevenue,
      periodAvgTicket: periodOrders ? Math.round(periodRevenue / periodOrders) : 0,
      revenueChange: percentageChange(periodRevenue, previous[0].revenue),
      ordersChange: percentageChange(periodOrders, previous[0].orders),
      ...financial[0],
      customers: customerCount, newCustomers, returningCustomers: customerCount - newCustomers,
      cancelledOrders, pendingOrders: total("pendingOrders"),
      activeOrders: ["RECEIVED", "PREPARING", "READY", "ON_THE_WAY"].reduce((sum, status) => sum + statusCount(status), 0),
      deliveredOrders: statusCount("DELIVERED"),
      deliveryOrders: total("deliveryOrders"), pickupOrders: total("pickupOrders"),
      cancellationRate: periodOrders + cancelledOrders ? cancelledOrders / (periodOrders + cancelledOrders) * 100 : 0,
    },
  };
}

export function businessReportsCsv(data: BusinessReports) {
  const headers = ["Fecha (México)", "Pedidos confirmados", "Venta confirmada (MXN)", "Ticket promedio (MXN)", "Envíos", "Sucursal", "Cancelados", "Pendientes de pago", "Clientes compradores", "Clientes primera compra"];
  const rows = data.reports.map((day) => [day.date, day.totalOrders, (day.totalRevenue / 100).toFixed(2),
    (day.avgTicket / 100).toFixed(2), day.deliveryOrders, day.pickupOrders, day.cancelledOrders,
    day.pendingOrders, day.customers, day.newCustomers]);
  return "\uFEFF" + [headers, ...rows].map((row) => row.join(",")).join("\r\n");
}
