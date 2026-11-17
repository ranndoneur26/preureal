/**
 * F1 — Informe descargable de «Consulta el preu real registrat»: generador
 * PUR d'un HTML autocontingut (CSS incrustat, imprimible a PDF des de
 * qualsevol navegador, també mòbil). Sense dependències ni DOM: testejable.
 *
 * Llengües: català (per defecte) i castellà. Totes les cadenes del glossari
 * estan aquí centrades per garantir la qualitat del català (auditoria v43-v44).
 */

import type { ValuationResult } from "./territorial";
import type { NormCheck, Poi, PriceVerdict } from "./analitza";
import { ORIENTATION_DISCLAIMER, SERPAVI_URL } from "./analitza";

// ── Tipus de l'informe (forma exacta de POST /api/analitza) ──────────────────

export interface AnalitzaReportData {
  ok: boolean;
  generatedAt: string;
  input: {
    municipalityCode: string;
    municipalityName: string;
    comarca: string | null;
    province: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    priceEurMonth: number;
    surfaceM2: number | null;
    rooms: number | null;
    contractType: string;
    builtYear: number | null;
    previousRent: number | null;
    notes: string | null;
  };
  price: {
    eurM2: number | null;
    reference: number | null;
    referenceIsEstimate: boolean;
    referenceSource: string | null;
    referencePeriod: string | null;
    referenceContracts: number | null;
    referenceScope: string | null;
    deltaVsReferencePct: number | null;
    deltaVsExpectedPct: number | null;
    verdict: PriceVerdict;
    expected: ValuationResult | null;
    evolution: Array<{ year: string; value: number }>;
    interannual: Array<{ year: string; pct: number }>;
    currentPeriod: string | null;
    neighbours: Array<{
      code: string; name: string; distanceKm: number;
      rentLatest: number | null; rentPeriod: string | null; rentSource: string | null; contractsLatest: number | null;
    }>;
  };
  normative: {
    tense: boolean;
    appliesRentLimits: boolean;
    checks: NormCheck[];
    consultedAt: string;
    tenseList: string | null;
    resolutions: string[];
    serpaviUrl: string;
    irav: { pct: number; period: string; source: string };
    sources: Array<{ t: string; u: string }>;
  };
  serveisPoint: { lat: number; lng: number; scope: "VIVENDA" | "CENTRE_MUNICIPI" };
  checklist: Array<{ id: string; source: string | null }>;
  sources: Array<{ t: string; u: string; d: string }>;
  limitations: string[];
}

export interface ServeisPayload {
  ok: boolean;
  cached?: boolean;
  items?: Poi[];
  source?: string;
  distancesNote?: string;
  message?: string;
}

// ── Glossari bilingüe ────────────────────────────────────────────────────────

export type Locale2 = "ca" | "es";

