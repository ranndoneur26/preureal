-- v22 (Fase 1 subscripcions: user_subscriptions + subscription_usage + RLS)
-- Encàrrec: única suscripción vigente per compte, historial mai esborrat,
-- comptadors d'ús mensuals, i blindatge del esquema contra accés directe des
-- del navegador (equivalent RLS per a una BD gestionada per Supabase on l'ÚNIC
-- client de Postgres és el backend via Prisma).
--
-- TOT ÉS ADDITIU: no es borra ni es renombra cap columna (el sistema de correu
-- d'EmailLog NO es toca). IDEMPOTENT: es pot aplicar vàries vegades.

-- ── 1) Nous camps de "Subscription" (l'equivalent user_subscriptions) ──────
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "currentPeriodStart" TIMESTAMP(3);
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "billingInterval" TEXT;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

-- ── 2) "SubscriptionUsage" (l'equivalent subscription_usage) ───────────────
CREATE TABLE IF NOT EXISTS "SubscriptionUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "usageType" TEXT NOT NULL,
    "usageMonth" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionUsage_userId_usageType_usageMonth_key"
  ON "SubscriptionUsage"("userId", "usageType", "usageMonth");
CREATE INDEX IF NOT EXISTS "SubscriptionUsage_userId_usageMonth_idx"
  ON "SubscriptionUsage"("userId", "usageMonth");
CREATE INDEX IF NOT EXISTS "SubscriptionUsage_usageMonth_idx"
  ON "SubscriptionUsage"("usageMonth");

DO $$ BEGIN
  ALTER TABLE "SubscriptionUsage" ADD CONSTRAINT "SubscriptionUsage_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Mes amb format "YYYY-MM" (defensa en profunditat; el codi ja el genera bé)
DO $$ BEGIN
  ALTER TABLE "SubscriptionUsage" ADD CONSTRAINT "SubscriptionUsage_usageMonth_check"
    CHECK ("usageMonth" ~ '^[0-9]{4}-[0-9]{2}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3) UNA única subscripció vigent per usuari ─────────────────────────────
-- 3a) Tanca les subscripcions actives duplicades conservant la millor (plan més
--     alt) i la més recent; les altres passen a "superseded" (historial intacte,
--     mai DELETE). Si es reexecuta, no troba duplicats i no fa res.
UPDATE "Subscription" s SET "status" = 'superseded'
WHERE s."status" IN ('active', 'trialing')
  AND s."id" <> (
    SELECT s2."id" FROM "Subscription" s2
    WHERE s2."userId" = s."userId" AND s2."status" IN ('active', 'trialing')
    ORDER BY CASE s2."plan" WHEN 'PRO' THEN 2 WHEN 'PREMIUM' THEN 1 ELSE 0 END DESC,
             s2."createdAt" DESC,
             s2."id" ASC
    LIMIT 1
  );

-- 3b) Índex ÚNIC parcial: mai més de UNA subscripció active/trialing per usuari,
--     garantit a nivell de BD (ni demo, ni carrera de webhooks hi pot escapar).
CREATE UNIQUE INDEX IF NOT EXISTS "Subscription_one_active_per_user_key"
  ON "Subscription"("userId") WHERE "status" IN ('active', 'trialing');

-- ── 4) RLS: bloqueja l'accés directe des de Supabase (PostgREST/anon) ──────
-- L'app connecta com a rol propietari (postgres via pooler) → PostgreSQL
-- estàndard: el PROPIETARI no està subjecte a RLS (sense FORCE) → l'aplicació
-- no canvia res. Els rols anon/authenticated de Supabase (la clau anon és
-- pública) NO tenen cap política → DENY total. Així ningú es pot auto-pujar a
-- Premium tocant la BD des del navegador: l'únic camí són les rutes de l'API
-- autenticades i els webhooks de Stripe signats.
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
