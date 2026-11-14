-- v40 — Serveis i qualitat de l'entorn (Fase A del projecte d'ampliació).
-- Migració ADDITIVA: cap taula existent no es modifica.
-- Disseny: docs/ARQUITECTURA_DATOS.md (GeoPoint, GeoPolygon, BuildingAssociation).

-- CreateTable
CREATE TABLE "GeoPoint" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "kind" TEXT,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "municipalityCode" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "props" TEXT,
    "datasetSourceCode" TEXT NOT NULL,
    "datasetVersion" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeoPolygon" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "scenario" TEXT,
    "hazardLevel" TEXT,
    "municipalityCode" TEXT,
    "geometry" TEXT NOT NULL,
    "datasetSourceCode" TEXT NOT NULL,
    "datasetVersion" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoPolygon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildingAssociation" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "refKey" TEXT NOT NULL,
    "associationMethod" TEXT NOT NULL,
    "value" TEXT,
    "datasetSourceCode" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuildingAssociation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GeoPoint_datasetSourceCode_externalId_key" ON "GeoPoint"("datasetSourceCode", "externalId");

-- CreateIndex
CREATE INDEX "GeoPoint_category_municipalityCode_idx" ON "GeoPoint"("category", "municipalityCode");

-- CreateIndex
CREATE INDEX "GeoPoint_lat_lng_idx" ON "GeoPoint"("lat", "lng");

-- CreateIndex
CREATE INDEX "GeoPolygon_category_municipalityCode_idx" ON "GeoPolygon"("category", "municipalityCode");

-- CreateIndex
CREATE UNIQUE INDEX "BuildingAssociation_buildingId_category_refKey_key" ON "BuildingAssociation"("buildingId", "category", "refKey");

-- CreateIndex
CREATE INDEX "BuildingAssociation_buildingId_category_idx" ON "BuildingAssociation"("buildingId", "category");

-- AddForeignKey
ALTER TABLE "BuildingAssociation" ADD CONSTRAINT "BuildingAssociation_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
