"use client";

import type React from "react";

/**
 * PreuReal — esqueletos de càrrega compartits (v60).
 *
 * Encàrrec: transicions sense salts visuals. Els esqueletos imiten EXACTAMENT
 * la forma de les targetes KPI i dels gràfics (grid de targetes + bloc de
 * línies) perquè l'usuari sapiga on apareixerà cada dada. Usen el shimmer
 * `.pr-skeleton` que ja existia al design system (fins ara només el mapa).
 */

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`pr-skeleton ${className}`} style={style} aria-hidden="true" />;
}

/** Grid d'esqueletos que imita les targetes KPI (per defecte 4, com el full report). */
export function KpiGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 md:grid-cols-4 gap-2"
      role="status"
      aria-live="polite"
      aria-label="Carregant dades"
    >
      {Array.from({ length: Math.max(1, Math.min(8, count)) }).map((_, i) => (
        <div key={i} className="rounded-xl bg-cream border border-line py-3 px-2">
          <Skeleton className="h-6 w-3/4 mx-auto" />
          <Skeleton className="h-2.5 w-2/3 mx-auto mt-2" />
        </div>
      ))}
    </div>
  );
}

/** Esqueleto que imita un gràfic de línies/barrar (eix + sèrie + etiqueta). */
export function ChartSkeleton({ height = 190, bars = 6 }: { height?: number; bars?: number }) {
  const heights = [62, 40, 78, 55, 88, 47];
  return (
    <div
      className="rounded-xl bg-cream border border-line p-4"
      role="status"
      aria-live="polite"
      aria-label="Carregant gràfic"
    >
      <div className="flex items-end gap-2" style={{ height }}>
        {Array.from({ length: Math.max(2, Math.min(8, bars)) }).map((_, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end">
            <Skeleton className="w-full rounded-t-md" style={{ height: `${heights[i % heights.length]}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-2.5 flex-1" />
        ))}
      </div>
    </div>
  );
}

/** Esqueleto genèric de panell (per a fitxes del comparador i panells laterals). */
export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5 space-y-3" role="status" aria-live="polite" aria-label="Carregant">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: Math.max(1, Math.min(8, rows)) }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
        </div>
      ))}
    </div>
  );
}
