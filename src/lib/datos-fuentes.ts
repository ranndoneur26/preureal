/**
 * v71 — Fase P1 del pla de manteniment de dades: catàleg de fonts oficials
 * del panell «Dades i fonts» (#/admin) + semàfor d'estat.
 *
 * Font de veritat: *Plan de Mantenimiento de Bases de Datos — PreuReal.com*
 * (taula 5 · matriu d'actualització, taula 11 · estats visuals, taula 13 ·
 * KPIs) i el cron vigent de `.github/workflows/mantenimiento.yml` i
 * `vercel.json`. Tot el que el pla no fixa (SLA de serveis continus/anuals)
 * queda marcat com a «proposat» amb slaNota.
 *
 * Mòdul PUR (sense BD ni xarxa) per poder-lo testejar amb bun test:
 * els criteris del semàforo (taula 11) tenen missatge i llindar exactes.
 */

export type Prioritat = "CRITICA" | "MEDIA";

export interface FontPanel {
  /** codi canònic a DataSource (create-only; mai sobreescriu files existents) */
  code: string;
  nom: string;
  /** nom en castellà per a la UI ES */
  nomEs?: string;
  institucio: string;
  llicencia: string | null;
  /** URL oficial segurament coneguda (null si el pla no la fixa) */
  url: string | null;
  periodicitat: string; // ANUAL | SEMESTRAL | CONTINU | VENTANA | EDITORIAL
  periodicitatCa: string;
  periodicitatEs: string;
  prioritat: Prioritat;
  /** KPI-1 · frescura: SLA en dies (pla taula 13: Incasòl 100 · Catastro 180 · SERPAVI 730 · ZMRT 180) */
  slaDies: number;
  /** nota quan el SLA és proposat (el pla no el fixa) */
  slaNotaCa?: string;
  slaNotaEs?: string;
  /** traçabilitat: prefixos d'ImportRun.source que pertanyen a aquesta font */
  runPrefixes: string[];
  /** slug admès per pipeline/qa/auditoria_f0.py --fuente */
  auditSlug: string;
  /** cron vigent (manteniment.yml + vercel.json), per al botó Programar */
  cadenciaCa: string;
  cadenciaEs: string;
}

