import { NextResponse } from "next/server";
import { effortEconomic, INDICATOR_META, round1 } from "@/lib/indicators";
import { getIndicatorsCoverage, getMuniIndicators } from "@/lib/indicators-data";

/**
 * GET /api/indicators/status — Fase 3: estat públic del servei d'indicadors.
 *
 * Probe de verificació post-desplegament (mateix patró que /api/ine/status):
 *  - canari de fórmules: l'exemple real de la proposta (792,7 €/mes i renda
 *    llar 45.000 €/any → ≈ 21,1 %) ha de donar exactament 21,14 %; si no,
 *    les fórmules estan trencades i la ruta respon 500.
 *  - cobertura de les fonts INE (comptes, municipis, última importació).
 *  - fum end-to-end amb un municipi real (Barcelona): dades OFICIALS
 *    agregades, mai cap dada d'usuari.
 */
export async function GET() {
  // 1) canari de fórmules (exemples exactes dels tests unitaris)
  const canary = {
    effortCornella: effortEconomic(792.7, 45000, { rentPeriod: "2025", rentaPeriod: "2024" })?.pct ?? null,
  };
  const canaryOk = canary.effortCornella === 21.14;
  if (!canaryOk) {
    return NextResponse.json(
      {
        status: "CANARY_FAIL",
        detail: "Les fórmules d'indicadors no coincideixen amb els valors esperats",
        canary,
      },
      { status: 500 },
    );
  }

  try {
    const [coverage, barcelona] = await Promise.all([
      getIndicatorsCoverage(),
      getMuniIndicators("080193"),
    ]);

    return NextResponse.json({
      status: "OK",
      indicators: Object.values(INDICATOR_META).map((m) => ({
        code: m.code,
        label: m.label,
        formula: m.formula,
      })),
      canary,
      cobertura: {
        fonts: coverage.fonts,
        perVariable: coverage.perVariable,
        rendaMunicipis: coverage.rendaMunicipis,
        ipvaMunicipis: coverage.ipvaMunicipis,
        municipisTotal: coverage.municipisTotal,
        ultimesImportacions: coverage.ultimesImportacions,
      },
      fumBarcelona: barcelona
        ? {
            muni: barcelona.muni.name,
            rendaLlarUltima: barcelona.renta.municipi.hogar?.latest ?? null,
            effortHogarPct: barcelona.effort.hogar?.pct ?? null,
            ipvaCatAcum: barcelona.ipva.catalunya?.acum2015 ?? null,
            ipvaCatAnual: barcelona.ipva.catalunya?.latestAnual ?? null,
            bandaDisponible: barcelona.band !== null,
            fonts: barcelona.fontsUsed,
          }
        : null,
      principis: [
        "Cap xifra sense font, unitat i període.",
        "L'IPVA és un índex d'evolució: mai es converteix a euros.",
        "L'esforç econòmic és un indicador territorial, no personal.",
        "Si una dada no està disponible, es mostra com a no disponible.",
      ],
      example: {
        formula: "(792,7 €/mes × 12) / 45.000 €/any × 100",
        resultat: `${round1(canary.effortCornella ?? 0)} %`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { status: "ERROR", error: String(e instanceof Error ? e.message : e).slice(0, 300), canary },
      { status: 500 },
    );
  }
}