export const NORM_CHECK_LABELS: Record<string, { ca: string; es: string }> = {
  "ZONA_TENSADA|MUNI_TENSAT": {
    ca: "Municipi en zona de mercat residencial tensat (Resolucions TER/3739/2026 i TER/3740/2026, DOGC 19-10-2026): els límits de renda del nou contracte d'habitatge habitual apliquen.",
    es: "Municipio en zona de mercado residencial tensionado (Resoluciones TER/3739/2026 y TER/3740/2026, DOGC 19-10-2026): aplican los límites de renta del nuevo contrato de vivienda habitual.",
  },
  "ZONA_TENSADA|MUNI_NO_TENSAT": {
    ca: "Municipi fora de les zones tensades vigents: sense límits de renda de nous contractes de la Llei 12/2023.",
    es: "Municipio fuera de las zonas tensionadas vigentes: sin límites de renta de nuevos contratos de la Ley 12/2023.",
  },
  "LIMIT_RENTA_ART172|TEMPORADA_FORA_LIMIT": {
    ca: "Contracte de temporada (ús diferent d'habitatge habitual, LAU art. 3): fora dels límits de renda de l'art. 17.2; les altres regles del contracte apliquen igualment.",
    es: "Contrato de temporada (uso distinto de vivienda habitual, LAU art. 3): fuera de los límites de renta del art. 17.2; las demás reglas del contrato aplican igualmente.",
  },
  "LIMIT_RENTA_ART172|HABITACIO_FORA_LIMIT": {
    ca: "Lloguer d'habitació: fora dels límits de renda de l'art. 17.2; comprova sempre la cèdula d'habitabilitat i les regles de convivència del contracte.",
    es: "Alquiler de habitación: fuera de los límites de renta del art. 17.2; comprueba siempre la cédula de habitabilidad y las reglas de convivencia del contrato.",
  },
  "LIMIT_RENTA_ART172|NO_TENSAT_LLIURE": {
    ca: "Municipi no tensat: la renda d'un contracte nou es pot acordar lliurement (l'actualització anual segueix limitada per l'IRAV).",
    es: "Municipio no tensionado: la renta de un contrato nuevo se puede acordar libremente (la actualización anual sigue limitada por el IRAV).",
  },
  "LIMIT_RENTA_ART172|FALTA_RENTA_ANTERIOR": {
    ca: "Requereix comprovacions addicionals: cal saber si hi ha hagut contracte d'habitatge en els 5 anys anteriors i amb quina renda. En zona tensada, la renda nova no pot superar la darrera renda (excepcions tipificades amb màxim +10 %).",
    es: "Requiere comprobaciones adicionales: hace falta saber si ha habido contrato de vivienda en los 5 años anteriores y con qué renta. En zona tensionada, la renta nueva no puede superar la última renta (excepciones tipificadas con máximo +10 %).",
  },
  "LIMIT_RENTA_ART172|SUPERIOR_ANTERIOR": {
    ca: "Possible incompliment: revisar. La renda introduïda supera la del contracte anterior i el municipi és zona tensada: la renda nova no pot superar la darrera renda dels 5 anys anteriors (les excepcions —rehabilitació, eficiència energètica, accessibilitat o llarga durada— permeten màxim +10 %). Comprova-ho amb la calculadora oficial.",
    es: "Posible incumplimiento: revisar. La renta introducida supera la del contrato anterior y el municipio es zona tensionada: la renta nueva no puede superar la última renta de los 5 años anteriores (las excepciones —rehabilitación, eficiencia energética, accesibilidad o larga duración— permiten máximo +10 %). Compruébalo con la calculadora oficial.",
  },
  "LIMIT_RENTA_ART172|NO_SUPERIOR_ANTERIOR": {
    ca: "Compatible amb les dades consultades: la renda introduïda no supera la del contracte anterior (mantén l'evidència: contracte anterior amb les seves clàusules d'actualització).",
    es: "Compatible con los datos consultados: la renta introducida no supera la del contrato anterior (conserva la evidencia: contrato anterior con sus cláusulas de actualización).",
  },
  "GRAN_TENEDOR_SERPAVI|CONSULTA_SERPAVI": {
    ca: "Requereix comprovacions addicionals: si l'arrendador és gran tenedor (10+ vivendes, o 5+ dins la mateixa zona tensada — LAU art. 2), la renda no pot superar l'índex de referència estatal per parcel·la (SERPAVI, obligatori des del 8-10-2026). Consulta la calculadora oficial del MIVAU amb la referència catastral.",
    es: "Requiere comprobaciones adicionales: si el arrendador es gran tenedor (10+ viviendas, o 5+ dentro de la misma zona tensionada — LAU art. 2), la renta no puede superar el índice de referencia estatal por parcela (SERPAVI, obligatorio desde el 8-10-2026). Consulta la calculadora oficial del MIVAU con la referencia catastral.",
  },
  "GRAN_TENEDOR_SERPAVI|NO_APLICA_SERPAVI": {
    ca: "El límit del sistema estatal (SERPAVI) per a grans tenedores no aplica a aquesta combinació de municipi i tipus de contracte.",
    es: "El límite del sistema estatal (SERPAVI) para grandes tenedores no aplica a esta combinación de municipio y tipo de contrato.",
  },
  "ACTUALITZACIO_IRAV|IRAV_VIGENT": {
    ca: "Actualització anual de la renda durant el contracte: màxim IRAV (índex oficial de l'INE; últim valor +2,54 %, setembre 2026). Contractes signats després del 26-5-2023.",
    es: "Actualización anual de la renta durante el contrato: máximo IRAV (índice oficial del INE; último valor +2,54 %, septiembre 2026). Contratos firmados tras el 26-5-2023.",
  },
};

