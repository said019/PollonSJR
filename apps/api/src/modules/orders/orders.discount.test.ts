import assert from "node:assert/strict";
import test from "node:test";
import { OrdersService } from "./orders.service";

/**
 * Pedido #2908010 de la vida real: 1× 12 Piezas con el premio de lealtad
 * aplicado, en efectivo, a domicilio.
 */
const pedidoBase = {
  id: "pedido-1",
  orderNumber: 2908010,
  customerId: "cliente-1",
  status: "PREPARING" as const,
  paymentMethod: "CASH" as const,
  subtotal: 22000,
  discountAmount: 22000,
  discountReason: "12 Piezas gratis (lealtad)",
  deliveryFee: 3000,
  tipAmount: 0,
  appFeeAmount: 0,
  total: 3000,
  isScheduled: false,
  depositAmount: null,
  remainingAmount: null,
  loyaltyRewardProductId: "prod-12-piezas",
  loyaltyRewardExpiresAt: new Date("2027-01-01T00:00:00.000Z"),
  payment: null as { status: string } | null,
};

function buildApp(order: Partial<typeof pedidoBase> = {}) {
  const updates: any[] = [];
  const logs: any[] = [];
  const app = {
    log: { error: () => {}, warn: () => {}, info: () => {} },
    prisma: {
      order: {
        findUnique: async () => ({ ...pedidoBase, ...order }),
        update: async (args: any) => {
          updates.push(args);
          return {};
        },
      },
      orderStatusLog: {
        create: async (args: any) => {
          logs.push(args);
          return {};
        },
      },
      // La devolución del premio se prueba aparte, en loyalty.service.test.ts.
      loyaltyCard: { findUnique: async () => null },
      $transaction: async (ops: any[]) => Promise.all(ops),
    },
  } as any;
  return { app, updates, logs };
}

test("quitar el descuento deja el pedido en productos + envío", async () => {
  const { app, updates, logs } = buildApp();

  const res = await new OrdersService(app).adjustDiscount("pedido-1", 0);

  assert.equal(res.total, 25000); // $220 + $30
  assert.equal(res.previousTotal, 3000);
  assert.equal(updates[0].data.discountAmount, 0);
  assert.equal(updates[0].data.discountReason, null);
  // Queda constancia de la corrección en la bitácora del pedido.
  assert.match(logs[0].data.note, /Descuento \$220\.00 → \$0\.00/);
});

test("con tarjeta la comisión del 4% se recalcula sobre el total nuevo", async () => {
  const { app } = buildApp({ paymentMethod: "CARD" as any, payment: null });

  const res = await new OrdersService(app).adjustDiscount("pedido-1", 0);

  // 4% de $250 = $10 → total $260
  assert.equal(res.total, 26000);
});

test("un pedido ya cobrado con tarjeta no se toca", async () => {
  const { app } = buildApp({
    paymentMethod: "CARD" as any,
    payment: { status: "APPROVED" },
  });

  await assert.rejects(
    () => new OrdersService(app).adjustDiscount("pedido-1", 0),
    /reembolso/
  );
});

test("un pedido ya entregado o cancelado no se toca", async () => {
  for (const status of ["DELIVERED", "CANCELLED"] as const) {
    const { app } = buildApp({ status: status as any });
    await assert.rejects(
      () => new OrdersService(app).adjustDiscount("pedido-1", 0),
      /cerrado/
    );
  }
});

test("el descuento no puede pasar del valor de los productos", async () => {
  const { app } = buildApp();
  await assert.rejects(
    () => new OrdersService(app).adjustDiscount("pedido-1", 30000),
    /no puede pasar de \$220\.00/
  );
  await assert.rejects(
    () => new OrdersService(app).adjustDiscount("pedido-1", -1),
    /negativo/
  );
});

test("un descuento parcial también recalcula el total", async () => {
  const { app } = buildApp();

  const res = await new OrdersService(app).adjustDiscount("pedido-1", 5000);

  // $220 − $50 + $30 de envío
  assert.equal(res.total, 20000);
  assert.equal(res.discountAmount, 5000);
});

test("un pedido programado reparte el nuevo total 50/50", async () => {
  const { app, updates } = buildApp({
    isScheduled: true,
    depositAmount: 1500,
    remainingAmount: 1500,
  });

  await new OrdersService(app).adjustDiscount("pedido-1", 0);

  assert.equal(updates[0].data.depositAmount, 12500);
  assert.equal(updates[0].data.remainingAmount, 12500);
});
