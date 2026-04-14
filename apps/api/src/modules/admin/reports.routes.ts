import { FastifyInstance } from "fastify";
import { ReportsService } from "./reports.service";
import { adminOnly } from "../../middlewares/admin-only";

export async function reportsRoutes(app: FastifyInstance) {
  const service = new ReportsService(app);

  app.addHook("preHandler", adminOnly);

  // Dashboard stats (real-time header)
  app.get("/dashboard", async () => service.getDashboardStats());

  // Reports view (N days with summary + comparison)
  app.get("/reports", async (request) => {
    const { days } = request.query as { days?: string };
    return service.getReportsView(Number(days) || 7);
  });

  // Daily report for a specific date
  app.get("/reports/daily", async (request) => {
    const { date } = request.query as { date?: string };
    return service.getDailyReport(date);
  });

  // Weekly report
  app.get("/reports/weekly", async () => service.getWeeklyReport());

  // CSV export
  app.get("/reports/daily/csv", async (request, reply) => {
    const { date } = request.query as { date?: string };
    const result = await service.getDailyCsv(date);

    if (!result) {
      return reply.status(404).send({ error: "Sin pedidos para esa fecha" });
    }

    reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${result.filename}"`)
      .send(result.csv);
  });
}