export const CHECKLIST_LABELS: Record<string, { ca: string; es: string }> = {
  IDENTITAT: { ca: "Identitat de l'arrendador o del representant (DNI/NIF coincident amb el titular)", es: "Identidad del arrendador o del representante (DNI/NIF coincidente con el titular)" },
  MODALITAT_DURADA: { ca: "Modalitat (habitatge habitual / temporada) i durada del contracte i de les pròrrogues", es: "Modalidad (vivienda habitual / temporada) y duración del contrato y de las prórrogas" },
  PREU_REGLES: { ca: "Preu, actualitzacions anuals i regles aplicables (zona tensada, índex de referència)", es: "Precio, actualizaciones anuales y reglas aplicables (zona tensionada, índice de referencia)" },
  FIANZA_GARANTIES: { ca: "Fiança (1 mes, dipòsit a Incasòl) i garanties addicionals (màxim 2 mesos)", es: "Fianza (1 mes, depósito en Incasòl) y garantías adicionales (máximo 2 meses)" },
  DESPESES_SUMINISTRES: { ca: "Despeses, suministres i qui els paga (contracte detallat, sense abusos)", es: "Gastos, suministros y quién los paga (contrato detallado, sin abusos)" },
  CEDULA_HABITABILITAT: { ca: "Cèdula d'habitabilitat vigent (Decret 141/2012)", es: "Cédula de habitabilidad vigente (Decreto 141/2012)" },
  CERTIFICAT_ENERGETIC: { ca: "Certificat energètic (RD 390/2021) amb la qualitat indicada", es: "Certificado energético (RD 390/2021) con la calidad indicada" },
  CONSERVACIO_DES_PERFECTES: { ca: "Estat de conservació i inventari de desperfectes amb fotos abans de signar", es: "Estado de conservación e inventario de desperfectos con fotos antes de firmar" },
  AMIANT: { ca: "Certificat de presència o absència d'amiant (obligatori a Catalunya des del 3-10-2026)", es: "Certificado de presencia o ausencia de amianto (obligatorio en Cataluña desde el 3-10-2026)" },
};

export const CATEGORY_LABELS: Record<string, { ca: string; es: string }> = {
  TRANSPORT: { ca: "Transport públic", es: "Transporte público" },
  SALUT: { ca: "Salut i sanitari", es: "Salud y sanitario" },
  EDUCACIO: { ca: "Educació", es: "Educación" },
  COMPRA: { ca: "Compra de proximitat", es: "Compra de proximidad" },
  VERD: { ca: "Zones verdes i jocs infantils", es: "Zonas verdes y juegos infantiles" },
};

export const CONTRACT_LABELS: Record<string, { ca: string; es: string }> = {
  HABITATGE: { ca: "Habitatge habitual", es: "Vivienda habitual" },
  TEMPORADA: { ca: "Temporada", es: "Temporada" },
  HABITACIO: { ca: "Habitació", es: "Habitación" },
};

export const STATE_LABELS: Record<string, { ca: string; es: string }> = {
  OK: { ca: "Compatible amb les dades consultades", es: "Compatible con los datos consultados" },
  PENDING: { ca: "Requereix comprovacions addicionals", es: "Requiere comprobaciones adicionales" },
  ALERT: { ca: "Possible incompliment: revisar", es: "Posible incumplimiento: revisar" },
  INFO: { ca: "Informació aplicable", es: "Información aplicable" },
  NA: { ca: "No aplica", es: "No aplica" },
};

export const VERDICT_LABELS: Record<string, { ca: string; es: string }> = {
  VERY_BELOW: { ca: "Molt per sota de la referència oficial", es: "Muy por debajo de la referencia oficial" },
  BELOW: { ca: "Per sota de la referència oficial", es: "Por debajo de la referencia oficial" },
  IN_RANGE: { ca: "Dins de la referència oficial", es: "Dentro de la referencia oficial" },
  ABOVE: { ca: "Per sobre de la referència oficial", es: "Por encima de la referencia oficial" },
  VERY_ABOVE: { ca: "Molt per sobre de la referència oficial", es: "Muy por encima de la referencia oficial" },
};

