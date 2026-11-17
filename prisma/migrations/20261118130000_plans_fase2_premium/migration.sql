-- Plans Preureal — FASE 2 (migració progressiva): Premium — 4 punts «Nou»
-- (Valora v2 il·limitat · mòdul normatiu complet · alertes de preu/normativa ·
-- historial il·limitat) + realineació APROVADA pel propietari dels valors de
-- PlanSetting amb el que està publicat a la pàgina de preus.
--
-- RED LINES QUE AQUESTA MIGRACIÓ NO TOCA:
--   · Preus: "priceEur" NO es modifica (0 / 8,99 / 24,99 € tal com són a la BD).
--   · Stripe: ni un sol identificador de preu ni flux de pagament.
--   · Quota publicada de PDFs: Premium "pdfMonth": 5 es FIXA al mateix valor
--     publicat (la BD tenia el tipus incorrecte false; el fallback de codi ja
--     tornava 5, cap canvi de comportament — només veritat al JSON).
--   · Gratuït: la fila FREE NO es toca (res de res).
--   · Comparator 6 / consultes publicades: comparatorMax fora d'aquest fitxer.
--
-- Realineació aprovada (comunicada pel propietari a la FASE 0):
--   · Premium quotaMonth 7 → -1  («Consultes il·limitades» és el bullet
--     publicat; la BD quedava enrere. S'ALINEA amb el publicat, mai al revés).
--   · Premium historial false→true i historialTtlDies → -1 (Nou: historial
--     il·limitat), evolucioTemporal false→true (publicat, tipus incorrecte).
--   · Premium valoracionsMonth 5 → -1 (Nou: Valora v2 il·limitat).
--   · Flags nous: "normativaCompleta" i "alertes" (Nou FASE 2, Premium/Pro).
--   · PRO: rep els flags nous (el bullet publicat diu «Tot el de Premium», i
--     el pla Pro també té normatiu complet i alertes) i valoracionsMonth -1
--     per coherència (mai el plan inferior per sobre del superior). Els límits
--     publicats de Pro (30 PDFs, CSV) NO es toquen.
--
-- Idempotent: merge jsonb ADDITIU (mai esborra claus existents); es pot
-- reaplicar sense efecte addicional. La columna "features" és TEXT, mateix
-- patró que la migració FASE 1.
--
-- Nota: si una instal·lació no té fila PREMIUM/PRO a PlanSetting, els defaults
-- de codi (src/lib/plans.ts, actualitzats a la FASE 2 amb aquests mateixos
-- valors) ja apliquen via getPlanSettings().

-- 0) Taula "UserAlert" (model §5 «alertes_usuari» — decisió traçable de la
--    FASE 0: es crea AQUÍ, a la FASE 2; mai duplica SearchLog ni Favorite).
CREATE TABLE IF NOT EXISTS "UserAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "tipus" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "ultimaComprovacio" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAlert_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserAlert_userId_entityKey_tipus_key" ON "UserAlert"("userId", "entityKey", "tipus");
CREATE INDEX IF NOT EXISTS "UserAlert_userId_idx" ON "UserAlert"("userId");
CREATE INDEX IF NOT EXISTS "UserAlert_activa_tipus_idx" ON "UserAlert"("activa", "tipus");

-- 1) PREMIUM: merge additiu del JSON de features
UPDATE "PlanSetting"
SET "features" = (("features")::jsonb || '{
  "historial": true,
  "historialTtlDies": -1,
  "valoracionsMonth": -1,
  "normativaCompleta": true,
  "alertes": true,
  "evolucioTemporal": true,
  "pdfMonth": 5
}'::jsonb)::text
WHERE "plan" = 'PREMIUM';

-- 2) PREMIUM: realineació aprovada de la quota de consultes («il·limitades»)
UPDATE "PlanSetting"
SET "quotaMonth" = -1
WHERE "plan" = 'PREMIUM';

-- 3) PRO: hereda els punts «Nou» de Premium («Tot el de Premium» publicat);
-- els seus propis límits publicats (30 PDFs, CSV, historial il·limitat) intactes.
UPDATE "PlanSetting"
SET "features" = (("features")::jsonb || '{
  "normativaCompleta": true,
  "alertes": true,
  "valoracionsMonth": -1
}'::jsonb)::text
WHERE "plan" = 'PRO';

-- Invers documentat (rollback de la FASE 2 — mai aplicat automàticament):
--   UPDATE "PlanSetting" SET "features" = (("features")::jsonb
--     - 'normativaCompleta' - 'alertes'
--     || '{"historial":false,"historialTtlDies":0,"valoracionsMonth":5,"evolucioTemporal":false,"pdfMonth":false}'::jsonb
--   )::text WHERE "plan" = 'PREMIUM';
--   UPDATE "PlanSetting" SET "quotaMonth" = 7 WHERE "plan" = 'PREMIUM';
--   UPDATE "PlanSetting" SET "features" = (("features")::jsonb
--     - 'normativaCompleta' - 'alertes'
--     || '{"valoracionsMonth":30}'::jsonb
--   )::text WHERE "plan" = 'PRO';
--   DROP TABLE "UserAlert";
