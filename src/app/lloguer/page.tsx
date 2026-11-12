import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";

/**
 * ÍNDICE PÚBLICO DE MUNICIPIOS (v37 — hub SEO).
 * Una página real con enlaces internos a las 947 páginas /lloguer/[slug]
 * (el crawler necesita enlaces entrantes, no solo el sitemap). Server
 * component sin JS de cliente, ISR 24 h. Si aún no hay slugs (backfill
 * pendiente), muestra aviso honesto y no enlaces rotos.
 */

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Lloguer mitjà per municipi — els 947 municipis de Catalunya | Preureal",
  description:
    "Preu mitjà real del lloguer (fiances Incasòl) de tots els municipis de Catalunya, amb sèrie històrica i àrees tensades. Barcelona, Girona, Lleida i Tarragona.",
  alternates: {
    canonical: "/lloguer",
    languages: { ca: "/lloguer", es: "/lloguer" },
  },
};

interface MuniRow {
  slug: string;
  name: string;
  province: string | null;
  rentLatest: number | null;
  isTense: boolean;
}

export default async function LloguerIndex() {
  let muns: MuniRow[] = [];
  try {
    const rows = await db.municipality.findMany({
      where: { slug: { not: null } },
      select: { slug: true, name: true, province: true, rentLatest: true, isTense: true },
      orderBy: { name: "asc" },
      take: 2000,
    });
    muns = rows.map((m) => ({ ...m, slug: m.slug as string }));
  } catch {
    muns = [];
  }
  const byProvince = new Map<string, MuniRow[]>();
  for (const m of muns) {
    const p = m.province || "Catalunya";
    if (!byProvince.has(p)) byProvince.set(p, []);
    byProvince.get(p)!.push(m);
  }
  const order = ["Barcelona", "Girona", "Lleida", "Tarragona"];

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-extrabold text-pine">
          Lloguer mitjà per municipi — els 947 municipis de Catalunya
        </h1>
        <p className="mt-3 text-sm text-moss max-w-2xl leading-relaxed">
          Preu mitjà mensual del lloguer <b>registrat oficialment</b> (fiances de lloguer de
          l&apos;Incasòl, explotació estadística de la Generalitat de Catalunya) per a cada
          municipi, amb la sèrie històrica completa i la declaració d&apos;àrees de mercat
          residencial tensat. Dades oficials agregades: mai xifres de boca a boca.
        </p>

        {muns.length === 0 && (
          <p className="mt-6 rounded-xl border border-amberline2 bg-ambersoft2 px-4 py-3 text-sm text-amberdark">
            Les pàgines per municipi s&apos;estan generant. Torna-ho a provar en una estona.
          </p>
        )}

        {order
          .filter((p) => byProvince.has(p))
          .concat([...byProvince.keys()].filter((p) => !order.includes(p)))
          .map((p) => (
            <section key={p} className="mt-8">
              <h2 className="font-bold text-lg text-pine border-b border-line pb-2">
                Província de {p}
              </h2>
              <div className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2 md:grid-cols-3">
                {(byProvince.get(p) || []).map((m) => (
                  <Link
                    key={m.slug}
                    href={`/lloguer/${m.slug}`}
                    className="text-sm text-pine hover:underline flex items-center justify-between gap-2"
                  >
                    <span>
                      {m.name}
                      {m.isTense && <span className="ml-1 text-ember3" title="Àrea tensada">●</span>}
                    </span>
                    <span className="text-xs text-stone">
                      {m.rentLatest != null ? `${m.rentLatest.toFixed(0)} €` : "—"}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}

        <p className="mt-10 text-xs text-stone leading-relaxed">
          Font: fiances de lloguer (Incasòl) via habitatge.gencat.cat · àrees de mercat residencial
          tensat segons les resolucions vigents del DOGC · cartografia ICGC. La informació és
          estadística i agregada: no és una valoració d&apos;un habitatge concret.
        </p>
      </div>
    </main>
  );
}
