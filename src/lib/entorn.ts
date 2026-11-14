/**
 * v40 — Capa de lectura del bloc «Serveis i qualitat de l'entorn».
 * La fitxa NOMÉS llegeix d'aquí: cap consulta a fonts externes durant una
 * visita (excepte el lookup on-demand de certificats ICAEN, cachejat 30 dies
 * a BuildingAssociation — mateix patró que ICGC/Catastro amb BD-cau).
 *
 * Regla d'or: les distàncies són EN LÍNIA RECTA (haversine) i sempre s'etiqueten
 * com a tals; un punt absent no és «zero», és «sense informació disponible».
 */
import { db } from "@/lib/db";
import {
  bboxAround,
  countsByRadius,
  haversineMeters,
  normalizeRefcat,
} from "@/lib/entorn-parse";
import { importEnergiaForBuilding } from "@/lib/entorn-import";

const MAX_RADIUS = 2000;
/** Límit de seguretat del bbox (municipis densíssims: BCN té milers de punts). */
const BBOX_TAKE = 5000;
/** Frescor de la caché on-demand de certificats (30 dies, com ICGC/Catastro). */
const CERT_FRESH_MS = 30 * 24 * 3600 * 1000;

export type EntornCert = {
  numCas: string;
  refcat: string;
  us: string | null;
  qualificacioConsum: string | null;
  qualificacioEmissions: string | null;
  consumKwhM2: number | null;
  emissionsCo2KgM2: number | null;
  energiaPrimariaKwhM2: number | null;
  metresCadastre: number | null;
  eina: string | null;
  motiu: string | null;
  dataEntrada: string | null;
};

export type EntornPunt = {
  kind: string | null;
  nom: string;
  distM: number;
  props: Record<string, unknown>;
};

export type EntornGrup = {
  kind: string;
  nearest: EntornPunt[];
  counts: Record<string, number>;
};

export type BuildingEntorn = {
  buildingId: string;
  refcat: string | null;
  energia: {
    disponible: boolean;
    certificats: EntornCert[];
    refcatUsada: string | null;
    nota: string;
  };
  mobilitat: {
    disponible: boolean;
    parades: EntornPunt[];
    grupsParades: EntornGrup[];
    recarrega: EntornPunt[];
    countsParades: Record<string, number>;
    countsRecarrega: Record<string, number>;
  };
  serveis: {
    disponible: boolean;
    grups: EntornGrup[];
  };
  fonts: Array<{ code: string; name: string; institution: string; license: string }>;
};

