-- v19 (auditoría del sistema de correo): telemetría EmailLog + outbox duradero
-- Todos los cambios son ADITIVOS: no se borra ni se renombra ninguna columna.
-- IDEMPOTENTE (v20): puede ejecutarse varias veces (SQL Editor de Supabase o
-- `prisma migrate deploy` en el build) sin fallar si ya está aplicada.

ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'GENERIC';
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "EmailLog_status_nextRetryAt_idx" ON "EmailLog"("status", "nextRetryAt");
CREATE INDEX IF NOT EXISTS "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");
CREATE INDEX IF NOT EXISTS "EmailLog_userId_idx" ON "EmailLog"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "EmailLog_idempotencyKey_key" ON "EmailLog"("idempotencyKey");
