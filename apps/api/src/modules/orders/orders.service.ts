import { FastifyInstance } from "fastify";
import type { OrderSummary, OrderDetail, CreateOrderPayload, OrderStatusType } from "@pollon/types";
import { formatCents } from "@pollon/utils";
import { emitOrderStatus, emitOrderNew } from "./orders.events";
import { isAcceptingOrders, getStoreConfig } from "../admin/store-config.service";
import { validateCoupon } from "./coupon.service";
import { enqueueNotification } from "../notifications/queue";

export class OrdersService {
  constructor(private app: FastifyInstance) {}

  async create(
    customerId: string,
    data: CreateOrderPayload & {
      paymentMethod?: "CARD" | "CASH" | "TRANSFER";
      cashAmount?: number;
      couponCode?: string;
      isScheduled?: boolean;
      scheduledFor?: string;
      items: Array<CreateOrderPayload["items"][number] & {
        modifiers?: Array<{ name: string; option: string; price: number; qty?: number }>;
      }>;
    }
  ): Promise<{
    orderId: string;
    orderNumber: number;
    paymentMethod: string;
    checkoutUrl?: string;
    transferInfo?: object;
    change?: string | null;
    message?: string;
    scheduledFor?: string;
    depositAmount?: number;
    rewardApplied?: boolean;
    rewardMessage?: string | null;
  }> {
    const paymentMethod = data.paymentMethod || "CARD";
    const isScheduled = data.isScheduled === true;

    // 0. Validate customer is not blocked
    const customer = await this.app.prisma.customer.findUnique({
      where: { id: customerId },
      select: { blocked: true, blockedReason: true },
    });
    if (!customer) {
      throw new Error("Cliente no encontrado");
    }
    if (customer.blocked) {
      throw new Error(
        customer.blockedReason
          ? `No es posible procesar tu pedido. Motivo: ${customer.blockedReason}`
          : "No es posible procesar tu pedido. Contacta a la tienda."
      );
    }

    // Scheduled orders: validate date is next day
    if (isScheduled) {
      if (!data.scheduledFor) {
        throw new Error("Los pedidos programados requieren scheduledFor");
      }
      const scheduled = new Date(data.scheduledFor);
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const dayAfter = new Date(tomorrow);
      dayAfter.setDate(dayAfter.getDate() + 1);

      if (scheduled < tomorrow || scheduled >= dayAfter) {
        throw new Error("Solo se aceptan pedidos para el día siguiente (mínimo 1 día de anticipación).");
      }
    } else {
      // 1. Validate store is open (only for non-scheduled)
      const { accepting, reason } = await isAcceptingOrders(this.app);
      if (!accepting) {
        throw new Error(reason || "La tienda no acepta pedidos en este momento");
      }
    }

    if (data.type === "DELIVERY") {
      const config = await getStoreConfig(this.app);
      if (!config.deliveryActive) {
        throw new Error("El domicilio no está disponible en este momento.");
      }
    }

    // 2. Fetch and validate products
    const productIds = data.items.map((i) => i.productId);
    const products = await this.app.prisma.product.findMany({
      where: { id: { in: productIds }, active: true },
    });

    if (products.length !== productIds.length) {
      throw new Error("Uno o más productos no están disponibles");
    }

    const soldOut = products.filter((p) => p.soldOut);
    if (soldOut.length > 0) {
      throw new Error(`Productos agotados: ${soldOut.map((p) => p.name).join(", ")}`);
    }

    // 3. Calculate items + subtotal (including modifiers)
    let subtotal = 0;
    const orderItems = data.items.map((item: any) => {
      const product = products.find((p) => p.id === item.productId)!;
      let price = product.price;

      if (item.variant && product.variants) {
        const variants = product.variants as Array<{ label: string; price: number }>;
        const v = variants.find((v) => v.label === item.variant);
        if (v) price = v.price;
      }

      const itemModifiers: Array<{ name: string; option: string; price: number; qty?: number }> =
        item.modifiers || [];
      const modifiersTotal = itemModifiers.reduce(
        (sum: number, m) => sum + (m.price || 0) * (m.qty ?? 1),
        0
      );
      subtotal += (price + modifiersTotal) * item.qty;

      return {
        productId: item.productId as string,
        qty: item.qty as number,
        unitPrice: price,
        variant: (item.variant as string) || null,
        notes: (item.notes as string) || null,
        modifiers: itemModifiers,
      };
    });

    // 4. Delivery fee + zone time-window validation
    let deliveryFee = 0;
    if (data.type === "DELIVERY") {
      if (data.deliveryZoneId) {
        const zone = await this.app.prisma.deliveryZone.findUnique({
          where: { id: data.deliveryZoneId },
        });
        if (zone && !isScheduled) {
          assertZoneOpen(zone);
        }
        deliveryFee = data.deliveryFee ?? zone?.fee ?? 0;
      } else if (data.deliveryFee) {
        deliveryFee = data.deliveryFee;
      }
    }

    // 5. Apply coupon if provided
    let discountAmount = 0;
    let couponId: string | null = null;
    if (data.couponCode) {
      const coupon = await validateCoupon(
        this.app,
        data.couponCode,
        customerId,
        subtotal
      );
      discountAmount = coupon.discountAmount;
      couponId = coupon.id;
    }

    // 5b. Apply pending loyalty reward (free product)
    const { LoyaltyService: LS } = await import("../loyalty/loyalty.service");
    const loyaltyService = new LS(this.app);
    const reward = await loyaltyService.applyPendingReward(customerId, subtotal - discountAmount);
    if (reward.rewardApplied) {
      discountAmount += reward.discountAmount;
    }

    const rewardMessage = reward.rewardApplied
      ? `Se aplicó tu ${reward.productName ?? "producto"} gratis (-${formatCents(reward.discountAmount)})`
      : null;

    const tipAmount = Math.max(0, (data as any).tipAmount ?? 0);

    // 4% "Uso de aplicación" surcharge only on CARD payments.
    // Base = subtotal - discount + delivery + tip (everything customer
    // actually pays). Rounded to nearest cent.
    const APP_FEE_RATE = 0.04;
    const preFeeTotal = Math.max(0, subtotal - discountAmount + deliveryFee + tipAmount);
    const appFeeAmount =
      paymentMethod === "CARD" ? Math.round(preFeeTotal * APP_FEE_RATE) : 0;

    const total = Math.max(0, preFeeTotal + appFeeAmount);

    // Scheduled orders: 50% deposit, status SCHEDULED
    let initialStatus: "PENDING_PAYMENT" | "RECEIVED" | "SCHEDULED";
    let depositAmount: number | null = null;
    let remainingAmount: number | null = null;

    if (isScheduled) {
      initialStatus = "SCHEDULED";
      depositAmount = Math.round(total * 0.5);
      remainingAmount = total - depositAmount;
    } else if (paymentMethod === "CASH") {
      initialStatus = "RECEIVED";
    } else {
      // CARD waits for MP webhook; TRANSFER waits for receipt upload + admin confirmation
      initialStatus = "PENDING_PAYMENT";
    }

    const order = await this.app.prisma.order.create({
      data: {
        customerId,
        status: initialStatus,
        type: data.type,
        paymentMethod,
        cashAmount: paymentMethod === "CASH" ? (data.cashAmount ?? null) : null,
        address: data.address || null,
        deliveryLat: data.type === "DELIVERY" ? (data as any).deliveryLat ?? null : null,
        deliveryLng: data.type === "DELIVERY" ? (data as any).deliveryLng ?? null : null,
        deliveryZoneId: data.deliveryZoneId || null,
        deliveryAddress: data.type === "DELIVERY" ? (data as any).deliveryAddress ?? null : null,
        subtotal,
        deliveryFee,
        discountAmount,
        tipAmount,
        appFeeAmount,
        total,
        notes: data.notes || null,
        couponId,
        isScheduled,
        scheduledFor: isScheduled && data.scheduledFor ? new Date(data.scheduledFor) : null,
        depositAmount,
        remainingAmount,
        items: {
          create: orderItems.map((item: any) => ({
            productId: item.productId as string,
            qty: item.qty as number,
            unitPrice: item.unitPrice as number,
            variant: item.variant as string | null,
            notes: item.notes as string | null,
            modifiers:
              item.modifiers && item.modifiers.length > 0
                ? {
                    create: (item.modifiers as Array<{ name: string; option: string; price: number; qty?: number }>).map(
                      (m) => ({
                        name: m.name,
                        option: m.option,
                        price: m.price,
                        qty: m.qty ?? 1,
                      })
                    ),
                  }
                : undefined,
          })),
        },
      },
      include: { customer: true, _count: { select: { items: true } } },
    });

    // 7. Atomically increment coupon usage (check limit inside transaction)
    if (couponId) {
      await this.app.prisma.$transaction(async (tx) => {
        const coupon = await tx.coupon.findUnique({ where: { id: couponId } });
        if (coupon && (coupon.maxUses === null || coupon.usedCount < coupon.maxUses)) {
          await tx.coupon.update({
            where: { id: couponId },
            data: { usedCount: { increment: 1 } },
          });
        }
      });
    }

    // 7b. Increment promotion usage if a promotionId was passed in.
    // Atomically check maxUses inside the transaction.
    if ((data as any).promotionId) {
      const promoId = (data as any).promotionId as string;
      await this.app.prisma.$transaction(async (tx) => {
        const promo = await tx.promotion.findUnique({ where: { id: promoId } });
        if (
          promo &&
          promo.active &&
          (promo.maxUses === null || promo.usedCount < promo.maxUses)
        ) {
          await tx.promotion.update({
            where: { id: promoId },
            data: { usedCount: { increment: 1 } },
          });
        }
      });
    }

    // 8. CASH → received immediately. TRANSFER → waits for receipt + admin confirm,
    //    but admin still gets a "new order" alert so it appears in "Por confirmar".
    if (!isScheduled && (paymentMethod === "CASH" || paymentMethod === "TRANSFER")) {
      emitOrderNew(this.app, {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        type: order.type,
        total: order.total,
        customerName: order.customer.name,
        customerPhone: order.customer.phone,
        itemCount: order._count.items,
        createdAt: order.createdAt.toISOString(),
        paymentMethod,
      });

      if (paymentMethod === "CASH") {
        emitOrderStatus(this.app, order.customerId, order.id, "RECEIVED", {
          orderNumber: order.orderNumber,
          estimatedMinutes: 30,
        });
      }
    }

    // 9. Return appropriate response per payment method
    if (paymentMethod === "TRANSFER") {
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentMethod: "TRANSFER",
        transferInfo: await buildTransferInfo(this.app, order.orderNumber, total),
        message: "Realiza la transferencia y sube el comprobante. Tu pedido empezará a prepararse en cuanto confirmemos el pago.",
        rewardApplied: reward.rewardApplied,
        rewardMessage,
      };
    }