function parseProps(json: string | null): Record<string, unknown> {
  if (!json) return {};
  try {
    const v = JSON.parse(json) as unknown;
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Grups per kind amb els N punts més propers i comptes per radius. */
function groupByKind(
  rows: Array<{ kind: string | null; name: string; distM: number; props: string | null }>,
  takePerGroup: number
): EntornGrup[] {
  const byKind = new Map<string, Array<{ kind: string | null; name: string; distM: number; props: string | null }>>();
  for (const r of rows) {
    const k = r.kind ?? "ALTRE";
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k)!.push(r);
  }
  const groups: EntornGrup[] = [];
  for (const [kind, list] of byKind) {
    list.sort((a, b) => a.distM - b.distM);
    groups.push({
      kind,
      nearest: list.slice(0, takePerGroup).map((r) => ({
        kind: r.kind,
        nom: r.name,
        distM: Math.round(r.distM),
        props: parseProps(r.props),
      })),
      counts: countsByRadius(list.map((r) => r.distM)),
    });
  }
  groups.sort((a, b) => {
    const na = a.nearest[0]?.distM ?? Infinity;
    const nb = b.nearest[0]?.distM ?? Infinity;
    return na - nb;
  });
  return groups;
}

/**
 * Context d'entorn d'un edifici per id. Retorna null si l'edifici no existeix.
 * Si l'edifici té refcat i encara no hi ha certificat (o és vell), fa el lookup
 * on-demand ICAEN UNA vegada i el deixa cachejat (mai reintent per visita si
 * la font respon sense dades: hi queda el run i l'associació buida és fresca).
 */
export async function getBuildingEntorn(buildingId: string): Promise<BuildingEntorn | null> {
  const building = await db.building.findUnique({
    where: { id: buildingId },
    select: {
      id: true,
      refcat: true,
      centroidLat: true,
      centroidLng: true,
      municipalityCode: true,
      cachedAt: true,
    },
  });
  if (!building) return null;

  // ── Energia (certificats ICAEN, associació REFCAT amb caché 30 dies) ──
  let certs: EntornCert[] = [];
  let refcatUsada: string | null = null;
  if (building.refcat) {
    const rc = normalizeRefcat(building.refcat);
    refcatUsada = rc;
    const assoc = await db.buildingAssociation.findMany({
      where: { buildingId: building.id, category: "ENERGY_CERT" },
      orderBy: { computedAt: "desc" },
    });
    const fresh =
      assoc.length > 0 &&
      assoc[0].computedAt.getTime() > Date.now() - CERT_FRESH_MS;
    if (!fresh) {
      try {
        await importEnergiaForBuilding(building.id, rc);
        const redo = await db.buildingAssociation.findMany({
          where: { buildingId: building.id, category: "ENERGY_CERT" },
          orderBy: { computedAt: "desc" },
        });
        certs = redo.map((a) => JSON.parse(a.value ?? "{}") as EntornCert);
      } catch (e) {
        console.error("entorn: lookup ICAEN on-demand ha fallat", e);
        // degradació: energia sense dades, la resta del bloc segueix funcionant
      }
    } else {
      certs = assoc.map((a) => JSON.parse(a.value ?? "{}") as EntornCert);
    }
  }

  // ── Punts propers (bbox 2000 m + haversine en memòria) ──
  const bbox = bboxAround(building.centroidLat, building.centroidLng, MAX_RADIUS);
  const pointRows = await db.geoPoint.findMany({
    where: {
      category: { in: ["TRANSPORT_STOP", "PUBLIC_FACILITY", "CHARGING_STATION"] },
      lat: { gte: bbox.minLat, lte: bbox.maxLat },
      lng: { gte: bbox.minLng, lte: bbox.maxLng },
    },
    select: { category: true, kind: true, name: true, lat: true, lng: true, props: true },
    take: BBOX_TAKE,
  });
  const withDist = pointRows
    .map((p) => ({
      category: p.category,
      kind: p.kind,
      name: p.name,
      props: p.props,
      distM: haversineMeters(building.centroidLat, building.centroidLng, p.lat, p.lng),
    }))
    .filter((p) => p.distM <= MAX_RADIUS);

  const parades = withDist.filter((p) => p.category === "TRANSPORT_STOP");
  const serveisRows = withDist.filter((p) => p.category === "PUBLIC_FACILITY");
  const recarregaRows = withDist
    .filter((p) => p.category === "CHARGING_STATION")
    .sort((a, b) => a.distM - b.distM);

  const toPunt = (r: { kind: string | null; name: string; distM: number; props: string | null }): EntornPunt => ({
    kind: r.kind,
    nom: r.name,
    distM: Math.round(r.distM),
    props: parseProps(r.props),
  });

  const recarregaPunts = recarregaRows.slice(0, 6).map(toPunt);
  const entorn: BuildingEntorn = {
    buildingId: building.id,
    refcat: refcatUsada,
    energia: {
      disponible: certs.length > 0,
      certificats: certs,
      refcatUsada,
      nota: certs.length
        ? "Certificat oficial registrat a ICAEN (dades declarades de certificació, no consum real mesurat)."
        : building.refcat
          ? "Sense certificat localitzat per aquest edifici al registre ICAEN (cobertura parcial: només edificis amb certificat). Mai s'inventa una qualificació."
          : "Aquest edifici encara no té referència catastral coneguda; no es pot cercar el certificat.",
    },
    mobilitat: {
      disponible: parades.length > 0 || recarregaRows.length > 0,
      parades: parades.slice(0, 8).map(toPunt),
      grupsParades: groupByKind(parades, 6),
      recarrega: recarregaPunts,
      countsParades: countsByRadius(parades.map((p) => p.distM)),
      countsRecarrega: countsByRadius(recarregaRows.map((p) => p.distM)),
    },
    serveis: {
      disponible: serveisRows.length > 0,
      grups: groupByKind(serveisRows, 4),
    },
    fonts: [
      {
        code: "ENTORNT_ENERGIA",
        name: "Certificats d'eficiència energètica d'edificis",
        institution: "Generalitat de Catalunya — ICAEN",
        license: "Llicència oberta d'ús d'informació — Catalunya",
      },
      {
        code: "ENTORNT_SANITARIS",
        name: "Establiments sanitaris autoritzats",
        institution: "Generalitat de Catalunya — Departament de Salut",
        license: "Llicència oberta d'ús d'informació — Catalunya",
      },
      {
        code: "ENTORNT_DOCENTS",
        name: "Directori de centres docents",
        institution: "Generalitat de Catalunya — Departament d'Educació",
        license: "Llicència oberta d'ús d'informació — Catalunya",
      },
      {
        code: "ENTORNT_EQUIPAMENTS",
        name: "Equipaments de Catalunya (Cultura / Esports)",
        institution: "Generalitat de Catalunya — DG Serveis Digitals",
        license: "Llicència oberta d'ús d'informació — Catalunya",
      },
      {
        code: "ENTORNT_RECARREGA",
        name: "Estacions de recàrrega de vehicle elèctric",
        institution: "Generalitat de Catalunya — ICAEN",
        license: "Llicència oberta d'ús d'informació — Catalunya",
      },
    ],
  };
  return entorn;
}
