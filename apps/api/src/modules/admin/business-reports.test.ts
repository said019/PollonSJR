import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { businessReportsCsv, getBusinessReports, percentageChange, reportFiltersSchema, reportPeriod } from "./business-reports";

test("report dates are inclusive, preserve days=0, and compare equal calendar windows", () => {
  assert.deepEqual(reportPeriod({ days: 0 }, "2026-01-01"), {
    dateFrom: "2026-01-01", dateTo: "2026-01-01", previousFrom: "2025-12-31",
    previousTo: "2025-12-31", days: 1, timeZone: "America/Mexico_City",
  });
  assert.equal(reportPeriod({ days: 7 }, "2026-10-16").dateFrom, "2026-10-10");
  const leap = reportPeriod({ dateFrom: "2024-02-28", dateTo: "2024-03-01" });
  assert.equal(leap.days, 3);
  assert.equal(leap.previousTo, "2024-02-27");
  assert.equal(leap.previousFrom, "2024-02-25");
});

test("invalid, inverted, unbounded, and unsupported report filters are rejected", () => {
  for (const query of [
    { dateFrom: "2026-02-30", dateTo: "2026-03-01" },
    { dateFrom: "2026-10-17", dateTo: "2026-10-16" },
    { dateFrom: "2026-01-01" }, { days: "invalid" }, { days: -1 },
    { dateFrom: "2024-01-01", dateTo: "2026-01-01" },
    { type: "invalid" }, { paymentMethod: "invalid" },
  ]) assert.equal(reportFiltersSchema.safeParse(query).success, false, JSON.stringify(query));
  assert.equal(reportFiltersSchema.safeParse({ days: "0" }).success, true);
});

test("a zero comparison base is not reported as zero growth", () => {
  assert.equal(percentageChange(100, 0), null);
  assert.equal(percentageChange(0, 0), 0);
  assert.equal(percentageChange(0, 100), -100);
});

