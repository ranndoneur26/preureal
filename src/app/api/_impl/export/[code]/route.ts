import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { planAllows } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { buildXlsx, XLSX_MIME, type XlsxCell } from "@/lib/xlsx";

/**
 * GET /api/export/[code] — exportación CSV o XLSX (plan PRO, verificat a la BD).
 * Datos reales de lloguer (fiances Incasòl) del municipio solicitado.
 * v60 — `?format=xlsx` retorna un llibre Excel estructurat (mateixes dades,
 * mateix gating PRO; per defecte segueix sent CSV: zero regressió).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  let user;
  try {
    user = await requireVerifiedUser(); // P1.3 + pla FRESC de la BD (E7 de l'auditoria)
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`export:${user.id}`, 20, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const plan = (user.plan as "FREE" | "PREMIUM" | "PRO") || "FREE";
  if (!(await planAllows(plan, "exportCsv"))) {
    return NextResponse.json({ error: "PLAN_REQUIRED", plan: "PRO" }, { status: 403 });
  }

  const { code } = await params;
  const format = new URL(req.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const mun = await db.municipality.findUnique({ where: { code } });
  if (!mun) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Fix 2026-11-11 — JSON.parse defensiu: un rentHistory corrupte no pot trencar
  // l'exportació (abans seria un 500); amb dada dolenta es exporta la capçalera.
  let hist: Record<string, unknown> = {};
  if (mun.rentHistory) {
    try {
      hist = JSON.parse(mun.rentHistory);
    } catch {
      hist = {};
    }
  }
  if (!hist || typeof hist !== "object" || Array.isArray(hist)) hist = {};
  const rows: XlsxCell[][] = [["any", "lloguer_mitja_eur_mes", "contractes", "font"]];
  const num = (v: unknown): number | string => {
    const n = Number(v);
    return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : String(v ?? "");
  };
  for (const [year, value] of Object.entries(hist)) {
    // defensa CSV injection: prefixem ' si el valor comença amb = + - @
    const safeYear = /^[=+\-@]/.test(year) ? `'${year}` : year;
    rows.push([
      /^\d{4}$/.test(year) ? Number(year) : safeYear,
      num(value),
      mun.contractsLatest != null ? mun.contractsLatest : "",
      "Incasòl (fiances) via habitatge.gencat.cat",
    ]);
  }

  const fname = mun.name.replace(/[^\p{L}\p{N}]+/gu, "_");
  await db.event
    .create({ data: { type: "EXPORT", userId: user.id, meta: JSON.stringify({ mun: code, format }) } })
    .catch(() => {});

  if (format === "xlsx") {
    const file = buildXlsx([{ name: mun.name.slice(0, 31), rows }]);
    return new NextResponse(file as unknown as BodyInit, {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="preureal_${fname}_lloguer.xlsx"`,
      },
    });
  }

  const csv = rows.map((r) => r.map((c) => (typeof c === "string" ? c : String(c ?? ""))).join(";")).join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="preureal_${fname}_lloguer.csv"`,
    },
  });
}
