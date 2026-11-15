import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSiteUrlOrigin } from "@/lib/site-url";
import { getRentalShareDetail } from "@/lib/rental-share";

/**
 * PÁGINA PÚBLICA DE MUNICIPIO (v37 — SEO técnico).
 * 947 municipios = 947 landing pages indexables con datos reales de fianzas
 * Incasòl. ISR: revalidación diaria (on-demand, sin prerender en build — la
 * BD no se toca hasta la primera petición). 100% server component, sin JS
 * de cliente: carga instantánea y perfecta para crawlers.
 */

export const revalidate = 86400;

interface Props {
  params: Promise<{ slug: string }>;
}

async function getMuni(slug: string) {
  const slugSafe = String(slug || "").slice(0, 90);
  const m = await db.municipality.findUnique({
    where: { slug: slugSafe },
    select: {
      code: true, name: true, comarca: true, province: true,
      lat: true, lng: true,
      rentLatest: true, rentPeriod: true, rentPrevYear: true, rentPrevPeriod: true,
      rentHistory: true, contractsLatest: true,
      comarcaRefLatest: true, comarcaRefPeriod: true, rentSource: true,
      isTense: true, tenseList: true,
      updatedAt: true,
    },
  });
  return m;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const m = await getMuni(slug).catch(() => null);
  if (!m) return { title: "Municipi no trobat | Preureal" };
  const price = m.rentLatest ?? m.comarcaRefLatest;
  const desc = m.rentLatest != null
    ? `Preu mitjà real del lloguer a ${m.name}: ${m.rentLatest.toFixed(0)} €/mes (${m.rentPeriod ?? "últim període oficial"}), dades oficials de fiances Incasòl. Sèrie històrica, àrees tensades i any de construcció dels edificis.`
    : `Preu del lloguer a ${m.name}: dades oficials de fiances Incasòl${m.comarcaRefLatest != null ? ` i referència de comarca (${m.comarcaRefLatest.toFixed(0)} €/mes)` : ""}. Sèrie històrica i mapa d'edificis reals.`;
  return {
    title: `Lloguer mitjà a ${m.name}${price != null ? ` — ${price.toFixed(0)} €/mes` : ""} | Preureal`,
    description: desc,
    alternates: {
      canonical: `/lloguer/${slug}`,
      languages: { ca: `/lloguer/${slug}`, es: `/lloguer/${slug}` },
    },
    openGraph: {
      title: `Lloguer mitjà a ${m.name} | Preureal`,
      description: desc,
      url: `/lloguer/${slug}`,
      siteName: "Preureal",
      type: "website",
      locale: "ca_ES",
      alternateLocale: "es_ES",
    },
  };
}

