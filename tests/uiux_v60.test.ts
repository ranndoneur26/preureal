/**
 * v60 — Pas 3 «UI/UX»: paleta única de gráficos, tipografía display de las
 * métricas, esqueletos de carga y formularios en pasos progresivos.
 *
 *  U1 — chart-palette: única fuente de verdad, consumers sin colores inline.
 *  U2 — KpiCard: display numérico (font-black + tracking-tight + tabular-nums)
 *       y etiqueta neutra; aplicado a los informes.
 *  U3 — esqueletos: componente compartido + consumidores (sin «…» mudos).
 *  U4 — Stepper compartido: AnalitzaForm en 2 pasos SIN romper el contrato
 *       v48 (sin <select>, saneado del borrador, campos y gating intactos),
 *       EstimaForm con el mismo componente.
 *  U5 — guardas lingüísticas: cero «vivenda», cero raíz «estima» en los
 *       textos nuevos de UI.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const readSrc = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

describe("U1 — paleta única de visualización de datos", () => {
  const palette = readSrc("../src/lib/chart-palette.ts");
  const comparator = readSrc("../src/components/views/ComparadorView.tsx");
  const lineChart = readSrc("../src/components/charts/LineChart.tsx");
  const barChart = readSrc("../src/components/charts/BarChart.tsx");

  test("CHART_COLORS con los 6 colores de marca y rotación segura por índice", () => {
    expect(palette).toContain('["#e8673c", "#0f2e21", "#1e7a41", "#9a6a1a", "#5d5480", "#6b6f68"]');
    expect(palette).toContain("export function seriesColor");
    expect(palette).toContain("export function rentBandColor");
    expect(palette).toContain("export function rentBandGradient");
    expect(palette).toContain("export function deltaTone");
  });

  test("el comparador ya no lleva colores inline de serie ni escala de renta local", () => {
    expect(comparator).not.toContain('const palette = ["#e8673c"');
    expect(comparator).not.toContain("function rentBarColor");
    expect(comparator).toContain("const palette = CHART_COLORS;");
    expect(comparator).toContain("rentBandGradient");
    expect(comparator).toContain('from "@/lib/chart-palette"');
  });

  test("LineChart y BarChart usan los tokens neutros de la paleta (no hex inline)", () => {
    expect(lineChart).toContain("CHART_GRID");
    expect(lineChart).toContain("CHART_AXIS");
    expect(lineChart).toContain("CHART_PINE");
    expect(lineChart).not.toContain('stroke="#e5e1da"');
    expect(barChart).toContain("CHART_EMBER");
    expect(barChart).not.toContain('"linear-gradient(90deg,#e8673c,#d95a31)"');
  });

  test("Analisi, Demografia y MapView importan la paleta (cero hex de serie)", () => {
    const analisi = readSrc("../src/components/views/AnalisiView.tsx");
    expect(analisi).toContain('from "@/lib/chart-palette"');
    expect(analisi).not.toContain('color: "#e8673c"');
    const demo = readSrc("../src/components/views/DemografiaPanel.tsx");
    expect(demo).toContain("CHART_EMBER");
    expect(demo).not.toContain('color: "#0f2e21"');
    const map = readSrc("../src/components/views/MapView.tsx");
    expect(map).toContain("CHART_EMBER");
    expect(map).toContain("CHART_STONE");
  });
});

describe("U2 — KpiCard: jerarquía tipográfica de las métricas", () => {
  const kpi = readSrc("../src/components/ui/kpi.tsx");

  test("display numérico: font-black + tracking-tight + tabular-nums + etiqueta neutra", () => {
    expect(kpi).toContain("font-black");
    expect(kpi).toContain("tracking-tight");
    expect(kpi).toContain("tabular-nums");
    expect(kpi).toContain("text-[10px] uppercase tracking-wide");
  });

  test("aplicado a los informes (compact 3 + full 4 del AnalitzaReport)", () => {
    const report = readSrc("../src/components/analitza/AnalitzaReport.tsx");
    expect(report).toContain('import KpiCard from "@/components/ui/kpi"');
    expect(report).toContain("<KpiCard");
    // las etiquetas existentes se conservan (no hay regresión de contenido)
    expect(report).toContain("preu de l'anunci");
    expect(report).toContain("fiança municipal oficial");
  });

  test("cifras destacadas de Estima y Valoración con display numérico", () => {
    const estima = readSrc("../src/components/estima/EstimaReport.tsx");
    expect(estima).toContain("font-black tracking-tight tabular-nums text-pine");
    const valuation = readSrc("../src/components/views/ValuationPanel.tsx");
    expect(valuation).toContain("font-black tracking-tight tabular-nums text-pine");
    const demo = readSrc("../src/components/views/DemografiaPanel.tsx");
    expect(demo).toContain("tracking-tight tabular-nums");
  });
});

describe("U3 — esqueletos de carga que imitan las tarjetas", () => {
  const skeletons = readSrc("../src/components/ui/skeletons.tsx");

  test("componentes compartidos sobre el shimmer .pr-skeleton existente", () => {
    expect(skeletons).toContain("pr-skeleton");
    expect(skeletons).toContain("export function Skeleton");
    expect(skeletons).toContain("export function KpiGridSkeleton");
    expect(skeletons).toContain("export function ChartSkeleton");
    expect(skeletons).toContain("export function PanelSkeleton");
    expect(skeletons).toContain('role="status"');
    expect(skeletons).toContain('aria-live="polite"');
  });

  test("consumidores: sin estados mudos (texto plano o «…») durante la carga", () => {
    const rental = readSrc("../src/components/views/RentalSharePanel.tsx");
    expect(rental).toContain("<Skeleton");
    expect(rental).not.toContain("Carregant indicador…");
    const demo = readSrc("../src/components/views/DemografiaPanel.tsx");
    expect(demo).toContain("<PanelSkeleton");
    const entorn = readSrc("../src/components/views/EntornPanel.tsx");
    expect(entorn).toContain("<PanelSkeleton");
    const comparator = readSrc("../src/components/views/ComparadorView.tsx");
    expect(comparator).toContain("<PanelSkeleton");
    expect(comparator).not.toContain('>{busy && <p className="mt-4 text-sm text-stone">…</p>}');
    const analisi = readSrc("../src/components/views/AnalisiView.tsx");
    expect(analisi).toContain("<ChartSkeleton");
  });
});

describe("U4 — formularios en pasos progresivos (Stepper compartido)", () => {
  const stepper = readSrc("../src/components/forms/Stepper.tsx");
  const analitza = readSrc("../src/components/analitza/AnalitzaForm.tsx");
  const estima = readSrc("../src/components/estima/EstimaForm.tsx");

  test("StepperHeader compartido con aria-live y barras accesibles", () => {
    expect(stepper).toContain('aria-live="polite"');
    expect(stepper).toContain("Pas ${step} de ${total}");
    expect(stepper).toContain("bg-pine");
  });

  test("AnalitzaForm en 2 pasos: misma gramática que EstimaForm, botón de continuar type=button", () => {
    expect(analitza).toContain('import StepperHeader from "@/components/forms/Stepper"');
    expect(analitza).toContain('useState<1 | 2>(1)');
    expect(analitza).toContain("<StepperHeader");
    expect(analitza).toContain("Continua amb les dades de l'anunci");
    // continuar NUNCA envía el formulario (el envío real es el submit del paso 2)
    expect(analitza).toContain('type="button"');
    expect(analitza).toContain("Canvia");
  });

  test("el email sigue siendo la PRIMERA casella y el submit conserva su texto", () => {
    // el orden en el código fuente: EmailFirstField antes de StepperHeader y campos
    const emailIdx = analitza.indexOf("<EmailFirstField");
    const stepperIdx = analitza.indexOf("<StepperHeader");
    const muniIdx = analitza.indexOf('htmlFor="analitza-muni"');
    expect(emailIdx).toBeGreaterThan(-1);
    expect(stepperIdx).toBeGreaterThan(emailIdx);
    expect(muniIdx).toBeGreaterThan(stepperIdx);
    expect(analitza).toContain("Compara l'anunci amb la referència oficial");
    expect(analitza).toContain("Gratuït amb registre Free (3 consultes detallades al mes)");
  });

  test("CONTRATO v48 intacto: sin <select>/<option> y saneado del borrador", () => {
    expect(analitza).not.toContain("<select");
    expect(analitza).not.toContain("<option");
    expect(analitza).not.toContain('value="TEMPORADA"');
    expect(analitza).toContain('delete (filled as { contractType?: unknown }).contractType');
  });

  test("el mapa de la variante full SIEMPRE está en el DOM (Leaflet se acopla 1 vez)", () => {
    // el contenedor no puede quedar condicionado al paso: Leaflet lo busca por id
    const mapIdx = analitza.indexOf('id="analitza-map"');
    const step2Close = analitza.indexOf("el botó d'enviar només existeix al pas 2");
    expect(mapIdx).toBeGreaterThan(-1);
    expect(step2Close).toBeGreaterThan(mapIdx);
    expect(analitza).toContain("SEMPRE al DOM");
  });

  test("EstimaForm reutiliza el Stepper compartido (sin duplicar barras)", () => {
    expect(estima).toContain('import StepperHeader from "@/components/forms/Stepper"');
    expect(estima).toContain("<StepperHeader");
    // ya no hay barras locales duplicadas ni texto «Pas X de 2» separado
    expect(estima).not.toContain('className={`h-1.5 rounded-full flex-1 transition-colors');
    expect(estima).not.toContain("Pas 1 de 2 · Municipi");
    // y conserva su flujo propio (enter avanza, draft, N2)
    expect(estima).toContain('htmlFor="estima-muni"');
  });
});

describe("U5 — guardas lingüísticas sobre el UI nuevo", () => {
  /** código sin comentarios (mismo criterio que linguistica_v56): los nombres de
   *  ficheros en comentarios (p. ex. «EstimaReport») no son texto de UI */
  const codeOnly = (src: string) =>
    src
      .replace(/\{\/\*[\s\S]*?\*\//g, "") // comentarios JSX
      .replace(/\/\*[\s\S]*?\*\//g, "") // comentarios de bloque
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");

  test("cero «vivenda» y cero raíz «estima» en los ficheros de UI nuevos", () => {
    const files = [
      "../src/lib/chart-palette.ts",
      "../src/components/ui/kpi.tsx",
      "../src/components/ui/skeletons.tsx",
      "../src/components/forms/Stepper.tsx",
    ];
    for (const f of files) {
      const src = codeOnly(readSrc(f));
      expect(src).not.toContain("vivenda");
      expect(src).not.toContain("Estima");
      expect(src).not.toContain("estimació");
    }
  });

  test("los términos del diseño (habitatge/lloguer/valoració) se mantienen correctos", () => {
    const analitza = readSrc("../src/components/analitza/AnalitzaForm.tsx");
    expect(analitza).toContain("Adreça de l'habitatge");
    expect(analitza).not.toContain("vivenda");
  });
});
