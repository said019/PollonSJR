import { FastifyInstance } from "fastify";
import { hash, compare } from "bcrypt";
import { signDriverToken } from "../auth/jwt.service";
import { emitOrderStatus } from "../orders/orders.events";

const ACTIVE_STATUSES = [
  "RECEIVED",
  "PREPARING",
  "READY",
  "ON_THE_WAY",
] as const;

export class DriversService {
  constructor(private app: FastifyInstance) {}

  // ── Admin CRUD ──────────────────────────────────────────────

  async list() {
    const drivers = await this.app.prisma.driver.findMany({
      orderBy: [{ active: "desc" }, { onShift: "desc" }, { name: "asc" }],
      include: {
        _count: {
          select: {
            orders: {
              where: { status: { in: ACTIVE_STATUSES as any } },
            },
          },
        },
      },
    });

    return drivers.map((d) => ({
      id: d.id,
      email: d.email,
      name: d.name,
      phone: d.phone,
      photoUrl: d.photoUrl,
      vehicle: d.vehicle,
      active: d.active,
      onShift: d.onShift,
      lat: d.lat,
      lng: d.lng,
      locationUpdatedAt: d.locationUpdatedAt?.toISOString() || null,
      shiftStartedAt: d.shiftStartedAt?.toISOString() || null,
      createdAt: d.createdAt.toISOString(),
      activeOrderCount: d._count.orders,
    }));
  }

