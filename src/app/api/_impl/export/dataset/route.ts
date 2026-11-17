import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { planAllows } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { cached } from "@/lib/cache";
import { buildXlsx, XLSX_MIME, type XlsxCell } from "@/lib/xlsx";

/**
 * GET /api/export/dataset — v60: exportació MASSIVA del dataset municipal
 * (pla PRO, mateixa política que /api/export/[code]) filtrable per comarca,
 * província o municipi concret, en CSV (per defecte) o XLSX estructurat.
 *
 * Query:
 *  - comarca=<nom>   filtra per comarca (p. ex. "Bages")
 *  - province=<nom>  filtra per província (p. ex. "Barcelona")
 *  - muni=<code>     un sol municipi (6 dígits)
 *  - format=xlsx     llibre Excel (si falta: CSV)
 * Sense filtres → tota Catalunya. Dades 100% de la BD (mai del client), una
 * fila per municipi i any (vigent + històric), defensa anti-CSV-injection.
 */
export async function GET(req: Request) {
  let user;
  try {
    user = await requireVerifiedUser();
  } catch (e) {
    if (isEmailNotVerifiedError(e)) {
      return NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 });
    }
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`export-dataset:${user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const plan = (user.plan as "FREE" | "PREMIUM" | "PRO") || "FREE";
  if (!(await planAllows(plan, "exportCsv"))) {
    return NextResponse.json({ error: "PLAN_REQUIRED", plan: "PRO" }, { status: 403 });
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const comarca = (url.searchParams.get("comarca") || "").slice(0, 60).trim();
  const province = (url.searchParams.get("province") || "").slice(0, 60).trim();
  const muni = (url.searchParams.get("muni") || "").slice(0, 10).trim();
  if (comarca && province) {
    return NextResponse.json(
      { error: "BAD_INPUT", message: "Filtra per comarca O província, no ambdues." },
      { status: 400 },
    );
  }

  // les dades oficials no canvien entre ingestes: cau de 10 min per filtre
  // (una sola query serveix totes les exportacions concurrents amb el mateix filtre)
  const muns = await cached(
    `export-dataset:${muni || "-"}:${comarca || "-"}:${province || "-"}`,
    10 * 60_000,
    async () =>
      db.municipality.findMany({
        where: {
          ...(muni ? { code: muni } : {}),
          ...(comarca ? { comarca } : {}),
          ...(province ? { province } : {}),
        },
        select: {
          code: true,
          name: true,
          comarca: true,
          province: true,
          rentLatest: true,
          rentPeriod: true,
          rentHistory: true,
          contractsLatest: true,
          rentSource: true,
          isTense: true,
        },
        orderBy: { name: "asc" },
      }),
  );
  if (muns.length === 0) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  /** defensa CSV injection: prefixa ' si el valor comença amb = + - @ */
  const safe = (v: unknown): string => {
    const s = String(v ?? "");
    return /^[=+\-@]/.test(s) ? `'${s}` : s;
  };
  const num = (v: unknown): XlsxCell => {
    if (v == null || v === "") return "";
    const n = Number(v);
    return Number.isFinite(n) && String(v).trim() !== "" ? n : String(v);
  };

  const rows: XlsxCell[][] = [
    ["codi", "municipi", "comarca", "provincia", "any", "lloguer_mitja_eur_mes", "periode_vigent", "contractes_vigents", "area_tensada", "font"],
  ];
  for (const m of muns) {
    const base: XlsxCell[] = [m.code, m.name, m.comarca || "", m.province || ""];
    rows.push([
      ...base,
      "vigent",
      num(m.rentLatest),
      safe(m.rentPeriod ?? ""),
      num(m.contractsLatest ?? ""),
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
        rows.push([
          ...base,
          /^[=+\-@]/.test(year) ? `'${year}` : year,
          num(value),
          "",
          "",
          m.isTense ? "SI" : "NO",
          "Incasòl (fiances) via habitatge.gencat.cat",
        ]);
      }
    }
  }

  await db.event
    .create({
      data: {
        type: "EXPORT",
        userId: user.id,
        meta: JSON.stringify({ dataset: true, format, comarca: comarca || null, province: province || null, muni: muni || null, munis: muns.length }),
      },
    })
    .catch(() => {});

  const scopeTag = muni || comarca || province || "catalunya";
  const fname = String(scopeTag).replace(/[^\p{L}\p{N}_-]+/gu, "_");

  if (format === "xlsx") {
    const file = buildXlsx([{ name: "Dataset municipal", rows }]);
    return new NextResponse(file as unknown as BodyInit, {
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": `attachment; filename="preureal_dataset_${fname}.xlsx"`,
      },
    });
  }

  const csv = rows.map((r) => r.map((c) => safe(c)).join(";")).join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="preureal_dataset_${fname}.csv"`,
    },
  });
}
