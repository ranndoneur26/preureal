-- Mejoras premium (retención + 2FA + alertas de precio + SEO):
-- migración 100% ADITIVA — no toca columnas ni datos existentes.
-- 1) User: TOTP 2FA (secreto cifrado AES-GCM, estado y códigos de recuperación bcrypt)
ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "totpEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "totpRecoveryCodes" TEXT;

-- 2) Favorite: alertas de precio (umbral % y último valor notificado)
ALTER TABLE "Favorite" ADD COLUMN "alertPct" DOUBLE PRECISION;
ALTER TABLE "Favorite" ADD COLUMN "lastNotifiedValue" DOUBLE PRECISION;
ALTER TABLE "Favorite" ADD COLUMN "tenseNoticed" BOOLEAN NOT NULL DEFAULT false;

-- 3) Municipality: slug público para /lloguer/[slug] (SEO, índice único)
ALTER TABLE "Municipality" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX "Municipality_slug_key" ON "Municipality"("slug");

-- 4) PriceAlertLog: idempotencia de avisos (1 aviso por usuario/entidad/tipo/período)
CREATE TABLE "PriceAlertLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "prevValue" DOUBLE PRECISION,
    "newValue" DOUBLE PRECISION,
    "pctChange" DOUBLE PRECISION,
    "notifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PriceAlertLog_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PriceAlertLog_userId_entityKey_kind_period_key" ON "PriceAlertLog"("userId", "entityKey", "kind", "period");
CREATE INDEX "PriceAlertLog_userId" ON "PriceAlertLog"("userId");

-- 5) Subscription: motivo de cancelación (retención y analítica)
ALTER TABLE "Subscription" ADD COLUMN "cancelReason" TEXT;
