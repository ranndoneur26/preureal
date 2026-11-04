-- v19 (auditoría del sistema de correo): telemetría EmailLog + outbox duradero
-- Todos los cambios son ADITIVOS: no se borra ni se renombra ninguna columna.

ALTER TABLE "EmailLog" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'GENERIC';
ALTER TABLE "EmailLog" ADD COLUMN "userId" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EmailLog" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "EmailLog" ADD COLUMN "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "EmailLog" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "EmailLog_status_nextRetryAt_idx" ON "EmailLog"("status", "nextRetryAt");
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");
CREATE INDEX "EmailLog_userId_idx" ON "EmailLog"("userId");
CREATE UNIQUE INDEX "EmailLog_idempotencyKey_key" ON "EmailLog"("idempotencyKey");
