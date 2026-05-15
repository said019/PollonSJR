import { FastifyInstance } from "fastify";
import { mexicoTodayISO, mexicoDayRange } from "../utils/timezone";

/**
 * Daily report — runs at 23:30.
 * Generates summary, saves to DailyReport table, logs WA link.
 */
export async function runDailyReport(app: FastifyInstance) {
  // "Hoy" en México, no en UTC. Si esto corre a las 23:30 UTC (= 17:30 México),
  // queremos contar pedidos del día Mexicano actual, no del UTC.
  const today = mexicoTodayISO();
  const { start: dayStart, end: dayEnd } = mexicoDayRange(today);

  const orders = await app.prisma.order.findMany({
    where: {
      createdAt: { gte: dayStart, lte: dayEnd },
      status: { notIn: ["PENDING_PAYMENT", "CANCELLED"] },
    },
    include: { items: { include: { product: true } } },
  });

  // No orders? Skip report
  if (orders.length === 0) {
    app.log.info(`Daily report: no orders on ${today}, skipping`);
    return;
  }

  const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
  const avgTicket = Math.round(totalRevenue / orders.length);
  const deliveryCount = orders.filter((o) => o.type === "DELIVERY").length;
  const pickupCount = orders.filter((o) => o.type === "PICKUP").length;

  // Top 3 products
  const productMap = new Map<string, number>();
  for (const o of orders) {
    for (const item of o.items) {
      const name = item.product.name;
      productMap.set(name, (productMap.get(name) || 0) + item.qty);
    }
  }
  const topProducts = Array.from(productMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const summary = {
    totalOrders: orders.length,
    totalRevenue,
    avgTicket,
    deliveryCount,
    pickupCount,
    topProducts: topProducts.map(([name, units]) => ({ name, units })),
  };

  // Save to DailyReport table (upsert)
  await app.prisma.dailyReport.upsert({
    where: { date: dayStart },
    create: { date: dayStart, data: summary },
    update: { data: summary },
  });

  // Build WhatsApp message
  const top = topProducts
    .map(([name, units], i) => `${i + 1}. ${name} (${units} uds)`)
    .join("\n");

  const dateStr = new Date().toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const message = [
    `*Resumen del día — Pollón SJR*`,
    `${dateStr}`,
    ``,
    `*Pedidos:* ${orders.length}`,
    `*Ventas:* $${(totalRevenue / 100).toLocaleString("es-MX")}`,
    `*Ticket prom:* $${(avgTicket / 100).toFixed(0)}`,
    `*Domicilio:* ${deliveryCount}`,
    `*Recoger:* ${pickupCount}`,
    ``,
    `*Top 3 productos:*`,
    top,
  ].join("\n");

  const storePhone = process.env.STORE_PHONE;
  if (storePhone) {
    const waLink = `https://wa.me/52${storePhone}?text=${encodeURIComponent(message)}`;
    app.log.info(`Daily report WA link: ${waLink}`);
  }

  app.log.info(`Daily report saved for ${today}: ${orders.length} orders, $${(totalRevenue / 100).toFixed(2)} MXN`);
}
