/**
 * v45 — vista prèvia LOCAL de l'informe PDF (no s'executa en producció).
 * Construeix l'informe amb un fixture complet (el mateix esperit que
 * tests/pdf_report.test.ts) i l'escriu a /tmp/preureal_informe_preview.pdf
 * per poder-lo inspeccionar visualment (pdftoppm / obrir-lo al navegador).
 *
 * Ús: DATABASE_URL no cal (el constructor és PURA): bun run scripts/preview-pdf.ts
 */
import { mkdirSync, writeFileSync } from "fs";
import { buildReportPdf, type ReportInput } from "../src/lib/pdf-report";

const base: ReportInput = {
  mun: {
    name: "Barcelona",
    comarca: "Barcelonès",
    province: "Barcelona",
    code: "080193",
    rentLatest: 1134.2,
    rentPeriod: "2026-T1",
    rentPrevYear: 1080,
    rentPrevPeriod: "2025-T4",
    contractsLatest: 25340,
    isTense: true,
    tenseList: "C",
    rentHistory: JSON.stringify({
      "2005": 600, "2007": 680, "2010": 720, "2014": 680,
      "2019": 850, "2021": 920, "2023": 1050, "2024": 1100, "2025": 1134,
    }),
  },
  building: null,
  ind: {
    band: { p25: 900, p50: 1050, p75: 1300, n: 42, totalWeight: 1800 },
    effortHogar: { pct: 21.14, rentEurMonth: 1134, rentPeriod: "2026-T1", rentaAnual: 45000, rentaPeriod: "2024" },
    rentaHogarLatest: { value: 45000, period: "2024" },
    ipvaCat: { latestAnual: { value: 2.9, period: "2026-08" }, acum2015: { value: 28.4 } },
  },
  demo: {
    poblacio: {
      actual: 1731649,
      any: "2025",
      serie: [
        { year: "2014", value: 1602386 }, { year: "2015", value: 1604555 },
        { year: "2016", value: 1608746 }, { year: "2017", value: 1620809 },
        { year: "2018", value: 1620343 }, { year: "2019", value: 1636762 },
        { year: "2020", value: 1664182 }, { year: "2021", value: 1636732 },
        { year: "2022", value: 1659987 }, { year: "2023", value: 1701763 },
        { year: "2024", value: 1708014 }, { year: "2025", value: 1731649 },
      ],
      var5Pct: 5.6,
      var10Pct: 8.1,
      homes: 819966,
      dones: 893281,
    },
    edats: {
      g0_14: 240155, g15_64: 1099571, g65_84: 302511, g85_mes: 68933,
      any: "2025", pct65: 21.5, pct0_14: 14.0,
    },
    llars: {
      total: 671177, totalAny: "2021", midaMitjana: 2.5, midaAny: "2021",
      distribucioPct: { g1: 31.0, g2: 30.6, g3: 18.9, g4: 13.3, g5: 6.2 },
    },
    estrangera: { valor: 437663, pct: 25.5, any: "2022", pctCat: 18.7 },
    territori: { superficieKm2: 101.35, densitat: 16904.3, densitatCat: 253.0 },
    comarca: { poblacioActual: 2398280, densitat: 16454.8, pct65: 20.2, comarca: "Barcelonès" },
    cat: { poblacioActual: 8124126, pct65: 19.7 },
    interpretacio: [
      "Creixement demogràfic positiu durant l'última dècada (+8.1% d'habitants, períodes 2015-2025).",
      "El 21.5% de la població té 65 anys o més, per sobre de la mitjana catalana (indicador: grans grups d'edat del padró).",
    ],
  },
  market: {
    contracts: {
      serie: [
        { year: "2019", value: 21400 }, { year: "2020", value: 19800 },
        { year: "2021", value: 22600 }, { year: "2022", value: 24100 },
        { year: "2023", value: 24900 }, { year: "2024", value: 25340 },
      ],
      latest: 25340,
      latestYear: "2024",
      g5Pct: 18.4,
      seriesFromImport: true,
    },
    volume: {
      serie: [
        { year: "2019", value: 285000000 }, { year: "2020", value: 268000000 },
        { year: "2021", value: 308000000 }, { year: "2022", value: 332000000 },
        { year: "2023", value: 341000000 }, { year: "2024", value: 345000000 },
      ],
    },
    census: { pct: 24.72, year: "2021", catalunyaPct: 17.31 },
    contractsPer1k: { value: 14.64, year: "2024" },
    interpretacio: [
      "El preu mitjà creix un +7,9% mentre el flux de contractes creix un +18,4% en 5 anys: el mercat registra més activitat i preus a l'alça (lectura descriptiva, sense causalitat).",
      "El volum de mercat aproximat arriba als ~345 M€ l'any 2024 (mediana × 12 × contractes).",
      "Contractes per cada 1.000 habitants: 14,64 l'any 2024 — dinamisme alt dins de l'àmbit metropolità.",
    ],
  },
  aids: [
    {
      title: "Bono alquiler joven (programa estatal)",
      amount: "250 €/mes, màx. 24 mesos",
      audience: "Joves de 18 a 35 anys amb ingressos < 3× IPREM",
      source: "Ministerio de Vivienda y Agenda Urbana (RD 42/2022)",
      url: "https://www.vivienda.gob.es/",
      reviewed: "2026-11-10",
    },
  ],
  subscriberMasked: "ma***@exemple.cat",
  planLabel: "Pro · agents",
  genDate: "16 de novembre de 2026",
};

const bytes = await buildReportPdf(base);
const out = process.env.PREVIEW_PDF_PATH || "/tmp/preureal_informe_preview.pdf";
try { mkdirSync("/tmp", { recursive: true }); } catch {}
writeFileSync(out, bytes);
console.log(`Preview generat: ${out} (${bytes.length} bytes)`);
