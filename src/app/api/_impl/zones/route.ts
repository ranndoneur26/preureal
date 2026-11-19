import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";
import { db } from "@/lib/db";
import { getZonesByMuni, isZonesNotReady } from "@/lib/zones";
import { NORM_FACTS, ORIENTATION_DISCLAIMER, tensePublicacio } from "@/lib/analitza";

/**
 * GET /api/zones?muni=08019 — BUSCADOR INVERS (v67): zones (seccions censals)
 * d'un municipi ordenades de MAJOR a MENOR compliment de l'índex de referència.
 *
 * Ruta NOVA i aditiva: no altera cap endpoint, disseny ni flux existent.
 *
 * · Targeta d'estat: ZMRT ("Zona de Mercat Residencial Tensionat") segons les
 *   resolucions vigents (TER/2408/2024 2a tanda · TER/3739/2026 pròrroga +
 *   TER/3740/2026, DOGC 19-10-2026 i núm. 9196 de 3-7-2024 — 302 municipis,
 *   auditoria v69) — la mateixa font que Municipality.isTense i el mòdul normativa.
 * · Índex de referència: fiances Incasòl (via habitatge.gencat.cat) o
 *   referència de comarca marcada ESTIMACIÓ — la mateixa definició que
 *   /api/normativa/[code]; en €/m²·mes via la superfície mitjana del parc
 *   (Catastro), la conversió del propi pipeline F2.
 * · Compliment: % de contractes per sota o igual a l'índex. Mentre Incasòl no
 *   publiqui el fitxer seccional, nivell_dada=MUNICIPAL i el mètode és
 *   QUOTA_EDIFICIS_ESTIMADA (estimació marcada, mai presentada com a dada
 *   seccional oficial).
 * · Cobertura: pilot geoespacial (AMB). Municipis sense cobertura → 200 amb
 *   zones:[] + cobertura:"FORA_ABAST_PILOT" (mai dades inventades).
 *
 * RGPD: agregació mínima = secció censal (unitat estadística oficial). Mai
 * dades d'edifici/vivenda; la geometria mai surt al payload (només centroide).
 */
export async function GET(req: Request) {
  const ip = clientIp(req);
  const rl = await rateLimit(`zones:${ip}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const muni = (new URL(req.url).searchParams.get("muni") || "").trim();
  if (!/^\d{5,6}$/.test(muni)) {
    return NextResponse.json(
      { error: "BAD_MUNI", message: "muni ha de ser el codi INE de 5 o 6 dígits (p. ex. 08019 o 080193)" },
      { status: 400 },
    );
  }
  const muni5 = muni.slice(0, 5);
  const code6 = muni.length === 6 ? muni : null;

  const mun = code6
    ? await db.municipality.findUnique({ where: { code: code6 } })
    : await db.municipality.findFirst({ where: { ineCode: muni5 } });
  if (!mun) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  // Índex de referència oficial (€/mes) — mateixa lògica que /api/normativa/[code]
  const isMunicipal = mun.rentSource === "INCASOL" && mun.rentLatest != null;
  const referValue = isMunicipal ? mun.rentLatest : mun.comarcaRefLatest ?? null;
  const referPeriod = isMunicipal ? mun.rentPeriod : mun.comarcaRefPeriod ?? null;
  const referFont = isMunicipal
    ? "Fiances de lloguer (Incasòl) via habitatge.gencat.cat"
    : "Referència de comarca (Incasòl), marcada com a ESTIMACIÓ";

  try {
    const zones = await getZonesByMuni(muni5);
    const idxZona = zones.find((z) => z.indexReferenciaEurM2 != null) || null;
    return NextResponse.json(
      {
        ok: true,
        municipi: {
          code: mun.code,
          ineCode: mun.ineCode ?? muni5,
          name: mun.name,
          comarca: mun.comarca,
          provincia: mun.province,
        },
        zmrt: {
          tense: mun.isTense,
          // A = TER/3739/2026 (pròrroga 1a tanda) · B = TER/2408/2024 (2a tanda,
          // vigent sense canvis) · C = TER/3740/2026 (nous 2026)
          llista: mun.tenseList ?? null,
          font: NORM_FACTS.tenseSource,
          publicacio: tensePublicacio(mun.tenseList), // data DOGC de la llista del municipi
          resolucionsVigents: NORM_FACTS.tenseResolutions,
        },
        indexReferencia: {
          valorEurMes: referValue,
          period: referPeriod,
          municipal: isMunicipal,
          estimacio: !isMunicipal && referValue != null,
          font: referFont,
          eurM2: idxZona?.indexReferenciaEurM2 ?? null,
          eurM2Font: idxZona
            ? "mateix valor en €/m²·mes (÷ superfície mitjana del parc, Catastro)"
            : null,
        },
        anyReferencia: idxZona?.anyReferencia ?? null,
        cobertura: zones.length > 0 ? "PILOT_AMB" : "FORA_ABAST_PILOT",
        n_zones: zones.length,
        zones: zones.map((z) => ({
          idSeccio: z.idSeccio,
          nom: z.nom,
          preuRealMitjaEurM2: z.preuRealMitjaEurM2,
          indexReferenciaEurM2: z.indexReferenciaEurM2,
          complimentPct: z.complimentPct,
          nivellDada: z.nivellDada,
          complimentMetode: z.complimentMetode,
          estimacio: z.estimacio,
          nEdificis: z.nEdificis,
          numViviendas: z.numViviendas,
          lat: z.lat,
          lon: z.lon,
        })),
        nota_rgpd:
          "Dades agregades a nivell de secció censal (unitat estadística oficial): mai dades de contractes individuals ni d'edificis no anonimitzats (RGPD).",
        nota_estimacio:
          "Mentre Incasòl no publiqui el fitxer seccional, el preu i el compliment per secció són estimacions (àncla municipal + residu hedònic d'illa, metode QUOTA_EDIFICIS_ESTIMADA): sempre marcades com a ESTIMACIÓ.",
        disclaimer: ORIENTATION_DISCLAIMER,
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=86400" } },
    );
  } catch (e) {
    if (isZonesNotReady(e)) {
      return NextResponse.json(
        { error: "DATA_NOT_READY", message: "el buscador invers encara no s'ha carregat en aquesta BD" },
        { status: 503 },
      );
    }
    console.error("zones:", muni5, e);
    return NextResponse.json(
      { error: "ZONES_ERROR", detail: String(e instanceof Error ? e.message : e).slice(0, 200) },
      { status: 500 },
    );
  }
}
