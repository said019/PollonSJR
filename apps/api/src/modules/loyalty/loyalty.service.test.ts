import assert from "node:assert/strict";
import test from "node:test";
import { LoyaltyService } from "./loyalty.service";

const PIEZAS = { id: "prod-12-piezas", name: "12 Piezas", price: 22000 };
const REFRESCO = { id: "prod-refresco", name: "Refresco", price: 3000 };

interface CardState {
  id: string;
  customerId: string;
  pendingReward: boolean;
  pendingProduct: typeof PIEZAS | null;
  rewardExpiresAt: Date | null;
  rewardApprovedAt: Date | null;
  freeProductsUsed: number;
}

/**
 * Prisma de mentiras con lo justo para estas dos funciones. Registra las
 * escrituras para poder afirmar sobre ellas.
 */
function buildApp(opts: {
  card?: CardState | null;
  order?: {
    customerId: string;
    loyaltyRewardProductId: string | null;
    loyaltyRewardExpiresAt: Date | null;
  } | null;
}) {
  const writes: { cardUpdates: any[]; orderUpdates: any[]; events: any[] } = {
    cardUpdates: [],
    orderUpdates: [],
    events: [],
  };

  const app = {
    log: { error: () => {}, warn: () => {}, info: () => {} },
    prisma: {
      loyaltyCard: {
        findUnique: async () => opts.card ?? null,
        update: async (args: any) => {
          writes.cardUpdates.push(args);
          return {};
        },
        updateMany: async (args: any) => {
          writes.cardUpdates.push(args);
          // Simula el guard atómico: sólo pega si el premio sigue pendiente.
          return { count: opts.card?.pendingReward ? 1 : 0 };
        },
      },
      order: {
        findUnique: async () => opts.order ?? null,
        update: async (args: any) => {
          writes.orderUpdates.push(args);
          return {};
        },
      },
      loyaltyEvent: {
        create: async (args: any) => {
          writes.events.push(args);
          return {};
        },
      },
      $transaction: async (ops: any[]) => Promise.all(ops),
    },
  } as any;

  return { app, writes };
}

function pendingCard(overrides: Partial<CardState> = {}): CardState {
  return {
    id: "card-1",
    customerId: "cliente-1",
    pendingReward: true,
    pendingProduct: PIEZAS,
    rewardExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    rewardApprovedAt: new Date("2026-08-01T00:00:00.000Z"),
    freeProductsUsed: 2,
    ...overrides,
  };
}

test("el premio sólo se aplica si el producto premiado viene en el pedido", async () => {
  const { app, writes } = buildApp({ card: pendingCard() });

  const result = await new LoyaltyService(app).applyPendingReward("cliente-1", [
    { productId: REFRESCO.id, qty: 3, unitPrice: REFRESCO.price },
  ]);

  assert.equal(result.rewardApplied, false);
  assert.equal(result.discountAmount, 0);
  // Y sobre todo: el premio NO se quema, sigue disponible para después.
  assert.deepEqual(writes.cardUpdates, []);
});

test("un premio sin aprobar no se canjea ni se quema", async () => {
  const { app, writes } = buildApp({ card: pendingCard({ rewardApprovedAt: null }) });

  const result = await new LoyaltyService(app).applyPendingReward("cliente-1", [
    { productId: PIEZAS.id, qty: 1, unitPrice: PIEZAS.price },
  ]);

  assert.equal(result.rewardApplied, false);
  assert.equal(result.discountAmount, 0);
  // Sigue esperando el visto bueno del negocio, no se pierde.
  assert.deepEqual(writes.cardUpdates, []);
});

