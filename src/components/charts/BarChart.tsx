"use client";

/**
 * PreuReal.cat — Noves funcionalitats (F2): gràfic de barres horitzontals
 * comparatiu (estil Tinsa adaptat a la identitat PreuReal).
 *
 * CSS pur (0 dependències, responsive per disseny): cada fila = àmbit
 * territorial amb barra proporcional, valor €/mes i el seu període. El
 * municipi de l'usuari va destacat. Només mostra àmbits AMB dada real;
 * els que no la tenen el caller els marca com a «no disponible».
 */

export interface BarRow {
  label: string;
  value: number;
  /** Període de la dada ("2025") — visible per garantir comparabilitat. */
  period?: string | null;
  /** Barra destacada (el municipi de l'usuari). */
  highlight?: boolean;
  /** Text petit sota l'etiqueta (p. ex. n=21 municipis). */
  sub?: string | null;
}

interface Props {
  rows: BarRow[];
  locale: "ca" | "es";
}

export default function BarChart({ rows, locale }: Props) {
  const usable = rows.filter((r) => Number.isFinite(r.value) && r.value > 0);
  if (usable.length === 0) return null;
  const max = Math.max(...usable.map((r) => r.value));
  const fmt = (v: number): string => v.toLocaleString(locale === "es" ? "es-ES" : "ca-ES");

  return (
    <div className="space-y-2">
      {usable.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <div className="w-[92px] shrink-0">
            <div className={`text-[11px] leading-tight truncate ${r.highlight ? "font-bold text-[#0f2e21]" : "text-[#4b5349]"}`} title={r.label}>
              {r.label}
            </div>
            {r.sub && <div className="text-[9px] text-[#6b6f68] leading-tight">{r.sub}</div>}
          </div>
          <div className="relative flex-1 h-5 rounded-md bg-[#f0ede8] overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 rounded-md transition-all"
              style={{
                width: `${Math.max(3, (r.value / max) * 100)}%`,
                background: r.highlight ? "linear-gradient(90deg,#e8673c,#d95a31)" : "#0f2e21",
                opacity: r.highlight ? 1 : 0.82,
              }}
            />
            <div className={`absolute inset-y-0 right-2 flex items-center text-[10px] font-bold ${r.value / max > 0.75 ? "text-white drop-shadow" : "text-[#0f2e21]"}`}>
              {fmt(r.value)} €/mes{r.period ? <span className="ml-1 font-normal opacity-80">· {r.period}</span> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
