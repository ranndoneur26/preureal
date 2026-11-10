import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import seedAids from "@/data/rental_aid_seed.json";

// Operación corta (4-5 filas): sin maxDuration especial.

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
 * Context: permet sembrar la taula des del panell #/admin sense necessitat
 * d'un .env local amb DATABASE_URL (plan B pensat per a operació des del
 * navegador).
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
  let created = 0;
  let updated = 0;
  try {
    for (const aid of seedAids.aids) {
      const code = String(aid.code);
      const data = { ...aid, lastReviewedAt: REVIEWED_AT, reviewedBy: "system", active: true };
      const existing = await db.rentalAid.findUnique({ where: { code } });
      if (existing) {
        await db.rentalAid.update({ where: { code }, data });
        updated++;
      } else {
        await db.rentalAid.create({ data: data as never });
        created++;
      }
    }
  } catch (e) {
    return NextResponse.json(
      { error: "SEED_FAIL", message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    created,
    updated,
    total: seedAids.aids.length,
    revisado: seedAids.revisado,
  });
}