export default async function MunicipiPage({ params }: Props) {
  const { slug } = await params;
  const m = await getMuni(slug);
  if (!m) notFound();

  // v41 — indicador «% estimat de lloguer sobre el parc residencial» + cens + flux
  const rs = await getRentalShareDetail(m.code).catch(() => null);
  const fmtInt = (n: number) => n.toLocaleString("ca-ES", { maximumFractionDigits: 0 });
  const fmtPct = (n: number) => n.toLocaleString("ca-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // sèrie històrica (JSON defensiu — mateixa política que el PDF i l'export)
  let hist: Record<string, unknown> = {};
  if (m.rentHistory) {
    try {
      hist = JSON.parse(m.rentHistory);
    } catch {
      hist = {};
    }
  }
  if (!hist || typeof hist !== "object" || Array.isArray(hist)) hist = {};
  const serie = Object.entries(hist)
    .filter(([, v]) => Number.isFinite(Number(v)) && Number(v) > 0)
    .map(([k, v]) => [k, Number(v)] as [string, number])
    .sort((a, b) => Number(a[0]) - Number(b[0]));
  const latestYear = serie.length ? serie[serie.length - 1][0] : null;
  const prev = serie.length >= 2 ? serie[serie.length - 2] : null;
  const trendPct =
    m.rentLatest != null && m.rentPrevYear
      ? ((m.rentLatest - m.rentPrevYear) / m.rentPrevYear) * 100
      : null;
  const price = m.rentLatest ?? m.comarcaRefLatest;
  const base = getSiteUrlOrigin();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Place",
        name: m.name,
        containedInPlace: {
          "@type": "AdministrativeArea",
          name: m.province || "Catalunya",
        },
        geo: { "@type": "GeoCoordinates", latitude: m.lat, longitude: m.lng },
      },
      {
        "@type": "Offer",
        name: `Lloguer mitjà registrat a ${m.name}`,
        price: price != null ? price.toFixed(2) : undefined,
        priceCurrency: "EUR",
        description:
          m.rentLatest != null
            ? `Mitjana mensual de les fiances de lloguer registrades (Incasòl), període ${m.rentPeriod ?? ""}.`
            : "Sense dada municipal vigent; referència de comarca disponible.",
        url: `${base}/lloguer/${slug}`,
      },
      {
        "@type": "Dataset",
        name: "Fiances de lloguer (Incasòl) — explotació estadística de la Generalitat",
        license: "https://web.gencat.cat",
        creator: { "@type": "Organization", name: "Incasòl / Generalitat de Catalunya" },
      },
    ],
  };

  return (
    <main className="min-h-screen bg-cream">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-3xl mx-auto px-4 py-12">
        <nav className="text-xs text-stone mb-6" aria-label="Migues de pa">
          <a href="/" className="hover:underline">Inici</a>
          <span className="mx-1">·</span>
          {m.province || "Catalunya"}
          <span className="mx-1">·</span>
          <span className="text-pine font-semibold">{m.name}</span>
        </nav>

        <h1 className="text-3xl font-extrabold text-pine">
          Lloguer mitjà a {m.name}
          {price != null && (
            <span className="block mt-1 text-4xl text-ember">
              {price.toFixed(0)} €/mes
            </span>
          )}
        </h1>
        <p className="mt-2 text-sm text-moss">
          {m.rentLatest != null ? (
            <>
              Preu mitjà mensual del lloguer <b>registrat oficialment</b> (fiances Incasòl)
              {" "}{m.rentPeriod ? `— període ${m.rentPeriod}` : ""}. {m.contractsLatest != null ? `${m.contractsLatest} contractes amb fiança dipositada.` : ""}
            </>
          ) : (
            <>
              Sense dada municipal vigent en aquest període
              {m.comarcaRefLatest != null ? (
                <> — el valor mostrat és la <b>referència de comarca</b> ({m.comarcaRefPeriod ?? ""}), marcada sempre com a estimació.</>
              ) : (
                <> per aquest municipi.</>
              )}
            </>
          )}
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="px-3 py-1 rounded-full bg-card border border-line text-moss">
            {m.comarca || "Comarca —"} · {m.province || "—"}
          </span>
          {m.isTense && (
            <span className="px-3 py-1 rounded-full bg-embersoft2 border border-amberline2 text-ember3 font-bold">
              Àrea de mercat residencial tensat{m.tenseList ? ` (llista ${m.tenseList})` : ""}
            </span>
          )}
          {trendPct != null && (
            <span className="px-3 py-1 rounded-full bg-card border border-line text-moss">
              {trendPct > 0 ? "▲" : "▼"} {Math.abs(trendPct).toFixed(1)}% vs any anterior
            </span>
          )}
        </div>

        {serie.length > 0 && (
          <section className="mt-8 bg-card rounded-2xl border border-line p-6">
            <h2 className="font-bold text-pine mb-3">Sèrie històrica del lloguer mitjà</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone border-b border-sand">
                  <th className="py-2">Període</th>
                  <th className="py-2 text-right">€/mes</th>
                </tr>
              </thead>
              <tbody>
                {[...serie].reverse().map(([y, v]) => (
                  <tr key={y} className={y === latestYear ? "font-bold text-pine" : "text-moss"}>
                    <td className="py-1.5 border-b border-sand2">{y}{y === latestYear ? " (vigent)" : ""}</td>
                    <td className="py-1.5 border-b border-sand2 text-right">{v.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {prev && m.rentLatest != null && (
              <p className="mt-3 text-xs text-stone">
                Variació del període vigent respecte de {prev[0]}: {trendPct != null ? `${trendPct > 0 ? "+" : ""}${trendPct.toFixed(1)}%` : "sense dada comparable"}.
              </p>
            )}
          </section>
        )}

        {/* v41 — PARC D'HABITATGES I MERCAT DEL LLOGUER */}
        <section className="mt-6 bg-card rounded-2xl border border-line p-6" id="parc-lloguer">
          <h2 className="font-bold text-pine text-lg">Parc d&apos;habitatges i mercat del lloguer</h2>

          {/* Bloc 1 — % estimat de lloguer sobre el parc residencial (compost) */}
          {rs?.current?.rentalPercentage != null ? (
            <div className="mt-4 rounded-xl border border-sand bg-sand/50 p-4">
              <div className="text-[10px] font-semibold text-stone uppercase tracking-wide">
                % estimat de lloguer sobre el parc residencial
              </div>
              <div className="text-3xl font-black text-ember leading-tight">
                {fmtPct(rs.current.rentalPercentage)}%
              </div>
              <div className="mt-1 text-xs text-moss">
                Fiances vigents: <b className="text-pine">{rs.current.incasolActiveDeposits != null ? fmtInt(rs.current.incasolActiveDeposits) : "—"}</b>
                {" "}· Parc residencial: <b className="text-pine">{rs.current.residentialProperties != null ? fmtInt(rs.current.residentialProperties) : "—"}</b>
                {rs.current.incasolPeriod ? ` · Numerador: ${rs.current.incasolPeriod}` : ""}
                {rs.current.cadastreYear ? ` · Denominador: ${rs.current.cadastreYear}` : ""}
              </div>
              {rs.current.dataStatus === "TIMING_MISMATCH" && (
                <div className="mt-2 text-[11px] text-ember3">
                  Desfasament temporal entre fonts: valor indicatiu, no definitiu.
                </div>
              )}
              {rs.current.warnings.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {rs.current.warnings.map((w, i) => (
                    <li key={i} className="text-[11px] text-stone">• {w}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-sand bg-sand/50 p-4 text-xs text-moss leading-relaxed">
              <div className="text-[10px] font-semibold text-stone uppercase tracking-wide mb-1">
                % estimat de lloguer sobre el parc residencial
              </div>
              <b className="text-pine">Sense informació suficient</b> per calcular-lo a {m.name}: el numerador
              (fiances <b>vigents</b> del Registre de fiances d&apos;Incasòl) i el denominador (immobles
              d&apos;ús residencial del Cadastre) no tenen publicació oficial municipal oberta (verificat el
              15/11/2026). Quan la font oficial publiqui les dades, l&apos;indicador s&apos;actualitzarà
              automàticament — mai s&apos;inventen valors ni es substitueix el stock pel flux anual de
              contractes. Fórmula: (fiances vigents / parc residencial) × 100.
            </div>
          )}

          {/* Bloc 2 — referència censal oficial (Cens 2021) */}
          {rs?.current?.censusRentalPercentage != null && (
            <div className="mt-3 rounded-xl border border-line p-4">
              <div className="text-[10px] font-semibold text-stone uppercase tracking-wide">
                Referència censal oficial — Cens de població i habitatges {rs.current.censusYear ?? "2021"}
              </div>
              <div className="mt-0.5 text-sm text-moss">
                <b className="text-pine">{fmtPct(rs.current.censusRentalPercentage)}%</b> de les{" "}
                <b className="text-pine">vivendes principals</b> estan en lloguer
                {rs.current.censusMainRental != null && rs.current.censusMainTotal != null
                  ? ` (${fmtInt(rs.current.censusMainRental)} de ${fmtInt(rs.current.censusMainTotal)})`
                  : ""}
                {rs.catalunyaCensus?.pct != null ? ` · Catalunya ${fmtPct(rs.catalunyaCensus.pct)}%` : ""}
              </div>
              <div className="mt-1 text-[11px] text-stone">
                Dada estructural oficial (Idescat a partir del Cens de l&apos;INE; valors arrodonits a múltiples de 3).
                El parc catastral no distingeix vivendes principals, secundàries i buides: no és comparable directament.
              </div>
            </div>
          )}

          {/* Bloc 3 — flux anual de fiances (referència de mercat, mai stock) */}
          {rs && rs.flujoSerie.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-bold text-pine mb-1">
                Contractes amb fiança dipositada per any (flux)
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-stone border-b border-sand">
                    <th className="py-2">Any</th>
                    <th className="py-2 text-right">Contractes</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rs.flujoSerie].slice(-8).reverse().map((f) => (
                    <tr key={f.year} className="text-moss">
                      <td className="py-1.5 border-b border-sand2">{f.year}</td>
                      <td className="py-1.5 border-b border-sand2 text-right">{fmtInt(f.contractes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-stone leading-relaxed">
                És el <b>flux anual</b> d&apos;operacions registrades al Registre de fiances d&apos;Incasòl
                (altes de l&apos;any): mesura l&apos;activitat del mercat, no el nombre de vivendes llogades
                ni l'estoc de fiances vigents.
              </p>
            </div>
          )}

          <p className="mt-4 text-[11px] text-stone leading-relaxed">
            Fonts: Incasòl (Registre de fiances, via Dades Obertes), Idescat (Cens de població i habitatges 2021),
            Cadastre (pendent de publicació municipal verificada). Percentatges: elaboració pròpia a partir de
            components oficials. {" "}
            <Link href="/metodologia" className="underline">Metodologia i limitacions</Link>.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-line bg-pine text-white p-6">
          <h2 className="font-bold text-lg">Consulta el mapa d&apos;edificis reals</h2>
          <p className="mt-1 text-sm opacity-90">
            Anys de construcció (Cadastre), edificis de l&apos;ICGC i el preu mitjà d&apos;illa, sobre el mapa interactiu de {m.name}.
          </p>
          <a
            href={`/#/mapa?mun=${encodeURIComponent(m.code)}`}
            className="mt-3 inline-block px-5 py-2.5 rounded-xl bg-ember text-white text-sm font-bold hover:bg-ember2"
          >
            Obrir {m.name} al mapa
          </a>
        </section>

        <p className="mt-8 text-xs text-stone leading-relaxed">
          Dades oficials agregades: fiances de lloguer (Incasòl, explotació estadística de la Generalitat de Catalunya).
          La informació és estadística i no constitueix una valoració d&apos;un habitatge concret ni assessorament jurídic.
          Última actualització: {m.updatedAt.toLocaleDateString("ca-ES")}.
          {" "}
          <Link href="/" className="underline">Preureal — el preu real del lloguer, illa a illa.</Link>
        </p>
      </div>
    </main>
  );
}