test("el descuento es el producto premiado, no el subtotal del pedido", async () => {
  const { app } = buildApp({ card: pendingCard() });

  const result = await new LoyaltyService(app).applyPendingReward("cliente-1", [
    { productId: PIEZAS.id, qty: 1, unitPrice: PIEZAS.price },
    { productId: REFRESCO.id, qty: 4, unitPrice: REFRESCO.price },
  ]);

  assert.equal(result.rewardApplied, true);
  // $220 de las piezas, no $220 + $120 de refrescos.
  assert.equal(result.discountAmount, PIEZAS.price);
  assert.equal(result.productId, PIEZAS.id);
});

test("una variante más barata se descuenta a su precio, no al precio base", async () => {
  const { app } = buildApp({ card: pendingCard() });

  const result = await new LoyaltyService(app).applyPendingReward("cliente-1", [
    { productId: PIEZAS.id, qty: 2, unitPrice: 15000 },
  ]);

  // Es UNA pieza gratis al precio realmente cobrado en la línea.
  assert.equal(result.discountAmount, 15000);
});

test("un premio vencido se limpia y no descuenta", async () => {
  const { app, writes } = buildApp({
    card: pendingCard({ rewardExpiresAt: new Date("2020-01-01T00:00:00.000Z") }),
  });

  const result = await new LoyaltyService(app).applyPendingReward("cliente-1", [
    { productId: PIEZAS.id, qty: 1, unitPrice: PIEZAS.price },
  ]);

  assert.equal(result.rewardApplied, false);
  assert.equal(writes.cardUpdates[0].data.pendingReward, false);
});

test("cancelar un pedido devuelve el premio con su vencimiento original", async () => {
  const expiresAt = new Date("2026-12-01T00:00:00.000Z");
  const { app, writes } = buildApp({
    order: {
      customerId: "cliente-1",
      loyaltyRewardProductId: PIEZAS.id,
      loyaltyRewardExpiresAt: expiresAt,
    },
    card: pendingCard({
      pendingReward: false,
      pendingProduct: null,
      rewardApprovedAt: null,
      freeProductsUsed: 3,
    }),
  });

  const restored = await new LoyaltyService(app).restorePendingReward("pedido-1");

  assert.equal(restored, true);
  assert.deepEqual(writes.cardUpdates[0].data, {
    pendingReward: true,
    pendingProductId: PIEZAS.id,
    rewardExpiresAt: expiresAt,
    freeProductsUsed: 2,
    rewardEarnedAt: writes.cardUpdates[0].data.rewardEarnedAt,
    // Vuelve aprobado: no tiene que pasar otra vez por el visto bueno.
    rewardApprovedAt: writes.cardUpdates[0].data.rewardApprovedAt,
  });
  assert.ok(writes.cardUpdates[0].data.rewardApprovedAt instanceof Date);
  // La marca del pedido se borra: cancelar dos veces no duplica el premio.
  assert.deepEqual(writes.orderUpdates[0].data, {
    loyaltyRewardProductId: null,
    loyaltyRewardExpiresAt: null,
  });
});

test("cancelar no pisa un premio que el cliente ya volvió a ganar", async () => {
  const { app, writes } = buildApp({
    order: {
      customerId: "cliente-1",
      loyaltyRewardProductId: PIEZAS.id,
      loyaltyRewardExpiresAt: new Date("2026-12-01T00:00:00.000Z"),
    },
    card: pendingCard(),
  });

  const restored = await new LoyaltyService(app).restorePendingReward("pedido-1");

  assert.equal(restored, false);
  assert.deepEqual(writes.cardUpdates, []);
  // Aun así se suelta la marca del pedido.
  assert.equal(writes.orderUpdates.length, 1);
});

test("un pedido sin premio no toca la tarjeta al cancelarse", async () => {
  const { app, writes } = buildApp({
    order: {
      customerId: "cliente-1",
      loyaltyRewardProductId: null,
      loyaltyRewardExpiresAt: null,
    },
    card: pendingCard(),
  });

  assert.equal(await new LoyaltyService(app).restorePendingReward("pedido-1"), false);
  assert.deepEqual(writes.cardUpdates, []);
  assert.deepEqual(writes.orderUpdates, []);
});
