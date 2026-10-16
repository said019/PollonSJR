import { FastifyInstance } from "fastify";
import { ReportsService } from "./reports.service";
import { adminOnly } from "../../middlewares/admin-only";
import { businessReportsCsv, getBusinessReports, reportFiltersSchema, type ReportFilters } from "./business-reports";

export async function reportsRoutes(app: FastifyInstance) {
  const service = new ReportsService(app);
  // One consistent snapshot for all metrics, even while new orders arrive.
  const loadReport = (filters: ReportFilters) => app.prisma.$transaction(
    (tx) => getBusinessReports({ prisma: tx }, filters),
    { isolationLevel: "RepeatableRead", timeout: 20000 }
  );

  app.addHook("preHandler", adminOnly);

  // Dashboard stats (real-time header)
  app.get("/dashboard", async () => service.getDashboardStats());

  // All sections and exports use the same validated dates and filters.
  app.get("/reports", async (request, reply) => {
    const filters = reportFiltersSchema.safeParse(request.query);
    if (!filters.success) {
      return reply.status(400).send({ error: filters.error.issues[0].message });
    }
    reply.header("Cache-Control", "no-store");
    return loadReport(filters.data);
  });

  app.get("/reports/csv", async (request, reply) => {
    const filters = reportFiltersSchema.safeParse(request.query);
    if (!filters.success) {
      return reply.status(400).send({ error: filters.error.issues[0].message });
    }
    const data = await loadReport(filters.data);
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="pollon-${data.period.dateFrom}-${data.period.dateTo}.csv"`)
      .header("Cache-Control", "no-store")
      .send(businessReportsCsv(data));
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
