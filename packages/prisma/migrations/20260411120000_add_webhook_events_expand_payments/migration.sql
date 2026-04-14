-- AlterTable: expand Payment model
ALTER TABLE "Payment" ADD COLUMN "statusDetail" TEXT;
ALTER TABLE "Payment" ADD COLUMN "mpFee" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "netAmount" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "Payment" ADD COLUMN "installments" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Payment" ADD COLUMN "refundedAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "providerPayload" JSONB;
ALTER TABLE "Payment" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "refundedAt" TIMESTAMP(3);

-- CreateIndex: unique constraint on mpPaymentId
CREATE UNIQUE INDEX "Payment_mpPaymentId_key" ON "Payment"("mpPaymentId");

-- CreateTable: WebhookEvent for idempotency
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "mpEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_mpEventId_key" ON "WebhookEvent"("mpEventId");