export const FONTS_PANEL: FontPanel[] = [
  {
    code: "INCASOL_EXCEL",
    nom: "Incasòl — Excel municipals (lloguer mitjà + contractes)",
    nomEs: "Incasòl — Excel municipales (alquiler medio + contratos)",
    institucio: "Incasòl / habitatge.gencat.cat",
    llicencia: "publicació oficial",
    url: "https://habitatge.gencat.cat",
    periodicitat: "ANUAL",
    periodicitatCa: "Anual (revisions trimestrals)",
    periodicitatEs: "Anual (revisiones trimestrales)",
    prioritat: "CRITICA",
    slaDies: 100,
    runPrefixes: ["INCASOL_EXCEL", "INCASOL_MUNICIPIS"],
    auditSlug: "incasol-excel",
    cadenciaCa:
      "Cicle trimestral F0 al workflow de manteniment (1 gen·abr·jul·oct, 03:00 UTC) + import anual al tancament (gener-desembre)",
    cadenciaEs:
      "Ciclo trimestral F0 en el workflow de mantenimiento (1 ene·abr·jul·oct, 03:00 UTC) + import anual al cierre (enero-diciembre)",
  },
  {
    code: "INCASOL_SOCRATA",
    nom: "Incasòl — flux de fiances (Socrata qww9-bvhh)",
    nomEs: "Incasòl — flujo de fianzas (Socrata qww9-bvhh)",
    institucio: "Incasòl",
    llicencia: "publicació oficial",
    url: null,
    periodicitat: "ANUAL",
    periodicitatCa: "Import anual + verificació trimestral de disponibilitat",
    periodicitatEs: "Import anual + verificación trimestral de disponibilidad",
    prioritat: "CRITICA",
    slaDies: 100,
    runPrefixes: ["INCASOL_FIANZES", "RENTAL_SHARE_CENS", "RENTAL_SHARE_FLUX", "INCASOL_SOCRATA"],
    auditSlug: "incasol-socrata",
    cadenciaCa:
      "Cicle trimestral F0 al workflow de manteniment + import anual la 1a quincena de març (tancament de l'any anterior)",
    cadenciaEs:
      "Ciclo trimestral F0 en el workflow de mantenimiento + import anual la 1.ª quincena de marzo (cierre del año anterior)",
  },
  {
    code: "CATASTRO_ATOM",
    nom: "Catastro INSPIRE ATOM (any de construcció)",
    nomEs: "Catastro INSPIRE ATOM (año de construcción)",
    institucio: "Direcció General del Catastre (MEH)",
    llicencia: null,
    url: "https://www.catastro.meh.es",
    periodicitat: "SEMESTRAL",
    periodicitatCa: "Semestral (edicions consolidades) + chequeo trimestral de disponibilitat",
    periodicitatEs: "Semestral (ediciones consolidadas) + chequeo trimestral de disponibilidad",
    prioritat: "CRITICA",
    slaDies: 180,
    runPrefixes: ["CADASTRE_DNP", "CATASTRO"],
    auditSlug: "catastro",
    cadenciaCa:
      "Cicle trimestral F0 al workflow de manteniment; sincronització major setembre-octubre i menor abril",
    cadenciaEs:
      "Ciclo trimestral F0 en el workflow de mantenimiento; sincronización mayor septiembre-octubre y menor abril",
  },
  {
    code: "ICGC_SERVEI",
    nom: "ICGC — tiles, geocodificador i descàrregues",
    institucio: "ICGC",
    llicencia: null,
    url: "https://www.icgc.cat",
    periodicitat: "CONTINU",
    periodicitatCa: "Servei continu: chequeo mensual (tiles + geocodificador) i revisió anual de versions",
    periodicitatEs: "Servicio continuo: chequeo mensual (tiles + geocodificador) y revisión anual de versiones",
    prioritat: "MEDIA",
    slaDies: 45,
    slaNotaCa: "SLA proposat (45 d per servei amb chequeo mensual); el pla no el fixa",
    slaNotaEs: "SLA propuesto (45 d para servicio con chequeo mensual); el plan no lo fija",
    runPrefixes: ["ICGC"],
    auditSlug: "generic",
    cadenciaCa: "Canari diari 05:00 UTC (sondes ICGC de l'API) + chequeo mensual manual",
    cadenciaEs: "Canario diario 05:00 UTC (sondas ICGC de la API) + chequeo mensual manual",
  },
  {
    code: "ZMRT_DOGC",
    nom: "Generalitat ZMRT — resolucions TER (DOGC)",
    nomEs: "Generalidad ZMRT — resoluciones TER (DOGC)",
    institucio: "Generalitat de Catalunya · DOGC",
    llicencia: "publicació oficial (DOGC)",
    url: "https://dogc.gencat.cat",
    periodicitat: "VENTANA",
    periodicitatCa: "Ventanes abril i octubre: vigilància quincenal del DOGC + import < 72 h per resolució",
    periodicitatEs: "Ventanas abril y octubre: vigilancia quincenal del DOGC + import < 72 h por resolución",
    prioritat: "CRITICA",
    slaDies: 180,
    runPrefixes: ["ZMRT"],
    auditSlug: "zmrt",
    cadenciaCa:
      "Vigilància DOGC 1 i 15 de cada mes (08:00 UTC) + finestres abril i octubre (0 8 * 4,10 *)",
    cadenciaEs:
      "Vigilancia DOGC 1 y 15 de cada mes (08:00 UTC) + ventanas abril y octubre (0 8 * 4,10 *)",
  },
  {
    code: "SERPAVI",
    nom: "SERPAVI (MIVAU) — sèrie vigent de fiances/bonus",
    nomEs: "SERPAVI (MIVAU) — serie vigente de fianzas/bono",
    institucio: "MIVAU / Incasòl (portal SERPAVI)",
    llicencia: null,
    url: null,
    periodicitat: "EDITORIAL",
    periodicitatCa: "Chequeo mensual del portal + revisió al anunci de nova sèrie vigent",
    periodicitatEs: "Chequeo mensual del portal + revisión al anuncio de nueva serie vigente",
    prioritat: "CRITICA",
    slaDies: 730,
    runPrefixes: ["RENTAL_SHARE_ADMIN", "RENTAL_SHARE_VIGENTS"],
    auditSlug: "generic",
    cadenciaCa:
      "Cron de l'app /api/cron/rental-share + chequeo mensual manual del portal",
    cadenciaEs:
      "Cron de la app /api/cron/rental-share + chequeo mensual manual del portal",
  },
  {
    code: "IDESCAT_BSECCEN",
    nom: "Idescat — bseccen i API Indicadors/Taules",
    institucio: "Idescat",
    llicencia: "publicació oficial",
    url: "https://www.idescat.cat",
    periodicitat: "ANUAL",
    periodicitatCa: "Anual (nova edició bseccen, re-seccionat censal) + puntual per indicador",
    periodicitatEs: "Anual (nueva edición bseccen, re-seccionado censal) + puntual por indicador",
    prioritat: "MEDIA",
    slaDies: 400,
    slaNotaCa: "SLA proposat (anual + marge); el pla no el fixa",
    slaNotaEs: "SLA propuesto (anual + margen); el plan no lo fija",
    runPrefixes: ["IDESCAT"],
    auditSlug: "generic",
    cadenciaCa: "Import sota demanda des del panell + cicle trimestral F0 de manteniment",
    cadenciaEs: "Import bajo demanda desde el panel + ciclo trimestral F0 de mantenimiento",
  },
  {
    code: "INE_TEMPUS3",
    nom: "INE — Tempus3 (IPVA, Atlas ADRH, demografia)",
    institucio: "INE",
    llicencia: "publicació oficial",
    url: "https://www.ine.es",
    periodicitat: "ANUAL",
    periodicitatCa: "Anual (import-ine del panell) + verificació de coherència amb la fitxa",
    periodicitatEs: "Anual (import-ine del panel) + verificación de coherencia con la ficha",
    prioritat: "MEDIA",
    slaDies: 400,
    slaNotaCa: "SLA proposat (anual + desfase de publicació); el pla no el fixa",
    slaNotaEs: "SLA propuesto (anual + desfase de publicación); el plan no lo fija",
    runPrefixes: ["INE_"],
    auditSlug: "generic",
    cadenciaCa: "Cron de l'app /api/cron/ine (1 mar·jun·set·des, 05:00 UTC) + cicle trimestral F0",
    cadenciaEs: "Cron de la app /api/cron/ine (1 mar·jun·sep·dic, 05:00 UTC) + ciclo trimestral F0",
  },
];

