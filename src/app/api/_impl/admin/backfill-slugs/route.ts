import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/security";
import { slugifyName } from "@/lib/slug";

/**
 * POST /api/admin/backfill-slugs — genera el slug PÚBLIC de los 947
 * municipios (v37, páginas SEO /lloguer/[slug]). Idempotente: recalcula y
 * actualiza solo los que cambian. Colisión (defensa): sufijo -{code}.
 * RENDIMIENTO: UNA sola sentencia UPDATE ... FROM jsonb_to_recordset
 * (mismo patrón que el seed municipal — nunca 947 UPDATEs en loop).
 */
export async function POST() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`backfill-slugs:${admin.id}`, 3, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const muns = await db.municipality.findMany({ select: { code: true, name: true } });

  // slug determinista + resolución de colisiones (defensa: nombre duplicado)
  const used = new Map<string, string>(); // slug -> code (primer lo gana)
  const rows: Array<{ code: string; slug: string }> = [];
  for (const m of muns) {
    let slug = slugifyName(m.name);
    if (!slug) slug = `municipi-${m.code.toLowerCase()}`;
    const owner = used.get(slug);
    if (owner && owner !== m.code) {
      slug = `${slug}-${m.code.toLowerCase()}`;
    }
    if (!used.has(slug)) used.set(slug, m.code);
    rows.push({ code: m.code, slug });
  }

  const payload = JSON.stringify(rows);
  // 1 sentencia: UPDATE ... FROM jsonb_to_recordset (patrón seed municipal)
  const updated = await db.$executeRawUnsafe(
    `UPDATE "Municipality" AS m SET slug = v.slug, "updatedAt" = NOW()
     FROM jsonb_to_recordset($1::jsonb) AS v(code text, slug text)
     WHERE m.code = v.code AND (m.slug IS DISTINCT FROM v.slug)`,
    payload
  );

  await audit(admin.id, "BACKFILL_SLUGS", null, { total: rows.length, updated }).catch(() => {});
  return NextResponse.json({
    ok: true,
    total: rows.length,
    updated,
    message: `Slugs generados: ${rows.length} municipios, ${updated} actualizados.`,
  });
}
