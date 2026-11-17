"use client";

/**
 * PreuReal — KPI display compartit (v60).
 *
 * Encàrrec: jerarquia tipogràfica hiper-clara als panells de mètriques —
 * xifra principal en display numèric (font-black, tracking-tight,
 * tabular-nums perquè els dígits no dansin) i etiqueta secundària neutra en
 * majúscules petites contrastades. Un sol component per a AnalitzaReport,
 * EstimaReport, ValuationPanel i DemografiaPanel.
 */

export interface KpiCardProps {
  /** xifra principal (ja formatada amb el locale de la vista) */
  value: string;
  /** etiqueta secundària (lowercase normalitzat a uppercase per CSS) */
  label: string;
  /** to de la xifra: neutre (pine), alerta (ember) o èxit (verd) */
  tone?: "neutral" | "alert" | "good";
  /** mida display: sm (panells compactes) o lg (xifra protagonista) */
  size?: "sm" | "lg";
  /** contingut addicional sota la xifra (p. ex. període) */
  hint?: string;
  /** variació % formatejada (p. ex. "+4,2 %") amb xip semàntic */
  delta?: string | null;
  /** significat de la variació per al color del xip */
  deltaTone?: "up" | "down" | "flat";
}

const TONE_CLS: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  neutral: "text-pine",
  alert: "text-ember3",
  good: "text-green2",
};

const SIZE_CLS: Record<NonNullable<KpiCardProps["size"]>, string> = {
  sm: "text-lg md:text-xl",
  lg: "text-2xl md:text-3xl",
};

const DELTA_CLS: Record<NonNullable<KpiCardProps["deltaTone"]>, string> = {
  up: "bg-ambersoft2 text-ambertext",
  down: "bg-mintsoft text-green2",
  flat: "bg-sand text-stone",
};

export default function KpiCard({
  value,
  label,
  tone = "neutral",
  size = "sm",
  hint,
  delta,
  deltaTone = "flat",
}: KpiCardProps) {
  return (
    <div className="rounded-xl bg-cream border border-line py-3 px-2 text-center">
      <div
        className={`font-black leading-none tracking-tight tabular-nums ${SIZE_CLS[size]} ${TONE_CLS[tone]}`}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-stone mt-1">{label}</div>
      {hint && <div className="text-[10px] text-stone mt-0.5">{hint}</div>}
      {delta && (
        <div className="mt-1.5 flex justify-center">
          <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${DELTA_CLS[deltaTone]}`}>
            {delta}
          </span>
        </div>
      )}
    </div>
  );
}