/** Accions del panell (taula 12 del pla) — API POST action. */
export const ACCIONS_FONT = [
  "auditar_iniciar",
  "auditar_registrar",
  "firma_f0",
  "importar",
  "importar_registrar",
  "verificar",
  "rollback",
  "pausar",
  "activar",
] as const;
export type AccioFont = (typeof ACCIONS_FONT)[number];

// ── Semàfor d'estats (pla, taula 11) ────────────────────────────────────────

export type EstatFont = "VIGENTE" | "AVISO" | "CRITICO" | "PAUSADA";

export const COLOR_ESTAT: Record<EstatFont, string> = {
  // colors exactes del pla (taula 11)
  VIGENTE: "#2E7D5B",
  AVISO: "#B8860B",
  CRITICO: "#B23B3B",
  PAUSADA: "#8A93A1",
};

export interface InputEstatFont {
  active: boolean;
  /** dies des de l'última importació OK (null si mai n'hi ha hagut) */
  diesDesdeUltimaOk: number | null;
  slaDies: number;
  /** estat de l'última execució registrada (qualsevol status) */
  ultimaRunStatus: string | null;
  /** veredicte de l'última auditoria F0 registrada */
  lastF0Veredicte: string | null;
  /** firma humana C9/C10 posterior a l'última auditoria */
  firmaValida: boolean;
}

