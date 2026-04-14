import { FastifyInstance } from "fastify";

export class CustomersService {
  constructor(private app: FastifyInstance) {}

  async getProfile(customerId: string) {
    return this.app.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, phone: true, name: true, address: true, createdAt: true },
    });
  }

  async updateProfile(customerId: string, data: { name?: string; address?: string }) {
    return this.app.prisma.customer.update({
      where: { id: customerId },
      data,
      select: { id: true, phone: true, name: true, address: true },
    });
  }

  async getOrders(customerId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [orders, total] = await this.app.prisma.$transaction([
      this.app.prisma.order.findMany({
        where: { customerId },
        include: { _count: { select: { items: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.app.prisma.order.count({ where: { customerId } }),
    ]);

    return {
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        type: o.type,
        total: o.total,
        itemCount: o._count.items,
        createdAt: o.createdAt.toISOString(),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}
