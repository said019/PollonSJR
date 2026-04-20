import { FastifyInstance } from "fastify";
import type { DashboardStats } from "@pollon/types";
import {
  updateStoreConfig as updateConfig,
  updateStoreHours as updateHrs,
} from "./store-config.service";

export class AdminService {
  constructor(private app: FastifyInstance) {}

  async getDashboard(): Promise<DashboardStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
  }>) {
    return updateConfig(this.app, data);
  }

  async updateHours(data: { openTime: string; closeTime: string; openDays: number[] }) {
    return updateHrs(this.app, data);
  }

  async getCustomers(page: number = 1, limit: number = 20, search?: string) {
    const skip = (page - 1) * limit;

    const where = search?.trim()
      ? {
          OR: [
            { name: { contains: search.trim(), mode: "insensitive" as const } },
            { phone: { contains: search.trim() } },
          ],
        }
      : {};

    const [customers, total] = await this.app.prisma.$transaction([
      this.app.prisma.customer.findMany({
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
          orders: {
            select: {
              total: true,
              status: true,
              rating: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.app.prisma.customer.count({ where }),
    ]);

    const mapped = customers.map((c) => {
      const delivered = c.orders.filter((o) => o.status === "DELIVERED");
      const totalSpent = delivered.reduce((sum, o) => sum + o.total, 0);
      const rated = delivered.filter((o) => o.rating !== null);
      const avgRating =
        rated.length > 0
          ? Math.round((rated.reduce((sum, o) => sum + (o.rating ?? 0), 0) / rated.length) * 10) / 10
          : null;

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        createdAt: c.createdAt.toISOString(),
        totalOrders: c.orders.length,
        deliveredOrders: delivered.length,
        totalSpent,
        avgRating,
        ratingCount: rated.length,
        loyaltyProgress: c.loyalty?.completedOrders ?? 0,
        pendingReward: c.loyalty?.pendingReward ?? false,
        freeProductsEarned: c.loyalty?.freeProductsEarned ?? 0,
        lastOrderAt: c.orders[0]?.createdAt.toISOString() ?? null,
      };
    });

    return { customers: mapped, total, page, pages: Math.ceil(total / limit) };
  }

  async getDailyReport() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
