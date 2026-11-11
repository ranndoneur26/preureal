-- 255 municipis sense dada: fix Palamós (cruïlla de nom) + referència de
-- comarca per als municipis sense renda publicada per Incasòl (mostra petita).
-- Migració ESTRICTAMENT ADITIVA: 4 columnes noves a Municipality. Cap columna
-- ni fila existent no es toca. SQL idempotent: segur també al SQL Editor.

ALTER TABLE "Municipality" ADD COLUMN IF NOT EXISTS "comarcaRefLatest" DOUBLE PRECISION;
ALTER TABLE "Municipality" ADD COLUMN IF NOT EXISTS "comarcaRefPeriod" TEXT;
ALTER TABLE "Municipality" ADD COLUMN IF NOT EXISTS "comarcaRefHistory" TEXT;
ALTER TABLE "Municipality" ADD COLUMN IF NOT EXISTS "rentSource" TEXT;

CREATE INDEX IF NOT EXISTS "Municipality_rentSource_idx" ON "Municipality"("rentSource");
