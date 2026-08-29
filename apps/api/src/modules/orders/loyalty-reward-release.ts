import type { FastifyInstance } from "fastify";

/**
 * Devuelve al cliente el premio de lealtad que consumió un pedido cancelado.
 *
 * El premio se descuenta al CREAR el pedido (hace falta para cobrar el total
 * correcto), pero hasta ahora nadie lo devolvía: un pedido con tarjeta que el
 * cliente nunca pagaba —o uno cancelado por el negocio— se llevaba el producto
 * gratis para siempre. Este helper existe para que las cinco rutas que
 * cancelan un pedido (admin, cliente, pago rechazado, reembolso y el job de
 * pedidos zombie) hagan lo mismo, igual que `releaseAppComboPromotion`.
 *
 * Nunca lanza: cancelar un pedido no puede fallar por la tarjeta de lealtad.
 */
export async function restoreLoyaltyReward(
  app: FastifyInstance,
  orderId: string
): Promise<void> {
  try {
    const { LoyaltyService } = await import("../loyalty/loyalty.service");
    await new LoyaltyService(app).restorePendingReward(orderId);
  } catch (err) {
    app.log.error({ err, orderId }, "No se pudo devolver el premio de lealtad");
  }
}