/** Nota per als veredictes extrems (≤ −25 % / > +15 %): sempre explicada. */
export function verdictNote(verdict: PriceVerdict, locale: Locale2): string | null {
  if (verdict === "VERY_BELOW") {
    return locale === "ca"
      ? "Un preu molt per sota de la referència també cal llegir-lo amb compte: pot ser un anunci esbiaixat (sense despeses, superfície menor de la real) o un habitatge amb problemes d'habitabilitat. Comprova-ho tot abans de signar."
      : "Un precio muy por debajo de la referencia también hay que leerlo con cuidado: puede ser un anuncio sesgado (sin gastos, superficie menor de la real) o una vivienda con problemas de habitabilidad. Compruébalo todo antes de firmar.";
  }
  if (verdict === "VERY_ABOVE") {
    return locale === "ca"
      ? "La diferència és gran respecte al que es registra oficialment al municipi: pot respondre a característiques diferents de l'habitatge típic (reformada, més gran, millor ubicació) — o a un preu justificat només parcialment. Usa la banda d'ajust per característiques i pregunta el motiu."
      : "La diferencia es grande respecto a lo que se registra oficialmente en el municipio: puede responder a características distintas de la vivienda típica (reformada, más grande, mejor ubicación) — o a un precio justificado solo parcialmente. Usa la banda de ajuste por características y pregunta el motivo.";
  }
  return null;
}

// ── Generador de l'HTML autocontingut ────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function pct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1).replace(".", ",")} %`;
}

