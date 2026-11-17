"use client";

/**
 * PreuReal — indicador de passos compartit per als formularis (v60).
 *
 * Encàrrec: formularis llargs en passos progressius amb indicador visual clar,
 * idèntic a l'EstimaForm (barres + «Pas X de N») — ara compartit amb
 * AnalitzaForm perquè tots dos tinguin la mateixa gramàtica visual i el
 * mateix etiquetatge accessible (aria-live).
 */
export default function StepperHeader({
  step,
  total,
  label,
}: {
  step: number;
  total: number;
  /** descripció del pas actual (p. ex. «Ubicació») */
  label: string;
}) {
  return (
    <>
      <div className="flex items-center gap-2 mb-1" aria-hidden="true">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full flex-1 transition-colors ${step >= i + 1 ? "bg-pine" : "bg-line"}`}
          />
        ))}
      </div>
      <p className="text-[11px] font-semibold text-stone" aria-live="polite">
        {`Pas ${step} de ${total} · ${label}`}
      </p>
    </>
  );
}
