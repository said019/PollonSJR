import { FastifyInstance } from "fastify";

export class CouponError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CouponError";
  }
}

/**
 * Validate a coupon code and return the discount amount.
 * Throws CouponError if invalid.
 *
 * "subtotal" es el valor del pedido y gobierna el mínimo del cupón.
 * "discountBase" es sobre cuánto se calcula el descuento: cuando el pedido
 * ya trae un combo con precio especial, el cupón sólo puede morder lo que
 * queda por pagar, si no se estaría descontando dos veces lo mismo. Por
 * omisión son lo mismo (pedido sin combos).
 */
export async function validateCoupon(
  app: FastifyInstance,
  code: string,
  customerId: string,
  subtotal: number,
  discountBase: number = subtotal
): Promise<{ id: string; discountAmount: number; message: string }> {
  const coupon = await app.prisma.coupon.findUnique({
    where: { code: code.toUpperCase().trim() },
  });

  if (!coupon || !coupon.active) {
    throw new CouponError("Cupón no válido o ya no está disponible.");
  }

  if (coupon.expiresAt && new Date() > coupon.expiresAt) {
    throw new CouponError("Este cupón ya venció.");
  }

  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    throw new CouponError("Este cupón ya llegó a su límite de usos.");
  }

  if (coupon.minOrderAmount && subtotal < coupon.minOrderAmount) {
    const min = coupon.minOrderAmount / 100;
    throw new CouponError(`El pedido mínimo para este cupón es $${min}.`);
  }

  if (coupon.firstOrderOnly) {
    const previousOrders = await app.prisma.order.count({
      where: {
        customerId,
        status: { notIn: ["PENDING_PAYMENT", "CANCELLED"] },
      },
    });
    if (previousOrders > 0) {
      throw new CouponError("Este cupón es solo para tu primer pedido.");
    }
  }

  const base = Math.max(0, discountBase);
  let discountAmount: number;
  if (coupon.type === "PERCENT") {
    discountAmount = Math.round((base * coupon.value) / 100);
  } else {
    discountAmount = Math.min(coupon.value, base);
  }

  const descStr =
    coupon.type === "PERCENT"
      ? `${coupon.value}% de descuento`
      : `$${coupon.value / 100} de descuento`;

  return {
    id: coupon.id,
    discountAmount,
    message: `Cupón aplicado: ${descStr}`,
  };
}