function eur(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString(localeTag())} €`;
}

let LOCALE_FOR_NUM = "ca-ES";
function localeTag(): string {
  return LOCALE_FOR_NUM;
}

const CSS = `
 body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1f2937;margin:0;padding:28px 30px;font-size:13px;line-height:1.5}
 h1{font-size:21px;margin:0 0 4px} h2{font-size:15px;margin:22px 0 8px;border-bottom:2px solid #e7e5e4;padding-bottom:4px}
 .sub{color:#6b7280;font-size:12px}
 table{width:100%;border-collapse:collapse;margin:6px 0}
 td,th{border:1px solid #e7e5e4;padding:5px 8px;text-align:left;vertical-align:top;font-size:12px}
 th{background:#f5f5f4;font-weight:700}
 .kpi{display:inline-block;border:1px solid #e7e5e4;border-radius:8px;padding:8px 12px;margin:4px 6px 4px 0;background:#fafaf9}
 .kpi b{display:block;font-size:16px}
 .ok{color:#166534;font-weight:700} .pending{color:#92400e;font-weight:700} .alert{color:#991b1b;font-weight:700} .na{color:#6b7280}
 .small{font-size:11px;color:#6b7280}
 ul{margin:6px 0;padding-left:18px} li{margin:2px 0}
 .check td:first-child{width:26px;text-align:center;font-weight:700}
 @page{margin:14mm}
`;

/**
 * HTML complet de l'informe. `serveis` pot venir no disponible (ok:false) —
 * es mostra la nota sense cap dada inventada.
 */
export function buildReportHtml(
  data: AnalitzaReportData,
  serveis: ServeisPayload | null,
  locale: Locale2,
  checked: Record<string, boolean> = {},
): string {
  const ca = locale === "ca";
  LOCALE_FOR_NUM = ca ? "ca-ES" : "es-ES";
  const L = (obj: { ca: string; es: string }) => (ca ? obj.ca : obj.es);
  const i = data.input;
  const p = data.price;
  const gen = new Date(data.generatedAt);
  const genStr = gen.toLocaleDateString(LOCALE_FOR_NUM, { day: "2-digit", month: "long", year: "numeric" });

  const contractLabel = L(CONTRACT_LABELS[i.contractType] ?? CONTRACT_LABELS.HABITATGE);

  // Dades introduïdes
  const rowsInput = [
    [ca ? "Municipi" : "Municipio", `${i.municipalityName} (${i.comarca ?? "—"}, ${i.province ?? "—"})`],
    [ca ? "Adreça" : "Dirección", i.address ?? (ca ? "no indicada" : "no indicada")],
    [ca ? "Punt" : "Punto", i.lat != null && i.lng != null ? `${i.lat.toFixed(5)}, ${i.lng.toFixed(5)}` : "—"],
    [ca ? "Preu de l'anunci" : "Precio del anuncio", `${eur(i.priceEurMonth)}/mes`],
    [ca ? "Superfície" : "Superficie", i.surfaceM2 ? `${Math.round(i.surfaceM2)} m²` : "—"],
    [ca ? "Habitacions" : "Habitaciones", i.rooms != null ? String(i.rooms) : "—"],
    [ca ? "Tipus de contracte" : "Tipo de contrato", contractLabel],
    [ca ? "Any de construcció" : "Año de construcción", i.builtYear ?? "—"],
    [ca ? "Renda del contracte anterior" : "Renta del contrato anterior", i.previousRent ? `${eur(i.previousRent)}/mes` : "—"],
    [ca ? "Notes de l'usuari" : "Notas del usuario", i.notes ?? "—"],
  ];

  // A. Preu
  const refLabel = p.referenceScope === "MUNICIPI"
    ? L({ ca: "Fiança mitjana municipal registrada (Incasòl, habitatge típic)", es: "Fianza media municipal registrada (Incasòl, vivienda típica)" })
    : L({ ca: "Referència de comarca (APROXIMACIÓ: sense fiança municipal publicada)", es: "Referencia de comarca (APROXIMACIÓN: sin fianza municipal publicada)" });
  const verdict = p.verdict ? L(VERDICT_LABELS[p.verdict]) : (ca ? "sense referència comparable" : "sin referencia comparable");
  const note = verdictNote(p.verdict, locale);

  const evRows = p.evolution.slice(-8).map((e2) => `<tr><td>${esc(e2.year)}</td><td>${eur(e2.value)}</td></tr>`).join("");
  const neighRows = p.neighbours
    .map((n) => {
      const rentCell = n.rentLatest
        ? eur(n.rentLatest) + "/mes" + (n.rentSource && n.rentSource !== "INCASOL" ? " (" + (ca ? "aprox. comarca" : "aprox. comarca") + ")" : "")
        : "—";
      return `<tr><td>${esc(n.name)}</td><td>${n.distanceKm.toFixed(1).replace(".", ",")} km</td><td>${rentCell}</td><td>${esc(n.rentPeriod ?? "—")}</td></tr>`;
    })
    .join("");

  const expected = p.expected;
  const expectedRows = expected
    ? [
        [ca ? "Central orientativa (comparativa estadística)" : "Central orientativa (comparativa estadística)", `${eur(expected.central)}/mes`],
        [ca ? "Base oficial sense ajustos" : "Base oficial sin ajustos", `${eur(expected.baseCentral)}/mes (${expected.baseSource === "MUNICIPI" ? (ca ? "fiança municipal" : "fianza municipal") : (ca ? "ref. comarca" : "ref. comarca")})`],
        [ca ? "Banda típica" : "Banda típica", `${eur(expected.min)} – ${eur(expected.max)} (${ca ? "disposició" : "dispersión"} ${(expected.relativeDispersion * 100).toFixed(0).replace(".", ",")} %)`],
        [ca ? "Confiança" : "Confianza", expected.confidence],
        [ca ? "€/m²·mes derivat" : "€/m²·mes derivado", expected.eurM2 != null ? expected.eurM2.toFixed(2).replace(".", ",") : "—"],
      ]
    : null;

  // B. Normativa
  const normRows = data.normative.checks
    .map((c) => {
      const label = NORM_CHECK_LABELS[`${c.id}|${c.detail}`];
      const detail = label ? L(label) : esc(c.detail);
      const st = L(STATE_LABELS[c.state] ?? STATE_LABELS.PENDING);
      const cls = c.state === "OK" ? "ok" : c.state === "PENDING" ? "pending" : c.state === "ALERT" ? "alert" : c.state === "INFO" ? "ok" : "na";
      return `<tr><td><span class="${cls}">${esc(st)}</span></td><td>${detail}</td></tr>`;
    })
    .join("");

  // C. Serveis
  const catRows = (cat: string): string => {
    const items = (serveis?.items ?? []).filter((x) => x.category === cat).slice(0, 5);
    if (items.length === 0) return `<tr><td>${L(CATEGORY_LABELS[cat])}</td><td>—</td><td></td></tr>`;
    return items
      .map((x) => {
        const d = x.distanceM >= 1000 ? `${(x.distanceM / 1000).toFixed(1).replace(".", ",")} km` : `${Math.round(x.distanceM)} m`;
        return `<tr><td>${L(CATEGORY_LABELS[cat])}</td><td>${esc(x.name)}</td><td>${d} (${ca ? "línia recta, aprox." : "línea recta, aprox."})</td></tr>`;
      })
      .join("");
  };
  const serveisHtml = serveis?.ok
    ? `<table>${catRows("TRANSPORT")}${catRows("SALUT")}${catRows("EDUCACIO")}${catRows("COMPRA")}${catRows("VERD")}</table>
       <p class="small">${esc(serveis.distancesNote ?? "")} ${esc(serveis.source ?? "")}</p>`
    : `<p class="small">${esc(serveis?.message ?? (ca ? "Serveis d'entorn no consultats en aquest informe." : "Servicios de entorno no consultados en este informe."))}</p>`;

  // D. Checklist
  const checkRows = data.checklist
    .map((c) => {
      const label = CHECKLIST_LABELS[c.id];
      return `<tr><td>${checked[c.id] ? "SÍ" : "—"}</td><td>${label ? L(label) : esc(c.id)}</td><td class="small">${esc(c.source ?? "")}</td></tr>`;
    })
    .join("");

  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"/>
<title>Preureal — ${ca ? "consulta del preu real registrat" : "consulta del precio real registrado"} · ${esc(i.municipalityName)}</title>
<style>${CSS}</style></head><body>
<h1>Preureal · ${ca ? "Consulta del preu real registrat" : "Consulta del precio real registrado"}</h1>
<p class="sub">${esc(i.municipalityName)} · ${esc(contractLabel)} · ${ca ? "generat" : "generado"} ${esc(genStr)} · www.preureal.com</p>
<p class="small">${L(ORIENTATION_DISCLAIMER)}</p>

<h2>${ca ? "1. Dades introduïdes" : "1. Datos introducidos"}</h2>
<table>${rowsInput.map((r) => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join("")}</table>

<h2>${ca ? "2. Anàlisi del preu" : "2. Análisis del precio"}</h2>
<div>
 <span class="kpi"><b>${eur(i.priceEurMonth)}</b>${ca ? "preu de l'anunci" : "precio del anuncio"}</span>
 <span class="kpi"><b>${p.eurM2 != null ? p.eurM2.toFixed(2).replace(".", ",") : "—"} €/m²·mes</b>${ca ? "derivat de l'anunci" : "derivado del anuncio"}</span>
 <span class="kpi"><b>${eur(p.reference)}</b>${refLabel}${p.referencePeriod ? ` · ${esc(p.referencePeriod)}` : ""}${p.referenceContracts != null ? ` · n=${p.referenceContracts} ${ca ? "contractes" : "contratos"}` : ""}</span>
 <span class="kpi"><b>${pct(p.deltaVsReferencePct)}</b>${ca ? "diferència amb la referència" : "diferencia con la referencia"}</span>
 ${p.deltaVsExpectedPct != null ? `<span class="kpi"><b>${pct(p.deltaVsExpectedPct)}</b>${ca ? "diferència amb la comparativa per característiques" : "diferencia con la comparativa por características"}</span>` : ""}
</div>
<p><b>${ca ? "Lectura:" : "Lectura:"}</b> ${esc(verdict)}</p>
${note ? `<p class="small">${esc(note)}</p>` : ""}
${expectedRows ? `<table>${expectedRows.map((r) => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join("")}</table>
<p class="small">${ca ? "La comparativa per característiques és una ESTIMACIÓ ESTADÍSTICA ORIENTATIVA elaborada per Preureal sobre la fiança oficial (ajustos visibles i documentats). No és una taxació ni una valoració individualitzada de l'habitatge." : "La comparativa por características es una ESTIMACIÓN ESTADÍSTICA ORIENTATIVA elaborada por Preureal sobre la fianza oficial (ajustes visibles y documentados). No es una tasación ni una valoración individualizada de la vivienda."}</p>` : ""}
<h3>${ca ? "Evolució anual registrada (Incasòl)" : "Evolución anual registrada (Incasòl)"}</h3>
${evRows ? `<table><tr><th>${ca ? "Any" : "Año"}</th><th>€/mes</th></tr>${evRows}</table>` : `<p class="small">${ca ? "Sèrie històrica no disponible per a aquest municipi." : "Serie histórica no disponible para este municipio."}</p>`}
${neighRows ? `<h3>${ca ? "Municipis propers amb dada oficial" : "Municipios próximos con dato oficial"}</h3>
<table><tr><th>${ca ? "Municipi" : "Municipio"}</th><th>km</th><th>${ca ? "Fiança mitjana" : "Fianza media"}</th><th>${ca ? "Període" : "Período"}</th></tr>${neighRows}</table>` : ""}

<h2>${ca ? "3. Comprovació normativa" : "3. Comprobación normativa"}</h2>
<table><tr><th>${ca ? "Estat" : "Estado"}</th><th>${ca ? "Explicació" : "Explicación"}</th></tr>${normRows}</table>
${data.normative.tense ? `<p class="small"><b>${ca ? "Zona tensada (Llei 12/2023, LAU art. 17.2):" : "Zona tensionada (Ley 12/2023, LAU art. 17.2):"}</b> ${ca ? "els nous contractes d'habitatge habitual de grans tenidors tenen el límit de renda del darrer contracte dels 5 anys anteriors; si l'habitatge porta 5 anys o més sense llogar (o és de nova construcció), el límit és el rang oficial de referència." : "los nuevos contratos de vivienda habitual de grandes tenedores tienen el límite de renta del último contrato de los 5 años anteriores; si la vivienda lleva 5 años o más sin alquilar (o es de nueva construcción), el límite es el rango oficial de referencia."} <a href="${SERPAVI_URL}">${SERPAVI_URL}</a></p>` : ""}
<p class="small">${ca ? "Consulta oficial del sistema estatal de referència (SERPAVI):" : "Consulta oficial del sistema estatal de referencia (SERPAVI):"} <a href="${esc(data.normative.serpaviUrl)}">${esc(data.normative.serpaviUrl)}</a><br/>
${ca ? "Data de consulta normativa:" : "Fecha de consulta normativa:"} ${esc(data.normative.consultedAt)} · ${data.normative.resolutions.map((r) => esc(r)).join(" · ")}<br/>
${ca ? "La comprovació és informativa i no substitueix l'assessorament jurídic ni el text vigent de la norma." : "La comprobación es informativa y no sustituye el asesoramiento jurídico ni el texto vigente de la norma."}</p>

<h2>${ca ? "4. Ubicació: serveis propers" : "4. Ubicación: servicios próximos"}</h2>
${serveisHtml}

<h2>${ca ? "5. Abans de signar — llista de comprovació" : "5. Antes de firmar — lista de comprobación"}</h2>
<table class="check"><tr><th>SÍ</th><th>${ca ? "Comprovació" : "Comprobación"}</th><th>${ca ? "Font" : "Fuente"}</th></tr>${checkRows}</table>

<h2>${ca ? "6. Fonts, limitacions i precisió" : "6. Fuentes, limitaciones y precisión"}</h2>
<ul>
 ${data.sources.map((s) => `<li>${esc(s.t)} — <a href="${esc(s.u)}">${esc(s.u)}</a> · ${esc(s.d)}</li>`).join("")}
</ul>
<ul>
 ${data.limitations.map((l) => `<li>${esc(l)}</li>`).join("")}
</ul>
<p class="small">${ca ? "Informació orientativa amb data de generació; consulta sempre les fonts originals. Fiances Incasòl via habitatge.gencat.cat © Generalitat de Catalunya · Cartografia ICGC CC-BY 4.0 · Serveis propers OpenStreetMap (ODbL)." : "Información orientativa con fecha de generación; consulta siempre las fuentes originales. Fianzas Incasòl vía habitatge.gencat.cat © Generalitat de Catalunya · Cartografía ICGC CC-BY 4.0 · Servicios próximos OpenStreetMap (ODbL)."}</p>
</body></html>`;
}