// Run against an explicitly provided LOCAL database. All fixtures are temporary
// tables inside one transaction; no application records are read or changed.
test("SQL reports reconcile dates, cancelled orders, filters, buyers and exports", {
  skip: !process.env.REPORTS_TEST_DATABASE_URL,
}, async () => {
  const url = new URL(process.env.REPORTS_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Use a local database for report fixtures");
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE "Order" (
        id text, "customerId" text, status text, type text, "paymentMethod" text,
        "createdAt" timestamp(3), total integer, subtotal integer,
        "discountAmount" integer DEFAULT 0, "deliveryFee" integer DEFAULT 0,
        "tipAmount" integer DEFAULT 0, "appFeeAmount" integer DEFAULT 0
      ) ON COMMIT DROP`);
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE "Product" (id text, name text) ON COMMIT DROP`);
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE "OrderItem" ("orderId" text, "productId" text, qty integer, "unitPrice" integer) ON COMMIT DROP`);
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE "Payment" ("orderId" text, "refundedAmount" integer) ON COMMIT DROP`);
      await tx.$executeRawUnsafe(`INSERT INTO "Order" (id,"customerId",status,type,"paymentMethod","createdAt",total,subtotal) VALUES
        ('previous','repeat','DELIVERED','PICKUP','CASH','2026-10-14 18:00:00',10000,10000),
        ('previous-cancel','cancel','CANCELLED','PICKUP','CASH','2026-10-14 20:00:00',90000,90000),
        ('before','edge','DELIVERED','PICKUP','CASH','2026-10-15 05:59:59.999',2000,2000),
        ('first','new','DELIVERED','DELIVERY','CARD','2026-10-15 06:00:00',11000,10000),
        ('late','repeat','DELIVERED','PICKUP','CASH','2026-10-16 05:59:59.999',20000,21000),
        ('after','new','RECEIVED','DELIVERY','TRANSFER','2026-10-16 06:00:00',9000,9000),
        ('cancel','new','CANCELLED','PICKUP','CASH','2026-10-15 19:00:00',99000,99000),
        ('pending','new','PENDING_PAYMENT','PICKUP','CASH','2026-10-15 20:00:00',99000,99000)`);
      await tx.$executeRawUnsafe(`UPDATE "Order" SET "discountAmount"=500,"deliveryFee"=1000,"tipAmount"=300,"appFeeAmount"=200 WHERE id='first'`);
      await tx.$executeRawUnsafe(`UPDATE "Order" SET "discountAmount"=1000 WHERE id='late'`);
      await tx.$executeRawUnsafe(`INSERT INTO "Product" VALUES ('chicken','Pollo')`);
      await tx.$executeRawUnsafe(`INSERT INTO "OrderItem" VALUES ('first','chicken',2,5000),('late','chicken',1,21000),('cancel','chicken',10,9900)`);
      await tx.$executeRawUnsafe(`INSERT INTO "Payment" VALUES ('late',2000)`);
      const app = { prisma: tx } as unknown as FastifyInstance;
      const filters = { dateFrom: "2026-10-15", dateTo: "2026-10-15" };
      const report = await getBusinessReports(app, filters);
      await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
      assert.deepEqual(await getBusinessReports(app, filters), report, "Server timezone must not change Mexican report dates");
      assert.equal(report.summary.periodRevenue, 31000);
      assert.equal(report.summary.periodOrders, 2);
      assert.equal(report.summary.periodAvgTicket, 15500);
      assert.equal(report.summary.cancelledOrders, 1);
      assert.equal(report.summary.pendingOrders, 1);
      assert.equal(report.summary.customers, 2);
      assert.equal(report.summary.newCustomers, 1);
      assert.equal(report.summary.returningCustomers, 1);
      assert.equal(report.summary.refunds, 2000);
      assert.equal(report.summary.revenueChange, (31000 - 12000) / 12000 * 100);
      const s = report.summary;
      assert.equal(s.subtotal - s.discounts + s.deliveryFees + s.tips + s.appFees, s.periodRevenue);
      assert.equal(report.reports[0].date, "2026-10-15");
      assert.deepEqual(report.byHour, [{ hour: 0, orders: 1 }, { hour: 23, orders: 1 }]);
      assert.deepEqual(report.topProducts, [{ id: "chicken", name: "Pollo", units: 3, grossRevenue: 31000 }]);
      assert.equal(report.payments.reduce((sum, row) => sum + row.revenue, 0), s.periodRevenue);
      const card = await getBusinessReports(app, { ...filters, paymentMethod: "CARD" });
      assert.equal(card.summary.periodRevenue, 11000);
      assert.equal(card.summary.newCustomers, 1);
      assert.equal(card.topProducts[0].units, 2);
      const pickup = await getBusinessReports(app, { ...filters, type: "PICKUP" });
      assert.equal(pickup.summary.periodRevenue, 20000);
      assert.equal(pickup.summary.newCustomers, 0);
      assert.equal(pickup.summary.deliveryOrders, 0);
      const twoDays = await getBusinessReports(app, { ...filters, dateTo: "2026-10-16" });
      assert.equal(twoDays.summary.customers, 2);
      assert.equal(twoDays.reports.reduce((sum, row) => sum + row.customers, 0), 3);
      assert.equal(twoDays.summary.newCustomers, 1);
      const empty = await getBusinessReports(app, { dateFrom: "2026-10-17", dateTo: "2026-10-19" });
      assert.equal(empty.reports.length, 3);
      assert.equal(empty.summary.periodRevenue, 0);
      assert.equal(empty.summary.customers, 0);
      const csv = businessReportsCsv(card);
      assert.ok(csv.startsWith("\uFEFF"));
      assert.match(csv, /2026-10-15,1,110.00,110.00,1,0,0,0,1,1/);
    }, { timeout: 20000 });
  } finally { await prisma.$disconnect(); }
});

test("report routes reject unauthenticated requests and invalid date filters", async () => {
  const { default: Fastify } = await import("fastify");
  const { reportsRoutes } = await import("./reports.routes");
  const { signAdminToken } = await import("../auth/jwt.service");
  const app = Fastify();
  await app.register(reportsRoutes, { prefix: "/api/admin" });
  try {
    for (const path of ["/api/admin/reports", "/api/admin/reports/csv"]) {
      assert.equal((await app.inject({ url: path })).statusCode, 401);
      const result = await app.inject({
        url: path + "?dateFrom=2026-10-16&dateTo=2026-10-01",
        headers: { authorization: "Bearer " + signAdminToken("test-admin", "test@example.com") },
      });
      assert.equal(result.statusCode, 400);
      assert.match(result.json().error, /1 a 366/);
    }
  } finally { await app.close(); }
});
