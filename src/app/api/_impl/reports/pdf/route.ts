import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Building, Municipality } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { planAllows } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/reports/pdf?mun=CODE | ?building=ID — informe PDF professional (Fase 13).
 *  - Premium: informe de municipi.
 *  - Pro: informe de municipi + informe d'edifici.
 * Identitat visual PreuReal.cat; cada dada cita font i període; limitacions
 * estadístiques i metodologia incloses. Mai s'inventa informació absent.
 */

const DARK = rgb(0.059, 0.18, 0.129);   // #0f2e21
const ACCENT = rgb(0.91, 0.4, 0.235);   // #e8673c
const GRAY = rgb(0.42, 0.45, 0.42);
const LIGHT = rgb(0.96, 0.95, 0.93);
const WHITE = rgb(1, 1, 1);

export async function GET(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rl = await rateLimit(`pdf:${user.id}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const url = new URL(req.url);
  const munCode = url.searchParams.get("mun");
  const buildingId = url.searchParams.get("building");
  const plan = (user.plan as "FREE" | "PREMIUM" | "PRO") || "FREE";

  if (!munCode && !buildingId) {
    return NextResponse.json({ error: "BAD_INPUT", message: "Cal ?mun= o ?building=" }, { status: 400 });
  }

  let mun: Municipality | null = null;
  let building: Building | null = null;
  if (munCode) {
    if (!(await planAllows(plan, "pdfMunicipi"))) {
      return NextResponse.json({ error: "PLAN_REQUIRED", plan: "PREMIUM" }, { status: 403 });
    }
    mun = await db.municipality.findUnique({ where: { code: munCode } });
    if (!mun) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  } else {
    if (!(await planAllows(plan, "pdfEdifici"))) {
      return NextResponse.json({ error: "PLAN_REQUIRED", plan: "PRO" }, { status: 403 });
    }
    building = await db.building.findUnique({ where: { id: buildingId! } });
    if (!building) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    if (building.municipalityCode) {
      mun = await db.municipality.findUnique({ where: { code: building.municipalityCode } });
    }
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]); // A4
  const W = 595;
  let y = 800;

  const text = (s: string, size = 10, color = rgb(0.09, 0.11, 0.09), b = false, x = 40) => {
    page.drawText(s, { x, y, size, font: b ? bold : font, color });
  };
  const line = (s: string, size = 10, color = rgb(0.09, 0.11, 0.09), b = false, x = 40, max = 515) => {
    // wrap simple
    const words = s.split(" ");
    let cur = "";
    for (const w of words) {
      if (font.widthOfTextAtSize(cur + " " + w, size) > max) {
        text(cur, size, color, b, x);
        y -= size + 4;
        cur = w;
      } else {
        cur = cur ? cur + " " + w : w;
      }
    }
    if (cur) {
      text(cur, size, color, b, x);
      y -= size + 4;
    }
  };

  // ---- capçalera de marca ----
  page.drawRectangle({ x: 0, y: 780, width: W, height: 62, color: DARK });
  page.drawText("PreuReal.cat", { x: 40, y: 806, size: 22, font: bold, color: WHITE });
  page.drawText(".cat", { x: 40 + bold.widthOfTextAtSize("PreuReal", 22), y: 806, size: 22, font: bold, color: ACCENT });
  page.drawText("Informe de dades de lloguer", { x: 40, y: 788, size: 10, font, color: rgb(0.79, 0.83, 0.8) });
  y = 750;

  // ---- títol ----
  if (mun) {
    text(mun.name, 20, DARK, true);
    y -= 6;
    line(`${mun.comarca || "—"} · ${mun.province || "—"} · Codi municipal ${mun.code}`, 10, GRAY);
  }
  if (building) {
    text(building.nom || building.refcat || "Edifici", 20, DARK, true);
    y -= 6;
    line(
      `${mun ? mun.name + " · " : ""}${building.refcat ? "Ref. catastral " + building.refcat : "Sense ref. catastral coneguda"} · Font geomètrica: ${building.source}`,
      10,
      GRAY
    );
  }
  y -= 8;

  // ---- dades de lloguer (municipal) ----
  if (mun) {
    page.drawRectangle({ x: 40, y: y - 66, width: W - 80, height: 78, color: LIGHT });
    text("Lloguer mitjà registrat oficialment (fiances Incasòl)", 9, GRAY);
    y -= 34;
    text(
      mun.rentLatest != null ? `${mun.rentLatest.toFixed(0)} €/mes` : "No disponible per aquest municipi",
      26,
      DARK,
      true
    );
    y -= 20;
    line(`Període: ${mun.rentPeriod || "—"} · Contractes de referència: ${mun.contractsLatest ?? "—"}`, 9, GRAY);
    y -= 14;
    if (mun.rentPrevYear != null && mun.rentLatest != null) {
      const delta = ((mun.rentLatest - mun.rentPrevYear) / mun.rentPrevYear) * 100;
      line(
        `Variació vs període anterior (${mun.rentPrevPeriod || "—"}): ${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`,
        10,
        delta > 0 ? ACCENT : DARK,
        true
      );
    }
  }

  // ---- dades a nivell edifici si n'hi ha (importació) ----
  if (building?.avgRentEurMonth != null) {
    y -= 26;
    text("Dada a nivell d'edifici/illa (importació pròpia)", 12, DARK, true);
    y -= 18;
    line(
      `Mitjana: ${building.avgRentEurMonth.toFixed(0)} €/mes · Mostres: ${building.sampleSize ?? "—"} · Font: Incasòl (importació)`,
      10
    );
  } else if (building) {
    y -= 26;
    line("Dada de lloguer a nivell d'edifici: no disponible. La xifra municipal és agregada i no descriu aquest edifici concret.", 9, GRAY);
  }

  // ---- zona tensionada ----
  if (mun) {
    y -= 26;
    text("Regulació: àrea de mercat residencial tensat", 12, DARK, true);
    y -= 16;
    line(
      mun.isTense
        ? `Aquest municipi ESTÀ declarat àrea de mercat residencial tensat (llista ${mun.tenseList === "A" ? "A — TER/3739/2026" : mun.tenseList === "C" || mun.tenseList === "B" ? "C — TER/3740/2026" : mun.tenseList || "—"}). Aplica l'índex de referència de lloguers.`
        : "Aquest municipi NO consta a les resolucions TER/3739/2026 ni TER/3740/2026 (DOGC 19-10-2026).",
      9
    );
  }

  // ---- històric (gràfic de barres) ----
  const hist = mun?.rentHistory ? Object.entries(JSON.parse(mun.rentHistory as string)) : [];
  if (hist.length > 1) {
    const histShow = hist.slice(-10);
    const maxVal = Math.max(...histShow.map(([, v]) => Number(v)), 1);
    y -= 150;
    text("Evolució del lloguer mitjà (font: Incasòl)", 12, DARK, true);
    y -= 8;
    const chartTop = y;
    const barW = (W - 120) / histShow.length;
    for (let i = 0; i < histShow.length; i++) {
      const [year, v] = histShow[i];
      const h = (Number(v) / maxVal) * 90;
      page.drawRectangle({
        x: 50 + i * barW,
        y: chartTop - h,
        width: barW - 6,
        height: h,
        color: DARK,
      });
      page.drawText(String(year).slice(2), { x: 50 + i * barW + (barW - 12) / 2, y: chartTop - h - 10, size: 7, font, color: GRAY });
      page.drawText(String(Math.round(Number(v))), { x: 50 + i * barW + 2, y: chartTop - h - 20, size: 6.5, font, color: GRAY });
    }
    y = chartTop - 108;
  }

  // ---- metodologia, fonts, limitacions ----
  y -= 12;
  text("Fonts i metodologia", 12, DARK, true);
  y -= 14;
  line("• Lloguer mitjà per municipi: fiances dipositades a Incasòl (Agència de l'Habitatge de Catalunya), via habitatge.gencat.cat. És una MITJANA MUNICIPAL: no descriu cap edifici concret.", 8.5);
  line("• Edificis i geometria: ICGC (RTT), llicència CC-BY 4.0. Referència catastral: ICGC/Cadastre.", 8.5);
  line("• Àrees tensades: Resolucions TER/3739/2026 i TER/3740/2026 del DOGC (19-10-2026).", 8.5);
  line("• Any de construcció: Cadastre (serveis lliures DNPPC), quan està disponible.", 8.5);
  y -= 6;
  text("Limitacions estadístiques", 12, DARK, true);
  y -= 14;
  line("• El preu mitjà municipal no reflecteix la variabilitat dins del municipi ni la qualitat de cada immoble.", 8.5);
  line(`• Mida de mostra municipal: ${mun?.contractsLatest ?? "—"} contractes amb fiança. Mostres petites impliquen més incertesa.`, 8.5);
  line("• Les dades declarades pels usuaris (crowdsourcing) NO es barregen amb les oficials en aquest informe.", 8.5);
  y -= 6;
  text("Legal", 12, DARK, true);
  y -= 14;
  line("Informe generat per PreuReal.cat amb dades oficials. Ús informatiu; no constitueix valoració immobiliària formal. Consulteu l'avís legal i la política de privacitat a preureal.cat.", 8.5, GRAY);

  // ---- peu ----
  page.drawRectangle({ x: 0, y: 0, width: W, height: 34, color: LIGHT });
  page.drawText(`Generat el ${new Date().toLocaleDateString("ca-ES")} · preureal.cat · Dades actualitzades: ${mun?.rentPeriod || "—"}`, {
    x: 40, y: 13, size: 8, font, color: GRAY,
  });

  const bytes = await pdf.save();
  await db.event
    .create({ data: { type: "PDF_DOWNLOADED", userId: user.id, meta: JSON.stringify({ mun: munCode, building: buildingId }) } })
    .catch(() => {});

  const fname = mun ? `preureal_informe_${mun.name.replace(/[^\p{L}\p{N}]+/gu, "_")}.pdf` : `preureal_informe_edifici_${building!.id.slice(-6)}.pdf`;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fname}"`,
    },
  });
}
