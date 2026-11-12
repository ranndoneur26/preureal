import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { planAllows } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/comparator/export — exportació CSV de la COMPARACIÓ (v37, pla PRO,
 * mateixa política que /api/export/[code]). Una fila per entitat i any:
 * els valors vigents + tota la sèrie històrica dels municipis comparats
 * (els edificis no tenen sèrie: surten només amb el valor vigent).
 * Dades 100% de la BD (mai del client) + defensa anti-CSV-injection.
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireVerifiedUser();
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`comparator-export:${user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const plan = (user.plan as "FREE" | "PREMIUM" | "PRO") || "FREE";
  if (!(await planAllows(plan, "exportCsv"))) {
    return NextResponse.json({ error: "PLAN_REQUIRED", plan: "PRO" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const raw = Array.isArray(body?.entities) ? body.entities.slice(0, 6) : [];
  if (raw.length < 2) {
    return NextResponse.json({ error: "BAD_INPUT", message: "Selecciona almenys 2 entitats." }, { status: 400 });
  }

  const munCodes = raw.filter((e: any) => e?.type !== "BUILDING").map((e: any) => String(e.code).slice(0, 10));
  const buildingIds = raw.filter((e: any) => e?.type === "BUILDING").map((e: any) => String(e.code).slice(0, 40));

  const muns = munCodes.length
    ? await db.municipality.findMany({
        where: { code: { in: munCodes } },
        select: { code: true, name: true, comarca: true, rentLatest: true, rentPeriod: true, rentHistory: true, contractsLatest: true, rentSource: true, isTense: true },
      })
    : [];
  const buildings = buildingIds.length
    ? await db.building.findMany({
        where: { id: { in: buildingIds } },
        select: { id: true, nom: true, refcat: true, yearBuilt: true, avgRentEurMonth: true, sampleSize: true, municipalityCode: true },
      })
    : [];

  /** defensa CSV injection: prefixa ' si el valor comença amb = + - @ */
  const safe = (v: unknown): string => {
    const s = String(v ?? "");
    return /^[=+\-@]/.test(s) ? `'${s}` : s;
  };

  const rows: string[][] = [["entitat", "tipus", "codi", "nom", "any", "lloguer_mitja_eur_mes", "contractes", "periode_vigent", "area_tensada", "font"]];

  for (const m of muns) {
    const base = ["MUNICIPI", m.code, m.name, m.comarca || ""];
    rows.push([
      ...base,
      "vigent",
      safe(m.rentLatest ?? ""),
      safe(m.contractsLatest ?? ""),
      safe(m.rentPeriod ?? ""),
      m.isTense ? "SI" : "NO",
      "Incasòl (fiances) via habitatge.gencat.cat",
    ]);
    let hist: Record<string, unknown> = {};
    if (m.rentHistory) {
      try {
        hist = JSON.parse(m.rentHistory);
      } catch {
        hist = {};
      }
    }
    if (hist && typeof hist === "object" && !Array.isArray(hist)) {
      for (const [year, value] of Object.entries(hist)) {
        rows.push([...base, safe(year), safe(value), "", "", m.isTense ? "SI" : "NO", "Incasòl (fiances) via habitatge.gencat.cat"]);
      }
    }
  }
  for (const b of buildings) {
    rows.push([
      "EDIFICI",
      b.id,
      safe(b.nom || b.refcat || `Edifici ${b.id.slice(-6)}`),
      b.municipalityCode || "",
      "vigent",
      safe(b.avgRentEurMonth ?? ""),
      safe(b.sampleSize ?? ""),
      "",
      "",
      "Incasòl (importació illa/edifici)",
    ]);
  }

  const csv = rows.map((r) => r.map((c) => safe(c)).join(";")).join("\n");
  await db.event
    .create({ data: { type: "EXPORT", userId: user.id, meta: JSON.stringify({ comparator: true, entities: raw.length }) } })
    .catch(() => {});

  const fname = raw.map((e: any) => String(e.code || "").slice(0, 8)).join("_").replace(/[^\p{L}\p{N}_-]+/gu, "") || "comparacio";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="preureal_comparacio_${fname}.csv"`,
    },
  });
}