    if (paymentMethod === "CASH") {
      const change = data.cashAmount ? data.cashAmount / 100 - total / 100 : null;
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentMethod: "CASH",
        change: change && change > 0 ? `$${change.toFixed(0)} de cambio` : null,
        message:
          data.type === "DELIVERY"
            ? "Tu pedido está confirmado. Ten el efectivo listo cuando llegue el repartidor."
            : "Tu pedido está confirmado. Paga en el local al recoger.",
        rewardApplied: reward.rewardApplied,
        rewardMessage,
      };
    }

    // CARD — caller will create payment preference separately
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentMethod: "CARD",
      rewardApplied: reward.rewardApplied,
      rewardMessage,
    };
  }

  async getById(orderId: string): Promise<OrderDetail | null> {
    const order = await this.app.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: true, modifiers: true } },
        payment: true,
        customer: true,
      },
    });

    if (!order) return null;

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status as OrderStatusType,
      type: order.type as any,
      paymentMethod: order.paymentMethod as any,
      cashAmount: order.cashAmount,
      transferInfo:
        order.paymentMethod === "TRANSFER"
          ? await buildTransferInfo(this.app, order.orderNumber, order.total)
          : null,
      transferProofUrl: order.transferProofUrl ?? null,
      transferProofUploadedAt: order.transferProofUploadedAt?.toISOString() ?? null,
      total: order.total,
      subtotal: order.subtotal,
      deliveryFee: order.deliveryFee,
      discountAmount: order.discountAmount,
      tipAmount: order.tipAmount,
      appFeeAmount: order.appFeeAmount,
      estimatedMinutes: order.estimatedMinutes ?? null,
      address: order.address,
      notes: order.notes,
      cancelReason: order.cancelReason,
      rating: order.rating,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      itemCount: order.items.length,
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.product.name,
        qty: item.qty,
        unitPrice: item.unitPrice,
        variant: item.variant,
        notes: item.notes,
        modifiers: ((item as any).modifiers ?? []).map((m: any) => ({
          name: m.name,
          option: m.option,
          price: m.price,
          qty: m.qty ?? 1,
        })),
      })),
      payment: order.payment
        ? {
            id: order.payment.id,
            status: order.payment.status as any,
            amount: order.payment.amount,
            paidAt: order.payment.paidAt?.toISOString() || null,
          }
        : null,
    };
  }

  async updateStatus(orderId: string, newStatus: OrderStatusType, cancelReason?: string) {
    const order = await this.app.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });

    if (!order) throw new Error("Pedido no encontrado");

    // Optimistic locking: only update if status hasn't changed since we read it
    const updated = await this.app.prisma.order.updateMany({
      where: { id: orderId, status: order.status },
      data: {
        status: newStatus,
        ...(newStatus === "CANCELLED" && cancelReason ? { cancelReason } : {}),
      },
    });

    if (updated.count === 0) {
      throw new Error("El pedido fue modificado por otro usuario. Recarga e intenta de nuevo.");
    }

    await this.app.prisma.orderStatusLog.create({
      data: {
        orderId,
        from: order.status,
        to: newStatus,
        ...(newStatus === "CANCELLED" && cancelReason ? { note: cancelReason } : {}),
      },
    });

    emitOrderStatus(this.app, order.customerId, orderId, newStatus, {
      orderNumber: order.orderNumber,
      ...(newStatus === "CANCELLED" && cancelReason ? { cancelReason } : {}),
    });

    // Enqueue WhatsApp notification per status
    const name = order.customer.name ?? "Cliente";
    const phone = order.customer.phone;
    const orderNum = String(order.orderNumber);
    const minutes = String(order.estimatedMinutes ?? 20);

    const templateMap: Record<string, string> = {
      PREPARING: "order_preparing",
      READY: order.type === "PICKUP" ? "order_ready_pickup" : "order_ready_delivery",
      ON_THE_WAY: "order_on_the_way",
      DELIVERED: "order_delivered",
    };

    const template = templateMap[newStatus];
    if (template) {
      enqueueNotification(this.app.redis, {
        type: "whatsapp",
        to: phone,
        template,
        params: { name, orderNumber: orderNum, minutes, points: "1" },
      }).catch((err) => this.app.log.error("Enqueue notification error:", err));
    }

    // Process loyalty after delivery
    if (newStatus === "DELIVERED") {
      const { LoyaltyService } = await import("../loyalty/loyalty.service");
      const loyaltyService = new LoyaltyService(this.app);
      loyaltyService.processAfterDelivery(orderId).catch((err) =>
        this.app.log.error("Loyalty processing error:", err)
      );
    }

    return { success: true };
  }

  /** Customer-facing: returns the caller's own orders that are still in progress */
  async getMyActiveOrders(customerId: string) {
    const orders = await this.app.prisma.order.findMany({
      where: {
        customerId,
        status: {
          in: ["PENDING_PAYMENT", "RECEIVED", "PREPARING", "READY", "ON_THE_WAY"],
        },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        type: true,
        total: true,
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status as OrderStatusType,
      type: o.type as "PICKUP" | "DELIVERY",
      total: o.total,
    }));
  }

  async getActiveOrders(): Promise<OrderSummary[]> {
    const orders = await this.app.prisma.order.findMany({
      where: {
        OR: [
          { status: { in: ["RECEIVED", "PREPARING", "READY", "ON_THE_WAY", "SCHEDULED"] } },
          // TRANSFER orders awaiting receipt verification
          { status: "PENDING_PAYMENT", paymentMethod: "TRANSFER" },
        ],
      },
      include: { customer: true, _count: { select: { items: true } } },
      orderBy: { createdAt: "asc" },
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status as OrderStatusType,
      type: o.type as any,
      paymentMethod: o.paymentMethod as any,
      total: o.total,
      customerName: o.customer.name,
      customerPhone: o.customer.phone,
      itemCount: o._count.items,
      createdAt: o.createdAt.toISOString(),
      transferProofUrl: o.transferProofUrl ?? null,
      estimatedMinutes: o.estimatedMinutes ?? null,
      isScheduled: o.isScheduled,
      scheduledFor: o.scheduledFor ? o.scheduledFor.toISOString() : null,
      depositAmount: o.depositAmount ?? null,
      remainingAmount: o.remainingAmount ?? null,
    }));
  }

  async getHistory(
    page: number = 1,
    limit: number = 20,
    dateFrom?: Date,
    dateTo?: Date,
    filters?: {
      search?: string;
      status?: "DELIVERED" | "CANCELLED";
      type?: "DELIVERY" | "PICKUP";
    }
  ) {
    const skip = (page - 1) * limit;

    const statusFilter = filters?.status
      ? { status: filters.status }
      : { status: { in: ["DELIVERED", "CANCELLED"] as const } };

    const search = filters?.search?.trim();
    const searchFilter: Record<string, unknown> = {};
    if (search) {
      const numeric = parseInt(search.replace(/^#/, ""), 10);
      const orFilters: any[] = [
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { customer: { phone: { contains: search } } },
      ];
      if (!isNaN(numeric)) orFilters.push({ orderNumber: numeric });
      searchFilter.OR = orFilters;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {
      ...statusFilter,
      ...(filters?.type ? { type: filters.type } : {}),
      ...(dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo   ? { lte: dateTo }   : {}),
            },
          }
        : {}),
      ...searchFilter,
    };

    const [orders, total] = await this.app.prisma.$transaction([
      this.app.prisma.order.findMany({
        where,
        include: { customer: true, _count: { select: { items: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.app.prisma.order.count({ where }),
    ]);

    return {
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        type: o.type,
        total: o.total,
        customerName: o.customer.name,
        customerPhone: o.customer.phone,
        itemCount: o._count.items,
        createdAt: o.createdAt.toISOString(),
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Repeat order — returns cart-ready items with availability check.
   */
  async getRepeatItems(orderId: string, customerId: string) {
    const order = await this.app.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: { items: { include: { product: true } } },
    });

    if (!order) throw new Error("Pedido no encontrado");

    const cartItems = order.items.map((item) => {
      const product = item.product;
      return {
        productId: item.productId,
        name: product.name,
        currentPrice: product.price,
        originalPrice: item.unitPrice,
        priceChanged: product.price !== item.unitPrice,
        qty: item.qty,
        variant: item.variant,
        notes: item.notes,
        available: product.active && !product.soldOut,
      };
    });

    const unavailable = cartItems.filter((i) => !i.available);

    return {
      items: cartItems,
      unavailableCount: unavailable.length,
      warning:
        unavailable.length > 0
          ? `${unavailable.length} producto(s) no están disponibles actualmente.`
          : null,
    };
  }
}

/**
 * Build the TransferInfo object shown to customers paying by bank transfer.
 * Reads from the StoreConfig row in DB; env vars are kept as a backstop
 * so legacy deploys without configured rows keep working.
 */

/**
 * Throws if the zone has a time window and the current time is outside of it.
 * Times are HH:MM in México local time.
 */
function assertZoneOpen(zone: { name: string; startTime: string | null; endTime: string | null }) {
  if (!zone.startTime && !zone.endTime) return;
  // Current local time as HH:MM in MX timezone
  const now = new Date().toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Mexico_City",
  });
  const start = zone.startTime ?? "00:00";
  const end = zone.endTime ?? "23:59";
  // Same-day window
  if (start <= end) {
    if (now < start || now > end) {
      throw new Error(
        `La zona "${zone.name}" solo entrega entre ${start} y ${end}. Hora actual: ${now}.`
      );
    }
    return;
  }
  // Overnight window (e.g. 18:00 - 02:00)
  if (now < start && now > end) {
    throw new Error(
      `La zona "${zone.name}" solo entrega entre ${start} y ${end}. Hora actual: ${now}.`
    );
  }
}

async function buildTransferInfo(
  app: FastifyInstance,
  orderNumber: number,
  totalCents: number
) {
  const config = await getStoreConfig(app);
  return {
    clabe: config.transferClabe || process.env.STORE_CLABE || "",
    bank: config.transferBank || process.env.STORE_BANK || "BBVA",
    accountHolder:
      config.transferAccountHolder ||
      process.env.STORE_ACCOUNT_HOLDER ||
      "Pollón SJR",
    amount: totalCents / 100,
    concept: `Pedido #${orderNumber}`,
  };
}
