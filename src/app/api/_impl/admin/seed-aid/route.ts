import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import seedAids from "@/data/rental_aid_seed.json";

/**
 * POST /api/admin/seed-aid — Fase 4: sincronitza el catàleg editorial d'ajudes
 * al lloguer (taula RentalAid) amb el fitxer empaquetat
 * src/data/rental_aid_seed.json — la mateixa font de veritat que el seed local
 * (`npx tsx scripts/seed_rental_aid.ts`) i que el fallback de /api/aid.
 *
 * Idempotent (upsert per code): reexecutar actualitza el text i conserva la
 * fila; les convocatòries caduquen i es reobren cada any. NOMÉS escriu a
 * RentalAid — cap taula de negoci ni de pagaments es toca.
 *
 * RENDIMENT (fix 2026-11-11): el bucle per fila feia 2 queries × 9 ajuts
 * (~9-18 s amb la latència real de la BD) — mateix risc de timeout serverless
 * que el seed municipal («botó penjat»). Ara: 1 SELECT de codis existents +
 * 1 upsert SQL únic (INSERT … ON CONFLICT DO UPDATE des de json_to_recordset):
 * 2 ides i tornades en total, <1 s.
 *
 * NOTA id: `id String @id @default(cuid())` és un default del CLIENT Prisma,
 * no de la BD: un INSERT SQL cru l'ompliria amb NULL. Cada fila nova porta el
 * seu id (randomUUID) al JSON. createdAt/updatedAt = NOW() explícit pel
 * mateix motiu (@default(now()) i @updatedAt són de client).
 */
export async function POST() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const rl = await rateLimit(`seed-aid:${admin.id}`, 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const REVIEWED_AT = new Date(`${seedAids.revisado}T00:00:00.000Z`);
  const reviewedIso = REVIEWED_AT.toISOString();

  // Mapping → JSON: NOMÉS camps existents al model RentalAid.
  const json = JSON.stringify(
    seedAids.aids.map((a) => ({
      id: randomUUID(),
      code: String(a.code),
      title: a.title,
      titleEs: a.titleEs ?? null,
      description: a.description,
      descriptionEs: a.descriptionEs ?? null,
      scope: a.scope,
      scopeCode: a.scopeCode ?? null,
      amount: a.amount ?? null,
      audience: a.audience ?? null,
      audienceEs: a.audienceEs ?? null,
      status: a.status ?? "VIGENTE",
      url: a.url,
      source: a.source,
      lastReviewedAt: reviewedIso,
    })),
  );

  try {
    const codes = seedAids.aids.map((a) => String(a.code));
    const existing = await db.rentalAid.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });
    const created = seedAids.aids.length - existing.length;
    const updated = existing.length;

    const synced = await db.$executeRaw`
INSERT INTO "RentalAid" (
  "id", "code", "title", "titleEs", "description", "descriptionEs",
  "scope", "scopeCode", "amount", "audience", "audienceEs",
  "status", "url", "source", "lastReviewedAt", "reviewedBy", "active",
  "createdAt", "updatedAt")
SELECT
  x."id", x."code", x."title", x."titleEs", x."description", x."descriptionEs",
  x."scope", x."scopeCode", x."amount", x."audience", x."audienceEs",
  x."status", x."url", x."source", x."lastReviewedAt"::timestamp, 'system', true,
  NOW(), NOW()
FROM json_to_recordset(${json}::json) AS x(
  "id" text, "code" text, "title" text, "titleEs" text, "description" text, "descriptionEs" text,
  "scope" text, "scopeCode" text, "amount" text, "audience" text, "audienceEs" text,
  "status" text, "url" text, "source" text, "lastReviewedAt" text)
ON CONFLICT ("code") DO UPDATE SET
  "title" = EXCLUDED."title",
  "titleEs" = EXCLUDED."titleEs",
  "description" = EXCLUDED."description",
  "descriptionEs" = EXCLUDED."descriptionEs",
  "scope" = EXCLUDED."scope",
  "scopeCode" = EXCLUDED."scopeCode",
  "amount" = EXCLUDED."amount",
  "audience" = EXCLUDED."audience",
  "audienceEs" = EXCLUDED."audienceEs",
  "status" = EXCLUDED."status",
  "url" = EXCLUDED."url",
  "source" = EXCLUDED."source",
  "lastReviewedAt" = EXCLUDED."lastReviewedAt",
  "reviewedBy" = 'system',
  "active" = true,
  "updatedAt" = NOW()`;

    return NextResponse.json({
      ok: true,
      created,
      updated,
      total: seedAids.aids.length,
      revisado: seedAids.revisado,
      synced,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "SEED_FAIL", message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
