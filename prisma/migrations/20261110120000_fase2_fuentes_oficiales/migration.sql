-- Fase 2 — Fonts oficials INE: catàleg de fonts i observacions estadístiques.
-- Migració ESTRICTAMENT ADITIVA: només crea dues taules noves (DataSource,
-- StatObservation). Cap taula, columna ni dada existent no es toca.
-- SQL idempotent: segur també al SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS "DataSource" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "url" TEXT,
    "license" TEXT,
    "unit" TEXT,
    "periodicity" TEXT,
    "methodology" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StatObservation" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "variable" TEXT NOT NULL,
    "geoLevel" TEXT NOT NULL,
    "geoCode" TEXT NOT NULL,
    "geoName" TEXT,
    "municipalityCode" TEXT,
    "period" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "meta" TEXT,
    "runId" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatObservation_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "StatObservation"
    ADD CONSTRAINT "StatObservation_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "DataSource_code_key" ON "DataSource"("code");

CREATE UNIQUE INDEX IF NOT EXISTS "StatObservation_sourceId_variable_geoLevel_geoCode_period_key" ON "StatObservation"("sourceId", "variable", "geoLevel", "geoCode", "period");
CREATE INDEX IF NOT EXISTS "StatObservation_variable_period_idx" ON "StatObservation"("variable", "period");
CREATE INDEX IF NOT EXISTS "StatObservation_geoLevel_geoCode_idx" ON "StatObservation"("geoLevel", "geoCode");
CREATE INDEX IF NOT EXISTS "StatObservation_municipalityCode_idx" ON "StatObservation"("municipalityCode");
CREATE INDEX IF NOT EXISTS "StatObservation_runId_idx" ON "StatObservation"("runId");