export interface ResultatEstatFont {
  estat: EstatFont;
  /** % de consum del SLA (0-…; null si no hi ha import registrada) */
  pct: number | null;
  /** motius (codis) que activen l'estat — la UI sempre acompanya el color amb text */
  motius: string[];
}

/**
 * Semàfor per font (taula 11 del pla):
 *  · PAUSADA — DataSource.active=false
 *  · CRÍTICO — frescura > SLA+25 % · última import ERROR
 *  · AVISO   — frescura > SLA (≤ SLA+25 %) · control C9/C10 pendent de firma · F0 NO-GO
 *  · VIGENTE — resta (frescura ≤ SLA, sense incidents)
 */
export function calcEstatFont(i: InputEstatFont): ResultatEstatFont {
  if (!i.active) {
    return { estat: "PAUSADA", pct: null, motius: ["PAUSADA"] };
  }
  const motius: string[] = [];
  let estat: EstatFont = "VIGENTE";

  const ultimError = i.ultimaRunStatus === "ERROR";
  const dies = i.diesDesdeUltimaOk;
  const foraSla = dies !== null && dies > i.slaDies;
  const foraSla25 = dies !== null && dies > Math.round(i.slaDies * 1.25);
  const firmaPendent =
    i.lastF0Veredicte === "GO_CONDICIONAL" && !i.firmaValida;
  const noGo = i.lastF0Veredicte === "NO_GO";

  if (foraSla25) {
    motius.push("FRESQUERA_SLA_MES_25");
    estat = "CRITICO";
  }
  if (ultimError) {
    motius.push("IMPORT_ERROR");
    estat = "CRITICO";
  }
  if (foraSla && !foraSla25) {
    motius.push("FRESQUERA_SLA");
    estat = estat === "CRITICO" ? "CRITICO" : "AVISO";
  }
  if (firmaPendent) {
    motius.push("F0_FIRMA_PENDENT");
    estat = estat === "CRITICO" ? "CRITICO" : "AVISO";
  }
  if (noGo) {
    motius.push("F0_NO_GO");
    estat = estat === "CRITICO" ? "CRITICO" : "AVISO";
  }

  const pct = dies === null ? null : Math.round((dies / i.slaDies) * 100);
  return { estat, pct, motius };
}

/** Dies sencers des d'una data ISO fins ara (mínim 0). */
export function diesDesde(iso: string | Date | null | undefined): number | null {
  if (!iso) return null;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const t = d.getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

/** El codi del panell és una font coneguda? (coincidència exacta) */
export function fontPerCodi(code: string): FontPanel | undefined {
  return FONTS_PANEL.find((f) => f.code === code);
}

/** Un source d'ImportRun pertany a la font (prefix documentat)? */
export function runEsDeFont(source: string, font: FontPanel): boolean {
  return font.runPrefixes.some((p) => source.startsWith(p));
}

/**
 * La font permet importar? (pla taula 12: exigeix F0 12/12, o firma humana
 * de C9/C10 posterior si el veredicte és GO-CONDICIONAL)
 */
export function importacioDesbloquejada(
  lastF0: { veredicte: string; controles: number; at: Date } | null,
  firma: { at: Date } | null,
): boolean {
  if (!lastF0) return false;
  if (lastF0.veredicte === "GO") return lastF0.controles === 12;
  if (lastF0.veredicte === "GO_CONDICIONAL") {
    return Boolean(firma && firma.at.getTime() > lastF0.at.getTime());
  }
  return false;
}
