import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logEvent } from "@/lib/analytics";

/**
 * GET /api/export/[code] — exportación CSV (plan PRO).
 * Datos reales de lloguer (fiances Incasòl) del municipio solicitado.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  if (session.plan !== "PRO") {
    return NextResponse.json({ error: "PLAN_REQUIRED", plan: "PRO" }, { status: 403 });
  }
  const { code } = await params;
  const mun = await db.municipality.findUnique({ where: { code } });
  if (!mun) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const hist = mun.rentHistory ? JSON.parse(mun.rentHistory) : {};
  const rows = [["any", "lloguer_mitja_eur_mes", "font"]];
  for (const [year, value] of Object.entries(hist)) {
    rows.push([year, String(value), "Incasòl (fiances) via habitatge.gencat.cat"]);
  }

  const csv = rows.map((r) => r.join(";")).join("\n");
  await logEvent("EXPORT", session.userId, { mun: code });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="preureal_${mun.name.replace(/\s+/g, "_")}_lloguer.csv"`,
    },
  });
}
