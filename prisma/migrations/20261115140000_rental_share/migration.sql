-- v41 — Indicador «% estimat d'alquiler sobre el parc residencial»
-- (numerador: fiances vigents INCASÒL; denominador: parc residencial Catastro;
--  referència censal INE 2021 via Idescat; flux de fiances com a referència).
-- Migració ADDITIVA: cap taula existent no es modifica.
-- Disseny i validacions: docs/INDICADOR_ALQUILER_PARQUE.md

-- CreateTable
CREATE TABLE "RentalShareObservation" (
    "id" TEXT NOT NULL,
    "municipalityCode" TEXT NOT NULL,
    "municipalityName" TEXT,
    "referenceKey" TEXT NOT NULL,
    "numeratorKind" TEXT,
    "incasolActiveDeposits" INTEGER,
    "incasolDepositsPeriod" INTEGER,
    "incasolPeriod" TEXT,
    "residentialProperties" INTEGER,
    "cadastreYear" TEXT,
    "rentalPercentage" DOUBLE PRECISION,
    "censusMainRental" INTEGER,
    "censusMainTotal" INTEGER,
    "censusRentalPercentage" DOUBLE PRECISION,
    "censusYear" TEXT,
    "incasolSource" TEXT,
    "cadastreSource" TEXT,
    "censusSource" TEXT,
    "methodologyVersion" TEXT NOT NULL DEFAULT '1.0',
    "dataStatus" TEXT NOT NULL,
    "warnings" TEXT,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalShareObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RentalShareObservation_municipalityCode_referenceKey_key" ON "RentalShareObservation"("municipalityCode", "referenceKey");

-- CreateIndex
CREATE INDEX "RentalShareObservation_municipalityCode_idx" ON "RentalShareObservation"("municipalityCode");

-- CreateIndex
CREATE INDEX "RentalShareObservation_dataStatus_idx" ON "RentalShareObservation"("dataStatus");
