-- Fase 4 — Ajudes al lloguer: catàleg editorial de convocatories.
-- Migració ESTRICTAMENT ADITIVA: només crea una taula nova (RentalAid).
-- Cap taula, columna ni dada existent no es toca. Cap relació nova amb
-- taules vigents. SQL idempotent: segur també al SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS "RentalAid" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEs" TEXT,
    "description" TEXT NOT NULL,
    "descriptionEs" TEXT,
    "scope" TEXT NOT NULL,
    "scopeCode" TEXT,
    "amount" TEXT,
    "audience" TEXT,
    "audienceEs" TEXT,
    "status" TEXT NOT NULL DEFAULT 'VIGENTE',
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "lastReviewedAt" TIMESTAMP(3) NOT NULL,
    "reviewedBy" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalAid_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RentalAid_code_key" ON "RentalAid"("code");

CREATE INDEX IF NOT EXISTS "RentalAid_status_scope_scopeCode_idx" ON "RentalAid"("status", "scope", "scopeCode");
