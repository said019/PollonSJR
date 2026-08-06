import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import {
  associateTransferProofReference,
  createImmediateConcurrencyLimiter,
  ordersRoutes,
} from "./orders.routes";
import {
  buildTransferProofDeliveryUrl,
  deleteTransferProof,
  storeTransferProof,
} from "./transfer-proof.storage";
import { registerUploads } from "../../plugins/uploads";

const snapshot = {
  id: "order-1",
  customerId: "customer-1",
  paymentMethod: "TRANSFER" as const,
  status: "PENDING_PAYMENT" as const,
  transferProofUrl: null,
  updatedAt: new Date("2026-08-05T12:00:00.000Z"),
};

type OrderDelegate = Parameters<typeof associateTransferProofReference>[0];

test("proof limiter rejects bursts without queuing and releases idempotently", () => {
  const limiter = createImmediateConcurrencyLimiter(2);
  const releaseFirst = limiter.tryAcquire();
  const releaseSecond = limiter.tryAcquire();
  assert.ok(releaseFirst);
  assert.ok(releaseSecond);
  assert.equal(limiter.activeCount(), 2);
  assert.equal(limiter.tryAcquire(), null);

  releaseFirst();
  releaseFirst();
  assert.equal(limiter.activeCount(), 1);
  const releaseThird = limiter.tryAcquire();
  assert.ok(releaseThird);
  assert.equal(limiter.activeCount(), 2);

  releaseSecond();
  releaseThird();
  assert.equal(limiter.activeCount(), 0);
});

test("proof association uses an optimistic conditional update", async () => {
  let updateArgs: any;
  const storedReference = "gdrive:1234567890file:pdf";
  const associatedOrder = {
    ...snapshot,
    transferProofUrl: storedReference,
    customer: { name: "Cliente", phone: "000" },
    _count: { items: 1 },
  } as any;
  const delegate = {
    updateMany: async (args: any) => {
      updateArgs = args;
      return { count: 1 };
    },
    findUnique: async () => associatedOrder,
  } as unknown as OrderDelegate;

  const result = await associateTransferProofReference(
    delegate,
    snapshot,
    storedReference,
    new Date("2026-08-05T12:01:00.000Z")
  );

  assert.equal(result.kind, "associated");
  assert.deepEqual(updateArgs.where, {
    id: snapshot.id,
    customerId: snapshot.customerId,
    paymentMethod: "TRANSFER",
    status: "PENDING_PAYMENT",
    transferProofUrl: null,
    updatedAt: snapshot.updatedAt,
  });
  assert.equal(updateArgs.data.transferProofUrl, storedReference);
});

test("proof association rejects a concurrent order change", async () => {
  const delegate = {
    updateMany: async () => ({ count: 0 }),
    findUnique: async () => {
      throw new Error("should not read after a known conflict");
    },
  } as unknown as OrderDelegate;

  const result = await associateTransferProofReference(
    delegate,
    snapshot,
    "gdrive:1234567890file:pdf"
  );
  assert.deepEqual(result, { kind: "conflict" });
});

test("ambiguous DB error is reconciled without deleting a committed proof", async () => {
  const storedReference = "gdrive:1234567890file:pdf";
  const delegate = {
    updateMany: async () => {
      throw new Error("connection lost after commit");
    },
    findUnique: async () => ({
      ...snapshot,
      transferProofUrl: storedReference,
      customer: { name: "Cliente", phone: "000" },
      _count: { items: 1 },
    }),
  } as unknown as OrderDelegate;

  const result = await associateTransferProofReference(
    delegate,
    snapshot,
    storedReference
  );
  assert.equal(result.kind, "associated");
  if (result.kind === "associated") {
    assert.equal(result.order?.transferProofUrl, storedReference);
    assert.ok(result.warning instanceof Error);
  }
});

test("unresolved DB error remains unknown so the uploaded object is retained", async () => {
  const delegate = {
    updateMany: async () => {
      throw new Error("connection lost");
    },
    findUnique: async () => {
      throw new Error("reconciliation unavailable");
    },
  } as unknown as OrderDelegate;

  const result = await associateTransferProofReference(
    delegate,
    snapshot,
    "gdrive:1234567890file:pdf"
  );
  assert.equal(result.kind, "unknown");
});

test("signed HTTP route serves a private legacy proof and rejects unsigned access", async () => {
  const previousSecret = process.env.TRANSFER_PROOFS_URL_SIGNING_SECRET;
  process.env.TRANSFER_PROOFS_URL_SIGNING_SECRET =
    "route-test-signing-secret-with-at-least-32-bytes";
  const fileName = `route-test-${Date.now()}.pdf`;
  const reference = await storeTransferProof(
    { buffer: Buffer.from("route-proof"), fileName, kind: "pdf" },
    { env: { TRANSFER_PROOFS_STORAGE: "local" } }
  );
  const app = Fastify({ logger: false });
  app.decorate("prisma", {
    order: {
      findUnique: async () => ({ transferProofUrl: reference }),
    },
  } as any);

  try {
    await registerUploads(app);
    await app.register(ordersRoutes, { prefix: "/api/orders" });
    await app.ready();
    const signedUrl = buildTransferProofDeliveryUrl("order-1", reference);
    assert.ok(signedUrl);

    const valid = await app.inject({ method: "GET", url: signedUrl });
    assert.equal(valid.statusCode, 200);
    assert.equal(valid.body, "route-proof");
    assert.match(
      String(valid.headers["content-type"] ?? ""),
      /application\/pdf/
    );
    assert.equal(valid.headers["cache-control"], "private, no-store");

    const unsigned = await app.inject({
      method: "GET",
      url: "/api/orders/order-1/transfer-proof/comprobante.pdf",
    });
    assert.equal(unsigned.statusCode, 403);

    const rawLegacy = await app.inject({ method: "GET", url: reference });
    assert.equal(rawLegacy.statusCode, 404);

    const rawFileName = reference.split("/").pop();
    for (const bypassPath of [
      `/uploads//transfer-proofs/${rawFileName}`,
      `/uploads/%2Ftransfer-proofs/${rawFileName}`,
      `/uploads/%252Ftransfer-proofs/${rawFileName}`,
      `/uploads/%5Ctransfer-proofs%5C${rawFileName}`,
      `/uploads/./transfer-proofs/${rawFileName}`,
      `/uploads/public/../transfer-proofs/${rawFileName}`,
    ]) {
      const bypass = await app.inject({ method: "GET", url: bypassPath });
      assert.equal(bypass.statusCode, 404, bypassPath);
    }
  } finally {
    await app.close();
    await deleteTransferProof(reference);
    if (previousSecret === undefined) {
      delete process.env.TRANSFER_PROOFS_URL_SIGNING_SECRET;
    } else {
      process.env.TRANSFER_PROOFS_URL_SIGNING_SECRET = previousSecret;
    }
  }
});
