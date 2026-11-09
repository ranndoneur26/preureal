-- v24 — Resum mensual de preferits per correu (opt-in explícit de l'usuari).
-- Columna additiva amb valor per defecte: segura i instantània en PostgreSQL.
ALTER TABLE "User" ADD COLUMN "alertsEnabled" BOOLEAN NOT NULL DEFAULT false;
