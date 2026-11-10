import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  importIneIpva,
  importIneAtlasRenta,
  IPVA_SCOPES,
  ATLAS_SCOPES,
} from "@/lib/ine-import";

// Límite de ejecución en Vercel (fluid compute). La tabla ADRH de Barcelona
// pesa ~35 MB: se puede lanzar por separado con scope "08" si hiciera falta.
export const maxDuration = 60;

/**
 * POST /api/admin/import-ine — Fase 2: importació de fonts oficials INE.
 *
 * Cuerpo JSON: { "source": "INE_IPVA" | "INE_ATLAS_RENTA", "scope": "..." }
 *  - INE_IPVA:       scope opcional NAC_CCAA | PROV | MUNI (per defecte tots)
 *  - INE_ATLAS_RENTA: scope opcional NACIONAL | 08 | 17 | 25 | 43 (o tots)
 *
 * Idempotent: reexecutar actualitza els valors revisats per l'INE. Només
 * escriu a StatObservation/DataSource/ImportRun/AuditLog — cap taula de
 * negoci ni de pagaments es toca.
 */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const rl = await rateLimit(`import-ine:${admin.id}`, 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const source = String(body?.source ?? "");
  const scope = body?.scope ? String(body.scope) : undefined;

  if (source === "INE_IPVA") {
    if (scope && !(IPVA_SCOPES as readonly string[]).includes(scope)) {
      return NextResponse.json(
        { error: "BAD_SCOPE", valid: IPVA_SCOPES },
        { status: 400 },
      );
    }
    const summary = await importIneIpva(scope as never, admin.id);
    return NextResponse.json(summary, { status: summary.ok ? 200 : 502 });
  }

  if (source === "INE_ATLAS_RENTA") {
    if (scope && !(ATLAS_SCOPES as readonly string[]).includes(scope)) {
      return NextResponse.json(
        { error: "BAD_SCOPE", valid: ATLAS_SCOPES },
        { status: 400 },
      );
    }
    const summary = await importIneAtlasRenta(scope as never, admin.id);
    return NextResponse.json(summary, { status: summary.ok ? 200 : 502 });
  }

  return NextResponse.json(
    { error: "BAD_SOURCE", valid: ["INE_IPVA", "INE_ATLAS_RENTA"] },
    { status: 400 },
  );
}
