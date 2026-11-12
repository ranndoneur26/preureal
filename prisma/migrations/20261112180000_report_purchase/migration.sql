-- v38.8 — informes individuals de pagament únic (Stripe mode "payment", sense subscripció)
-- Cada fila = una compra d'un informe (municipi / valoració / comparativa).
-- El preu i els paràmetres es snapshoten al crear la sessió per poder regenerar
-- el PDF exactament com el que es va pagar. Token de descàrrega sempre hashejat.

-- CreateTable
CREATE TABLE "ReportPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "params" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stripeSessionId" TEXT,
    "stripePaymentIntent" TEXT,
    "downloadTokenHash" TEXT,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportPurchase_stripeSessionId_key" ON "ReportPurchase"("stripeSessionId");

-- CreateIndex
CREATE INDEX "ReportPurchase_userId_idx" ON "ReportPurchase"("userId");

-- CreateIndex
CREATE INDEX "ReportPurchase_status_idx" ON "ReportPurchase"("status");

-- AddForeignKey
ALTER TABLE "ReportPurchase" ADD CONSTRAINT "ReportPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
