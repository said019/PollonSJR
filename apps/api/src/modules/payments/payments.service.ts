import { FastifyInstance } from "fastify";
import { MercadoPagoConfig, Preference, Payment as MpPayment } from "mercadopago";
// getRejectMessage is used for frontend-facing reject codes (exported from utils)

export class PaymentsService {
  private mp: MercadoPagoConfig;

  constructor(private app: FastifyInstance) {
    this.mp = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN || "",
    });
  }

  /**
   * Crea una preferencia de pago en MercadoPago para un pedido existente.
   * El pedido debe estar en status PENDING_PAYMENT.
   */
  async createPreference(orderId: string) {
    const order = await this.app.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } }, customer: true },
    });

    if (!order) throw new Error("Pedido no encontrado");
    if (order.status !== "PENDING_PAYMENT") throw new Error("El pedido ya fue procesado");

    // Construir items para MP
    const mpItems: Array<{
      id: string;
      title: string;
      quantity: number;
      unit_price: number;
      currency_id: string;
    }> = order.items.map((item) => ({
      id: item.productId,
      title: item.variant
        ? `${item.product.name} (${item.variant})`
        : item.product.name,
      quantity: item.qty,
      unit_price: item.unitPrice / 100, // MP espera en pesos, no centavos
      currency_id: "MXN",
    }));

    // Si hay costo de envío, agregarlo como item separado
    if (order.deliveryFee > 0) {
      mpItems.push({
        id: "delivery-fee",
        title: "Costo de envío a domicilio",
        quantity: 1,
        unit_price: order.deliveryFee / 100,
        currency_id: "MXN",
      });
    }

    const apiUrl = process.env.API_URL || "http://localhost:3001";
    const webUrl = process.env.WEB_URL || "http://localhost:3000";

    const preference = new Preference(this.mp);
    const result = await preference.create({
      body: {
        items: mpItems,
        payer: {
          name: order.customer.name || "Cliente",
          phone: { number: order.customer.phone },
        },
        external_reference: orderId,
        statement_descriptor: "POLLON SJR",
        notification_url: `${apiUrl}/api/payments/webhook`,
        back_urls: {
          success: `${webUrl}/pedido/${orderId}?pago=exitoso`,
          failure: `${webUrl}/pedido/${orderId}?pago=error`,
          pending: `${webUrl}/pedido/${orderId}?pago=pendiente`,
        },
        auto_return: "approved",
        expires: true,
        expiration_date_to: new Date(
          Date.now() + 60 * 60 * 1000 // 1 hora
        ).toISOString(),
      },
    });

    // Guardar registro de pago
    await this.app.prisma.payment.create({
      data: {
        orderId,
        mpPrefId: result.id!,
        amount: order.total,
      },
    });

    const checkoutUrl =
      process.env.NODE_ENV === "production"
        ? result.init_point!
        : result.sandbox_init_point || result.init_point!;

    return {
      preferenceId: result.id!,
      checkoutUrl,
    };
  }

  /**
   * Procesa un webhook de MercadoPago.
   * Usa idempotencia con WebhookEvent para evitar doble procesamiento.
   */
  async processWebhook(body: any) {
    if (body.type !== "payment") return { ignore: true };

    const paymentId = body.data?.id?.toString();
    if (!paymentId) return { ignore: true };

    // Idempotencia: evitar procesar el mismo evento dos veces
    const eventKey = `payment:${paymentId}`;
    try {
      await this.app.prisma.webhookEvent.create({
        data: {
          mpEventId: eventKey,
          eventType: body.type,
          payload: body,
        },
      });
    } catch (e: any) {
      if (e.code === "P2002") return { ignore: true }; // Ya procesado (unique constraint)
      throw e;
    }

    // Procesar en background (no bloquear la respuesta 200)
    this.processPaymentAsync(paymentId, eventKey).catch((err) =>
      this.app.log.error("Error procesando webhook de pago:", err)
    );

    return { received: true };
  }

  /**
   * Procesamiento asíncrono del pago — consulta MP directamente y actualiza la orden.
   */
  private async processPaymentAsync(mpPaymentId: string, eventKey: string) {
    // 1. Consultar el pago directamente a MP (fuente de verdad)
    const mpPayment = new MpPayment(this.mp);
    const paymentData = await mpPayment.get({ id: mpPaymentId });

    const orderId = paymentData.external_reference;
    if (!orderId) return;

    // 2. Obtener la orden
    const order = await this.app.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });
    if (!order) return;

    // 3. Verificar que el monto coincide (seguridad anti-fraude)
    const paidAmount = Math.round((paymentData.transaction_amount || 0) * 100);
    if (Math.abs(paidAmount - order.total) > 1) {
      this.app.log.error(
        `ALERTA: Monto no coincide. Pedido ${orderId}: esperado ${order.total}, recibido ${paidAmount}`
      );
      return;
    }

    // 4. Calcular fee y net amount de MP
    const mpFee = Math.round(
      (paymentData.fee_details?.[0]?.amount ?? 0) * 100
    );
    const netAmount = Math.round(
      (paymentData.transaction_details?.net_received_amount ?? 0) * 100
    );

    // 5. Upsert del registro de pago
    await this.app.prisma.payment.upsert({
      where: { orderId },
      create: {
        orderId,
        mpPaymentId: String(paymentData.id),
        mpPrefId: (paymentData as any).preference_id || null,
        status: this.mapMpStatus(paymentData.status),
        statusDetail: paymentData.status_detail || null,
        amount: paidAmount,
        mpFee,
        netAmount,
        paymentMethod: paymentData.payment_method_id || null,
        installments: paymentData.installments || 1,
        providerPayload: paymentData as any,
        approvedAt: paymentData.status === "approved" ? new Date() : null,
      },
      update: {
        mpPaymentId: String(paymentData.id),
        status: this.mapMpStatus(paymentData.status),
        statusDetail: paymentData.status_detail || null,
        mpFee,
        netAmount,
        paymentMethod: paymentData.payment_method_id || null,
        installments: paymentData.installments || 1,
        providerPayload: paymentData as any,
        approvedAt: paymentData.status === "approved" ? new Date() : undefined,
      },
    });

    // 6. Procesar según status
    if (paymentData.status === "approved") {
      await this.onPaymentApproved(order, paymentData);
    }

    if (paymentData.status === "rejected") {
      await this.onPaymentRejected(order, paymentData);
    }

    // 7. Marcar webhook como procesado
    await this.app.prisma.webhookEvent.updateMany({
      where: { mpEventId: eventKey },
      data: { processed: true },
    });
  }

  /**
   * Pago aprobado → activar pedido, notificar admin y cliente.
   */
  private async onPaymentApproved(order: any, paymentData: any) {
    // Solo activar si aún está en PENDING_PAYMENT
    if (order.status !== "PENDING_PAYMENT") return;

    await this.app.prisma.$transaction([
      this.app.prisma.order.update({
        where: { id: order.id },
        data: { status: "RECEIVED" },
      }),
      this.app.prisma.orderStatusLog.create({
        data: {
          orderId: order.id,
          from: "PENDING_PAYMENT",
          to: "RECEIVED",
          note: `Pago aprobado por MercadoPago. ID: ${paymentData.id}`,
        },
      }),
    ]);

    // Emitir eventos Socket.io
    const { emitOrderPaid, emitOrderNew, emitOrderStatus } = await import(
      "../orders/orders.events"
    );

    emitOrderPaid(this.app, order.id, String(paymentData.id));

    // Notificar al admin con los datos del pedido
    const fullOrder = await this.app.prisma.order.findUnique({
      where: { id: order.id },
      include: { customer: true, _count: { select: { items: true } } },
    });

    if (fullOrder) {
      emitOrderNew(this.app, {
        id: fullOrder.id,
        orderNumber: fullOrder.orderNumber,
        status: fullOrder.status,
        type: fullOrder.type,
        total: fullOrder.total,
        deliveryFee: fullOrder.deliveryFee,
        customerName: fullOrder.customer.name,
        customerPhone: fullOrder.customer.phone,
        itemCount: fullOrder._count.items,
        paymentMethod: paymentData.payment_method_id,
        createdAt: fullOrder.createdAt.toISOString(),
      });
    }

    // Notificar al cliente
    emitOrderStatus(this.app, order.customerId, order.id, "RECEIVED");

    this.app.log.info(
      `Pedido #${order.orderNumber} activado — pago ${paymentData.id} aprobado`
    );
  }

  /**
   * Pago rechazado → cancelar pedido y notificar al cliente con el motivo.
   */
  private async onPaymentRejected(order: any, paymentData: any) {
    if (order.status !== "PENDING_PAYMENT") return;

    await this.app.prisma.$transaction([
      this.app.prisma.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
      }),
      this.app.prisma.orderStatusLog.create({
        data: {
          orderId: order.id,
          from: "PENDING_PAYMENT",
          to: "CANCELLED",
          note: `Pago rechazado: ${paymentData.status_detail}`,
        },
      }),
    ]);

    const { emitOrderStatus, emitOrderRejected } = await import(
      "../orders/orders.events"
    );
    emitOrderStatus(this.app, order.customerId, order.id, "CANCELLED");

    // Also emit the detailed rejection event for the client UI
    const { getRejectMessage } = await import("../../utils/payment-messages");
    const { message } = getRejectMessage(paymentData.status_detail);
    emitOrderRejected(this.app, order.customerId, {
      orderNumber: order.orderNumber,
      statusDetail: paymentData.status_detail,
      message,
    });

    this.app.log.info(
      `Pedido #${order.orderNumber} cancelado — pago rechazado: ${paymentData.status_detail}`
    );
  }

  /**
   * Reembolso total de un pedido (solo admin).
   * Solo se puede reembolsar si el pedido no fue entregado.
   */
  async refundOrder(orderId: string) {
    const order = await this.app.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true, customer: true },
    });

    if (!order) throw new Error("Pedido no encontrado");

    if (["DELIVERED", "CANCELLED"].includes(order.status)) {
      throw new Error("No se puede reembolsar un pedido ya entregado o cancelado");
    }

    const mpPaymentId = order.payment?.mpPaymentId;
    if (!mpPaymentId) {
      throw new Error("Este pedido no tiene un pago con tarjeta registrado");
    }

    // Llamar a MP para crear el reembolso
    const mpRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${mpPaymentId}/refunds`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
      }
    );

    if (!mpRes.ok) {
      const errorBody = await mpRes.json() as { message?: string };
      throw new Error(errorBody.message || "Error al procesar reembolso en MercadoPago");
    }

    // Actualizar en DB
    await this.app.prisma.$transaction([
      this.app.prisma.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
      }),
      this.app.prisma.payment.update({
        where: { orderId },
        data: {
          status: "REFUNDED",
          refundedAmount: order.total,
          refundedAt: new Date(),
        },
      }),
      this.app.prisma.orderStatusLog.create({
        data: {
          orderId: order.id,
          from: order.status,
          to: "CANCELLED",
          note: "Reembolso total procesado por admin",
        },
      }),
    ]);

    // Notificar al cliente
    const { emitOrderStatus } = await import("../orders/orders.events");
    emitOrderStatus(this.app, order.customerId, order.id, "CANCELLED");

    return { ok: true, message: "Reembolso procesado" };
  }

  /**
   * Status del pago de un pedido.
   */
  async getPaymentStatus(orderId: string) {
    const payment = await this.app.prisma.payment.findUnique({
      where: { orderId },
    });
    if (!payment) throw new Error("Pago no encontrado");
    return {
      id: payment.id,
      status: payment.status,
      statusDetail: payment.statusDetail,
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      paidAt: payment.paidAt?.toISOString() || null,
      approvedAt: payment.approvedAt?.toISOString() || null,
    };
  }

  /**
   * Listado de pagos para el admin con filtros.
   */
  async getAdminPayments(filters: {
    status?: string;
    from?: string;
    to?: string;
    page?: number;
  }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    const page = filters.page || 1;
    const take = 20;

    const [payments, total] = await Promise.all([
      this.app.prisma.payment.findMany({
        where,
        include: { order: { select: { orderNumber: true, customerId: true } } },
        orderBy: { createdAt: "desc" },
        take,
        skip: (page - 1) * take,
      }),
      this.app.prisma.payment.count({ where }),
    ]);

    return { payments, total, page, pages: Math.ceil(total / take) };
  }

  /**
   * Revenue del negocio por período.
   */
  async getRevenue(period: "day" | "week" | "month") {
    const now = new Date();
    let from: Date;

    if (period === "day") {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === "week") {
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const payments = await this.app.prisma.payment.findMany({
      where: {
        status: "APPROVED",
        approvedAt: { gte: from },
      },
    });

    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalFees = payments.reduce((sum, p) => sum + (p.mpFee || 0), 0);
    const totalNet = payments.reduce((sum, p) => sum + (p.netAmount || 0), 0);

    return {
      period,
      from: from.toISOString(),
      to: now.toISOString(),
      count: payments.length,
      totalRevenue,
      totalFees,
      totalNet,
    };
  }

  private mapMpStatus(
    status: string | undefined
  ): "PENDING" | "APPROVED" | "REJECTED" | "REFUNDED" {
    switch (status) {
      case "approved":
        return "APPROVED";
      case "rejected":
        return "REJECTED";
      case "refunded":
        return "REFUNDED";
      default:
        return "PENDING";
    }
  }
}