  async create(data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
    vehicle?: string;
    photoUrl?: string;
  }) {
    const existing = await this.app.prisma.driver.findUnique({
      where: { email: data.email.toLowerCase().trim() },
    });
    if (existing) throw new Error("Ya existe un repartidor con este email");

    const driver = await this.app.prisma.driver.create({
      data: {
        email: data.email.toLowerCase().trim(),
        password: await hash(data.password, 12),
        name: data.name.trim(),
        phone: data.phone?.trim() || null,
        vehicle: data.vehicle?.trim() || null,
        photoUrl: data.photoUrl || null,
      },
    });

    return { id: driver.id, email: driver.email, name: driver.name };
  }

  async update(
    id: string,
    data: {
      email?: string;
      password?: string;
      name?: string;
      phone?: string | null;
      vehicle?: string | null;
      photoUrl?: string | null;
      active?: boolean;
    }
  ) {
    const updateData: any = {};
    if (data.email) updateData.email = data.email.toLowerCase().trim();
    if (data.password) updateData.password = await hash(data.password, 12);
    if (data.name !== undefined) updateData.name = data.name.trim();
    if (data.phone !== undefined) updateData.phone = data.phone?.trim() || null;
    if (data.vehicle !== undefined) updateData.vehicle = data.vehicle?.trim() || null;
    if (data.photoUrl !== undefined) updateData.photoUrl = data.photoUrl;
    if (data.active !== undefined) updateData.active = data.active;

    // Si lo desactivan, también lo sacamos del turno.
    if (data.active === false) {
      updateData.onShift = false;
      updateData.shiftStartedAt = null;
    }

    await this.app.prisma.driver.update({ where: { id }, data: updateData });
  }

  async remove(id: string) {
    // Soft-disable cuando ya tiene pedidos asignados (no podemos romper la FK).
    const hasOrders = await this.app.prisma.order.findFirst({
      where: { driverId: id },
      select: { id: true },
    });
    if (hasOrders) {
      await this.app.prisma.driver.update({
        where: { id },
        data: { active: false, onShift: false },
      });
      return { soft: true };
    }
    await this.app.prisma.driverLocationPing.deleteMany({ where: { driverId: id } });
    await this.app.prisma.driver.delete({ where: { id } });
    return { soft: false };
  }

  // ── Asignar repartidor a un pedido ──────────────────────────

  async assignToOrder(orderId: string, driverId: string) {
    const driver = await this.app.prisma.driver.findUnique({
      where: { id: driverId },
    });
    if (!driver) throw new Error("Repartidor no encontrado");
    if (!driver.active) throw new Error("Repartidor inactivo");

    const order = await this.app.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });
    if (!order) throw new Error("Pedido no encontrado");
    if (order.type !== "DELIVERY")
      throw new Error("Sólo se asigna repartidor a pedidos a domicilio");

    await this.app.prisma.order.update({
      where: { id: orderId },
      data: { driverId, assignedAt: new Date() },
    });

    // Notifica admin + cliente + repartidor.
    this.app.io
      .to("admin:pollon-sjr")
      .to(`customer:${order.customerId}`)
      .to(`driver:${driverId}`)
      .emit("order:assigned", {
        orderId,
        orderNumber: order.orderNumber,
        driverId,
        driverName: driver.name,
        driverPhone: driver.phone,
      });

    return { ok: true };
  }

  async unassignFromOrder(orderId: string) {
    await this.app.prisma.order.update({
      where: { id: orderId },
      data: { driverId: null, assignedAt: null },
    });
  }

  // ── Driver auth ─────────────────────────────────────────────

  async login(email: string, password: string) {
    const driver = await this.app.prisma.driver.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!driver) throw new Error("Credenciales inválidas");
    if (!driver.active) throw new Error("Tu cuenta está desactivada. Habla con el admin.");

    const ok = await compare(password, driver.password);
    if (!ok) throw new Error("Credenciales inválidas");

    const token = signDriverToken(driver.id, driver.email);

    return {
      token,
      driver: {
        id: driver.id,
        email: driver.email,
        name: driver.name,
        phone: driver.phone,
        photoUrl: driver.photoUrl,
      },
    };
  }

  async me(driverId: string) {
    const driver = await this.app.prisma.driver.findUnique({
      where: { id: driverId },
    });
    if (!driver) throw new Error("Repartidor no encontrado");

    return {
      id: driver.id,
      email: driver.email,
      name: driver.name,
      phone: driver.phone,
      photoUrl: driver.photoUrl,
      vehicle: driver.vehicle,
      active: driver.active,
      onShift: driver.onShift,
      lat: driver.lat,
      lng: driver.lng,
      locationUpdatedAt: driver.locationUpdatedAt?.toISOString() || null,
      shiftStartedAt: driver.shiftStartedAt?.toISOString() || null,
      createdAt: driver.createdAt.toISOString(),
    };
  }

  async setShift(driverId: string, onShift: boolean) {
    await this.app.prisma.driver.update({
      where: { id: driverId },
      data: {
        onShift,
        shiftStartedAt: onShift ? new Date() : null,
        // Si cierra turno, blanqueamos GPS para que admin no muestre fantasmas.
        ...(onShift ? {} : { lat: null, lng: null, locationUpdatedAt: null }),
      },
    });
    if (!onShift) {
      this.app.io.to("admin:pollon-sjr").emit("driver:offline", { driverId });
    }
  }

  // ── Pedidos del repartidor ──────────────────────────────────

  async listMyOrders(driverId: string) {
    const orders = await this.app.prisma.order.findMany({
      where: {
        driverId,
        status: { in: ACTIVE_STATUSES as any },
      },
      include: {
        customer: { select: { name: true, phone: true } },
        _count: { select: { items: true } },
      },
      orderBy: [{ status: "asc" }, { assignedAt: "asc" }],
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      total: o.total,
      paymentMethod: o.paymentMethod,
      cashAmount: o.cashAmount,
      deliveryAddress: o.deliveryAddress || o.address,
      deliveryLat: o.deliveryLat,
      deliveryLng: o.deliveryLng,
      customerName: o.customer.name,
      customerPhone: o.customer.phone,
      itemCount: o._count.items,
      notes: o.notes,
      assignedAt: o.assignedAt?.toISOString() || null,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  async getMyOrder(driverId: string, orderId: string) {
    const order = await this.app.prisma.order.findFirst({
      where: { id: orderId, driverId },
      include: {
        customer: { select: { name: true, phone: true } },
        items: { include: { product: true, modifiers: true } },
      },
    });
    if (!order) throw new Error("Pedido no asignado a ti");

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      total: order.total,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      tipAmount: order.tipAmount,
      paymentMethod: order.paymentMethod,
      cashAmount: order.cashAmount,
      deliveryAddress: order.deliveryAddress || order.address,
      deliveryLat: order.deliveryLat,
      deliveryLng: order.deliveryLng,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      notes: order.notes,
      assignedAt: order.assignedAt?.toISOString() || null,
      createdAt: order.createdAt.toISOString(),
      itemCount: order.items.length,
      items: order.items.map((i) => ({
        id: i.id,
        productName: i.product.name,
        qty: i.qty,
        unitPrice: i.unitPrice,
        variant: i.variant,
        notes: i.notes,
        modifiers: i.modifiers.map((m) => ({
          name: m.name,
          option: m.option,
          price: m.price,
          qty: m.qty,
        })),
      })),
    };
  }

  /**
   * Driver actualiza el status: ON_THE_WAY o DELIVERED.
   * Sólo puede ir hacia adelante desde READY → ON_THE_WAY → DELIVERED.
   */
  async updateMyOrderStatus(
    driverId: string,
    orderId: string,
    nextStatus: "ON_THE_WAY" | "DELIVERED"
  ) {
    const order = await this.app.prisma.order.findFirst({
      where: { id: orderId, driverId },
    });
    if (!order) throw new Error("Pedido no asignado a ti");

    const valid: Record<string, string[]> = {
      ON_THE_WAY: ["READY", "PREPARING"],
      DELIVERED: ["ON_THE_WAY", "READY"],
    };
    if (!valid[nextStatus].includes(order.status)) {
      throw new Error(
        `No puedes pasar de ${order.status} a ${nextStatus}. Estado actual no es válido.`
      );
    }

    await this.app.prisma.$transaction([
      this.app.prisma.order.update({
        where: { id: orderId },
        data: { status: nextStatus },
      }),
      this.app.prisma.orderStatusLog.create({
        data: {
          orderId,
          from: order.status,
          to: nextStatus,
          note: `Actualizado por repartidor`,
        },
      }),
    ]);

    emitOrderStatus(this.app, order.customerId, orderId, nextStatus, {
      orderNumber: order.orderNumber,
    });

    return { ok: true, status: nextStatus };
  }

  // ── GPS ─────────────────────────────────────────────────────

  async pushLocation(
    driverId: string,
    data: {
      lat: number;
      lng: number;
      accuracy?: number;
      speed?: number;
      heading?: number;
      orderId?: string;
    }
  ) {
    // Validar que orderId, si viene, pertenezca al driver.
    if (data.orderId) {
      const owns = await this.app.prisma.order.findFirst({
        where: { id: data.orderId, driverId },
        select: { id: true },
      });
      if (!owns) delete data.orderId;
    }

    const driver = await this.app.prisma.driver.update({
      where: { id: driverId },
      data: {
        lat: data.lat,
        lng: data.lng,
        locationUpdatedAt: new Date(),
      },
      select: { id: true, name: true },
    });

    // Persistir el ping para historial (auditoría/replay).
    this.app.prisma.driverLocationPing
      .create({
        data: {
          driverId,
          orderId: data.orderId || null,
          lat: data.lat,
          lng: data.lng,
          accuracy: data.accuracy ?? null,
          speed: data.speed ?? null,
          heading: data.heading ?? null,
        },
      })
      .catch((err) =>
        this.app.log.warn({ err }, "No se pudo persistir ping GPS")
      );

    const payload = {
      driverId,
      driverName: driver.name,
      lat: data.lat,
      lng: data.lng,
      heading: data.heading ?? null,
      speed: data.speed ?? null,
      orderId: data.orderId || null,
      ts: new Date().toISOString(),
    };

    // Admin siempre recibe.
    this.app.io.to("admin:pollon-sjr").emit("driver:location", payload);

    // Cliente recibe sólo cuando el pedido está ON_THE_WAY (ya salió).
    if (data.orderId) {
      const o = await this.app.prisma.order.findUnique({
        where: { id: data.orderId },
        select: { customerId: true, status: true },
      });
      if (o && o.status === "ON_THE_WAY") {
        this.app.io.to(`customer:${o.customerId}`).emit("driver:location", payload);
      }
    }

    return { ok: true };
  }

  // ── Admin: live snapshot de drivers en turno ────────────────

  async getActiveDriversSnapshot() {
    const drivers = await this.app.prisma.driver.findMany({
      where: { active: true, onShift: true },
      select: {
        id: true,
        name: true,
        phone: true,
        photoUrl: true,
        vehicle: true,
        lat: true,
        lng: true,
        locationUpdatedAt: true,
      },
    });
    return drivers
      .filter((d) => d.lat !== null && d.lng !== null)
      .map((d) => ({
        ...d,
        locationUpdatedAt: d.locationUpdatedAt?.toISOString() || null,
      }));
  }
}
