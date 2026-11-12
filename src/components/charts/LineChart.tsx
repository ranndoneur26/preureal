"use client";

/**
 * Preureal — Noves funcionalitats (F1): gràfic de línies interactiu.
 *
 * SVG pur (0 dependències): identitat visual exacta, responsive (viewBox),
 * hover amb guia vertical i tooltip. Només dibuixa punts REALS (mai
 * interpola forats: la línia connecta punts existents i el tooltip només
 * mostra anys amb dada). Unitat sempre €/mes per habitatge.
 */

import { useMemo, useRef, useState } from "react";

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  /** Punts ordenats per any (només anys amb dada real). */
  points: Array<{ x: string; y: number }>;
  dashed?: boolean;
}

interface Props {
  series: LineSeries[];
  height?: number;
  locale: "ca" | "es";
  unitLabel?: string;
}

const W = 640;
const M = { l: 46, r: 14, t: 12, b: 26 };

export default function LineChart({ series, height = 190, locale, unitLabel = "€/mes" }: Props) {
  const H = height;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverYear, setHoverYear] = useState<string | null>(null);

  const model = useMemo(() => {
    const usable = series.filter((s) => s.points.length >= 1);
    if (usable.length === 0) return null;
    const years: string[] = [];
    for (const s of usable) for (const p of s.points) if (!years.includes(p.x)) years.push(p.x);
    years.sort((a, b) => a.localeCompare(b));
    const nums = years.map(Number).filter((n) => Number.isFinite(n));
    if (nums.length === 0) return null;
    const yMinRaw = Math.min(...nums);
    const yMaxRaw = Math.max(...nums);
    const vals = usable.flatMap((s) => s.points.map((p) => p.y)).filter((v) => Number.isFinite(v) && v > 0);
    if (vals.length === 0) return null;
    let vMin = Math.min(...vals);
    let vMax = Math.max(...vals);
    const padV = (vMax - vMin) * 0.12 || vMax * 0.1 || 50;
    vMin = Math.max(0, vMin - padV);
    vMax = vMax + padV;
    const x = (year: string): number => {
      const n = Number(year);
      if (!Number.isFinite(n) || yMaxRaw === yMinRaw) return M.l + (W - M.l - M.r) / 2;
      return M.l + ((n - yMinRaw) / (yMaxRaw - yMinRaw)) * (W - M.l - M.r);
    };
    const y = (v: number): number => H - M.b - ((v - vMin) / (vMax - vMin)) * (H - M.t - M.b);
    // 4 línies de graella
    const ticks = [0, 1 / 3, 2 / 3, 1].map((f) => Math.round(vMin + f * (vMax - vMin)));
    // etiquetes x: màxim 8
    const step = Math.max(1, Math.ceil(years.length / 8));
    const xTicks = years.filter((_, i) => i % step === 0 || i === years.length - 1);
    return { usable, years, x, y, ticks, xTicks, vMin, vMax };
  }, [series, H]);

  if (!model) return null;
  const { usable, years, x, y, ticks, xTicks } = model;

  const fmt = (v: number): string => v.toLocaleString(locale === "es" ? "es-ES" : "ca-ES");

  const onMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    // any més proper a la posició del cursor
    let best: string | null = null;
    let bestD = Infinity;
    for (const yr of years) {
      const d = Math.abs(x(yr) - px);
      if (d < bestD) {
        bestD = d;
        best = yr;
      }
    }
    setHoverYear(bestD <= 40 ? best : null);
  };

  const hoverRows = hoverYear
    ? usable
        .map((s) => ({ label: s.label, color: s.color, v: s.points.find((p) => p.x === hoverYear)?.y ?? null }))
        .filter((r) => r.v !== null)
    : [];

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHoverYear(null)}
        role="img"
        aria-label={locale === "ca" ? "Gràfic d'evolució del lloguer" : "Gráfico de evolución del alquiler"}
      >
        {/* graelles + etiquetes y */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="#e5e1da" strokeWidth={1} />
            <text x={M.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize={9.5} fill="#6b6f68">
              {fmt(t)}
            </text>
          </g>
        ))}
        {/* etiquetes x */}
        {xTicks.map((yr) => (
          <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" fontSize={9.5} fill="#6b6f68">
            {yr}
          </text>
        ))}
        {/* guia vertical del hover */}
        {hoverYear && (
          <line x1={x(hoverYear)} x2={x(hoverYear)} y1={M.t} y2={H - M.b} stroke="#0f2e21" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
        )}
        {/* línies */}
        {usable.map((s) => {
          const pts = [...s.points].sort((a, b) => a.x.localeCompare(b.x));
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
          return (
            <g key={s.id}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2.2} strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" opacity={s.dashed ? 0.85 : 1} />
              {pts.map((p) => (
                <circle
                  key={p.x}
                  cx={x(p.x)}
                  cy={y(p.y)}
                  r={hoverYear === p.x ? 4 : 2.4}
                  fill={hoverYear === p.x ? s.color : "#fff"}
                  stroke={s.color}
                  strokeWidth={1.8}
                />
              ))}
            </g>
          );
        })}
      </svg>

      {/* tooltip */}
      {hoverYear && hoverRows.length > 0 && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line bg-card/95 px-2.5 py-1.5 shadow-md"
          style={{
            left: `${(x(hoverYear) / W) * 100}%`,
            top: 4,
            transform: `translateX(${x(hoverYear) / W > 0.6 ? "-105%" : "5%"})`,
            minWidth: 118,
          }}
        >
          <div className="text-[10px] font-bold text-pine">{hoverYear}</div>
          {hoverRows.map((r) => (
            <div key={r.label} className="flex items-center gap-1.5 text-[10.5px] text-moss whitespace-nowrap">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: r.color }} />
              <span className="truncate max-w-[120px]">{r.label}</span>
              <b className="ml-auto text-pine">{r.v !== null ? `${fmt(r.v)} ${unitLabel}` : "—"}</b>
            </div>
          ))}
        </div>
      )}

      {/* llegenda */}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {usable.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5 text-[10px] text-stone">
            <span
              className="inline-block rounded"
              style={
                s.dashed
                  ? { width: 16, height: 0, borderTop: `2px dashed ${s.color}` }
                  : { width: 16, height: 3, background: s.color }
              }
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
