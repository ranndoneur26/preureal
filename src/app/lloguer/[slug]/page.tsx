import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getSiteUrlOrigin } from "@/lib/site-url";

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
