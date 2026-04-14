import cron from "node-cron";
import { FastifyInstance } from "fastify";
import { runDailyReport } from "./daily-report.job";
import { runExpirePoints } from "./expire-points.job";
import { cancelZombieOrders } from "./cancel-zombie-orders.job";
import { reconcilePayments } from "./reconcile-payments.job";
import { activateScheduledOrders } from "./activate-scheduled.job";

export function startScheduler(app: FastifyInstance) {
  // */5 * * * * → Activate scheduled orders 30 min before scheduledFor
  cron.schedule("*/5 * * * *", () => {
    activateScheduledOrders(app).catch((err) =>
      app.log.error("Activate scheduled error:", err)
    );
  });

  // */15 * * * * → Cancel zombie orders (PENDING_PAYMENT > 90 min)
  cron.schedule("*/15 * * * *", () => {
    cancelZombieOrders(app).catch((err) => app.log.error("Zombie orders error:", err));
  });

  // 0 2 * * * → Reconcile payments
  cron.schedule("0 2 * * *", () => {
    reconcilePayments(app).catch((err) => app.log.error("Reconcile payments error:", err));
  });

  // 0 10 * * * → Notify loyalty rewards expiring in 7 days (job handler stub)
  cron.schedule("0 10 * * *", () => {
    runExpirePoints(app).catch((err) => app.log.error("Expire rewards error:", err));
  });

  // 30 23 * * * → Daily report to owner
  cron.schedule("30 23 * * *", () => {
    runDailyReport(app).catch((err) => app.log.error("Daily report error:", err));
  });

  app.log.info(
    "Scheduler started: scheduled (*/5min), zombie-orders (*/15min), " +
    "reconcile (02:00), expire-rewards (10:00), daily-report (23:30)"
  );
}
