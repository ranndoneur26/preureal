-- Plans Preureal — FASE 1 (migració progressiva): historial del Gratuït amb TTL de 7 dies.
--
-- Additiva i idempotent: NOMÉS toca la fila FREE de PlanSetting, fusionant la clau
-- nova "historialTtlDies" dins del JSON de features SENSE esborrar cap clau
-- existent. PREMIUM i PRO NO es toquen (comportament vigent intacte — els preus
-- i els límits publicats són inmutables).
--
-- Nota: si la fila FREE no existeix, els defaults de codi (plans.ts, FREE
-- historialTtlDies=7) ja apliquen via getPlanSettings(); la migració només fa
-- explícita la configuració quan la fila hi és, perquè el merge de PlanSetting
-- sobre els defaults no la perdi en el futur.

-- 1) fila FREE existent amb features JSON: afegir la clau (jsonb merge additiu)
UPDATE "PlanSetting"
SET "features" = (("features")::jsonb || '{"historialTtlDies":7}'::jsonb)::text
WHERE "plan" = 'FREE'
  AND "features" IS NOT NULL
  AND (("features")::jsonb ->> 'historialTtlDies') IS DISTINCT FROM '7';

-- 2) fila FREE existent amb features NULL: inicialitzar només amb la clau nova
UPDATE "PlanSetting"
SET "features" = '{"historialTtlDies":7}'::text
WHERE "plan" = 'FREE'
  AND "features" IS NULL;

-- Invers documentat (rollback de la FASE 1):
--   UPDATE "PlanSetting" SET "features" = (("features")::jsonb - 'historialTtlDies')::text WHERE "plan" = 'FREE';
