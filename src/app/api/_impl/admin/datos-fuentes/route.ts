import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import {
  ACCIONS_FONT,
  FONTS_PANEL,
  calcEstatFont,
  diesDesde,
  fontPerCodi,
  importacioDesbloquejada,
  runEsDeFont,
  type FontPanel,
} from "@/lib/datos-fuentes";

/**
 * v71 — Fase P1 · API del panell «Dades i fonts» (#/admin).
 *
 * GET  /api/admin/datos-fuentes            → estat del semàforo per font + KPIs
 * GET  /api/admin/datos-fuentes?informe=X  → informe JSON descarregable d'una font
 * POST /api/admin/datos-fuentes            → accions de l'administrador (taula 12 del pla)
 *
 * Tota acció escriu a AuditLog; les destructives (importar, rollback, pausar)
 * exigeixen confirmació escrita / motiu. Cap acció toca taules de dades:
 * el panell és el tauler d'estat i traçabilitat; l'execució real (descàrrega,
 * auditoria F0, staging→prod, restauració) continua al pipeline
 * (auditoria_f0.py, update_all.sh, backup_pg.sh, canary_diario.py) i al
 * workflow de manteniment de GitHub Actions.
 */

const ACCIONS_AUDIT = [
  "DATOS_F0_AUDIT",
  "DATOS_F0_FIRMA",
  "DATOS_VERIFICAR",
  "DATOS_IMPORT_SOLICIT",
  "DATOS_IMPORT_RESULT",
  "DATOS_ROLLBACK_SOLICIT",
  "DATOS_AUDIT_START",
  "DATOS_FONT_PAUSE",
  "DATOS_FONT_ACTIVATE",
];

/** Alta create-only de les fonts del panell a DataSource (mai sobreescriu). */
async function ensureFontsPanel(): Promise<void> {
  const codes = FONTS_PANEL.map((f) => f.code);
  const existing = await db.dataSource.findMany({
    where: { code: { in: codes } },
    select: { code: true },
  });
  const have = new Set(existing.map((e) => e.code));
  const missing = FONTS_PANEL.filter((f) => !have.has(f.code));
  if (missing.length === 0) return;
  await db.dataSource.createMany({
    data: missing.map((f) => ({
      code: f.code,
      name: f.nom,
      institution: f.institucio,
      url: f.url,
      license: f.llicencia,
      periodicity: f.periodicitat,
      notes: `v71 panell «Dades i fonts» — SLA ${f.slaDies} d · prioritat ${f.prioritat}`,
    })),
  });
}

function procedimentAuditar(f: FontPanel): string {
  const extra = f.auditSlug.startsWith("incasol") ? " --descargar" : "";
  return `python3 pipeline/qa/auditoria_f0.py --fuente ${f.auditSlug}${extra} --db`;
}

const PROCEDIMENT_IMPORTAR =
  "bash scripts/backup_pg.sh && bash scripts/update_all.sh && python3 scripts/canary_diario.py";
const PROCEDIMENT_ROLLBACK =
  "restaurar el backup (<taula>_bak_<data> o artifact backup-pg) i reverificar amb: python3 scripts/canary_diario.py";

/** GET — estat del panell (semàforo per font + KPIs globals). */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const informe = searchParams.get("informe");
  if (informe) return informeJson(informe);

  await ensureFontsPanel();

  const [rows, runs, audits, munisTotal, munisRent, munisComarca, since90] =
    await Promise.all([
      db.dataSource.findMany({
        where: { code: { in: FONTS_PANEL.map((f) => f.code) } },
        select: { code: true, name: true, institution: true, url: true, license: true, active: true },
      }),
      db.importRun.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
      db.auditLog.findMany({
        where: { action: { in: ACCIONS_AUDIT } },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      db.municipality.count(),
      db.municipality.count({ where: { rentLatest: { not: null } } }),
      db.municipality.count({ where: { comarcaRefLatest: { not: null } } }),
      new Date(Date.now() - 90 * 86_400_000),
    ]);

  // correus d'actor per a les firmes/auditories (mateix patró que /admin/audit)
  const actorIds = [...new Set(audits.map((l) => l.actorId).filter(Boolean))] as string[];
  const actors = actorIds.length
    ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } })
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a.email]));

  // KPI-3 · error rate 90 d (ERROR+PARTIAL / total)
  const runs90 = runs.filter((r) => r.createdAt >= since90);
  const errors90 = runs90.filter((r) => r.status === "ERROR" || r.status === "PARTIAL").length;
  const errorRate90 = runs90.length > 0 ? Math.round((errors90 / runs90.length) * 1000) / 10 : null;

  // conteo ZMRT de la capa geo (guarded: si la taula no és accessible → null)
  let zmrt: number | null = null;
  try {
    const q = (await db.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM "geo"."municipis" WHERE "zmrt" IS TRUE`) as Array<{ n: number }>;
    zmrt = q?.[0]?.n ?? null;
  } catch {
    zmrt = null;
  }

  const fonts = FONTS_PANEL.map((f) => {
    const runsFont = runs.filter((r) => runEsDeFont(r.source, f));
    const ultimaOk = runsFont.find((r) => r.status === "OK") || null;
    const ultimaRun = runsFont[0] || null;
    const auditF0 = audits.find((l) => l.action === "DATOS_F0_AUDIT" && l.target === f.code) || null;
    const firma = audits.find((l) => l.action === "DATOS_F0_FIRMA" && l.target === f.code) || null;
    const verificar = audits.find((l) => l.action === "DATOS_VERIFICAR" && l.target === f.code) || null;

    const metaF0 = auditF0?.meta ? JSON.parse(auditF0.meta) : {};
    const lastF0 = auditF0
      ? {
          veredicte: String(metaF0.veredicte || "?"),
          controles: Number(metaF0.controles) || 0,
          sha256: metaF0.sha256 || null,
          notas: metaF0.notas || null,
          at: auditF0.createdAt,
        }
      : null;
    const firmaInfo = firma
      ? {
          motivo: firma.meta ? JSON.parse(firma.meta).motivo || null : null,
          actorEmail: firma.actorId ? actorMap.get(firma.actorId) || null : null,
          at: firma.createdAt,
        }
      : null;
    const row = rows.find((r) => r.code === f.code);
    const firmaValida = Boolean(firmaInfo && lastF0 && firmaInfo.at.getTime() > lastF0.at.getTime());

    const estat = calcEstatFont({
      active: row?.active ?? true,
      diesDesdeUltimaOk: diesDesde(ultimaOk?.createdAt ?? null),
      slaDies: f.slaDies,
      ultimaRunStatus: ultimaRun?.status ?? null,
      lastF0Veredicte: lastF0?.veredicte ?? null,
      firmaValida,
    });

    return {
      ...f,
      active: row?.active ?? true,
      dbUrl: row?.url || f.url,
      estat: estat.estat,
      pct: estat.pct,
      motius: estat.motius,
      dies: diesDesde(ultimaOk?.createdAt ?? null),
      ultimaOk: ultimaOk
        ? {
            at: ultimaOk.createdAt,
            source: ultimaOk.source,
            rowsTotal: ultimaOk.rowsTotal,
            created: ultimaOk.created,
            updated: ultimaOk.updated,
            skipped: ultimaOk.skipped,
          }
        : null,
      ultimaRun: ultimaRun
        ? { at: ultimaRun.createdAt, status: ultimaRun.status, source: ultimaRun.source, error: ultimaRun.error }
        : null,
      lastF0,
      firma: firmaInfo,
      firmaValida,
      importacioOk: importacioDesbloquejada(lastF0, firmaInfo),
      lastVerificar: verificar
        ? { at: verificar.createdAt, meta: verificar.meta ? JSON.parse(verificar.meta) : null }
        : null,
      procediments: {
        auditar: procedimentAuditar(f),
        importar: PROCEDIMENT_IMPORTAR,
        rollback: PROCEDIMENT_ROLLBACK,
      },
    };
  });

  // banner d'alertes (taula 11): fonts en AVISO/CRITICO ordenades per gravetat
  const ordre: Record<string, number> = { CRITICO: 0, AVISO: 1, PAUSADA: 2, VIGENTE: 3 };
  const alertes = fonts
    .filter((f) => f.estat === "CRITICO" || f.estat === "AVISO")
    .sort((a, b) => ordre[a.estat] - ordre[b.estat])
    .map((f) => ({ code: f.code, nom: f.nom, estat: f.estat, motius: f.motius, dies: f.dies, sla: f.slaDies }));

  // KPI-1 · frescura mitjana de les fonts amb import OK registrada
  const fontsAmbOk = fonts.filter((f) => f.dies !== null);
  const frescuraMitjana =
    fontsAmbOk.length > 0
      ? Math.round(fontsAmbOk.reduce((acc, f) => acc + (f.dies || 0), 0) / fontsAmbOk.length)
      : null;

  return NextResponse.json({
    fonts,
    kpis: {
      frescuraMitjana,
      munisTotal,
      munisRent,
      munisComarca,
      errorRate90,
      runs90: runs90.length,
      errors90,
      zmrt,
      alertes,
    },
  });
}

/** GET ?informe=X — informe JSON descarregable d'una font (traçabilitat). */
async function informeJson(code: string) {
  const f = fontPerCodi(code);
  if (!f) return NextResponse.json({ error: "UNKNOWN_FONT" }, { status: 404 });
  const [runs, audits] = await Promise.all([
    db.importRun.findMany({
      where: { OR: f.runPrefixes.map((p) => ({ source: { startsWith: p } })) },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.auditLog.findMany({
      where: { action: { in: ACCIONS_AUDIT }, target: code },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  const body = {
    informe: "dades-fuentes",
    versio: "v71",
    font: { code: f.code, nom: f.nom, institucio: f.institucio, llicencia: f.llicencia, slaDies: f.slaDies, auditSlug: f.auditSlug },
    generat: new Date().toISOString(),
    importRuns: runs,
    registres: audits,
  };
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="informe_${f.code}_${stamp}.json"`,
    },
  });
}

/** POST — accions de l'administrador (taula 12 del pla). */
export async function POST(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const action = String(body?.action || "");
  if (!(ACCIONS_FONT as readonly string[]).includes(action)) {
    return NextResponse.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
  }
  const code = String(body?.code || "");
  const f = fontPerCodi(code);
  if (!f) return NextResponse.json({ error: "UNKNOWN_FONT" }, { status: 404 });
  await ensureFontsPanel();

  const audit = (a: string, meta: unknown) =>
    db.auditLog.create({
      data: { actorId: admin.id, action: a, target: code, meta: JSON.stringify(meta ?? {}) },
    });

  switch (action) {
    case "auditar_iniciar": {
      const run = await db.importRun.create({
        data: { source: code, status: "AUDIT", createdBy: admin.id },
      });
      await audit("DATOS_AUDIT_START", { runId: run.id, procediment: procedimentAuditar(f) });
      return NextResponse.json({ ok: true, runId: run.id, comandos: procedimentAuditar(f), message: "SOLICITUD_REGISTRADA" });
    }

    case "auditar_registrar": {
      const veredicte = String(body?.veredicte || "");
      if (!["GO", "NO_GO", "GO_CONDICIONAL"].includes(veredicte)) {
        return NextResponse.json({ error: "BAD_VEREDICTE" }, { status: 400 });
      }
      const controles = Math.max(0, Math.min(12, parseInt(String(body?.controles ?? "0"), 10) || 0));
      if (veredicte === "GO" && controles !== 12) {
        return NextResponse.json({ error: "GO_REQUIRES_12", message: "GO exigeix 12/12 controls verds." }, { status: 400 });
      }
      const sha256 = String(body?.sha256 || "").trim().slice(0, 64) || null;
      const notas = String(body?.notas || "").trim().slice(0, 500) || null;
      await audit("DATOS_F0_AUDIT", { veredicte, controles, sha256, notas, font: f.code });
      return NextResponse.json({ ok: true, message: "F0_REGISTRAT" });
    }

    case "firma_f0": {
      const motivo = String(body?.motivo || "").trim();
      if (motivo.length < 4) {
        return NextResponse.json({ error: "MOTIVO_REQUIRED", message: "El motiu de la firma és obligatori." }, { status: 400 });
      }
      await audit("DATOS_F0_FIRMA", { motivo: motivo.slice(0, 500) });
      return NextResponse.json({ ok: true, message: "FIRMA_REGISTRADA" });
    }

    case "importar": {
      const confirm = String(body?.confirm || "").trim();
      if (confirm !== `IMPORTAR ${code}`) {
        return NextResponse.json({ error: "CONFIRM_REQUIRED", message: `Escriu «IMPORTAR ${code}» per confirmar.` }, { status: 400 });
      }
      const [auditF0, firma] = await Promise.all([
        db.auditLog.findFirst({ where: { action: "DATOS_F0_AUDIT", target: code }, orderBy: { createdAt: "desc" } }),
        db.auditLog.findFirst({ where: { action: "DATOS_F0_FIRMA", target: code }, orderBy: { createdAt: "desc" } }),
      ]);
      const metaF0 = auditF0?.meta ? JSON.parse(auditF0.meta) : {};
      const lastF0 = auditF0
        ? { veredicte: String(metaF0.veredicte || "?"), controles: Number(metaF0.controles) || 0, at: auditF0.createdAt }
        : null;
      const firmaInfo = firma ? { at: firma.createdAt } : null;
      if (!importacioDesbloquejada(lastF0, firmaInfo)) {
        return NextResponse.json(
          {
            error: "F0_BLOQUEJAT",
            message:
              "Importació bloquejada: exigeix auditoria F0 12/12 (GO) o firma humana de C9/C10 posterior (GO-CONDICIONAL).",
          },
          { status: 409 },
        );
      }
      await audit("DATOS_IMPORT_SOLICIT", {
        confirm,
        f0: lastF0 ? { veredicte: lastF0.veredicte, controles: lastF0.controles, at: lastF0.at } : null,
        firma: Boolean(firmaInfo),
        backup: "backup_pg.sh obligatori previ",
        procediment: PROCEDIMENT_IMPORTAR,
      });
      return NextResponse.json({ ok: true, comandos: PROCEDIMENT_IMPORTAR, message: "IMPORT_SOLICITAT" });
    }

    case "importar_registrar": {
      const status = String(body?.status || "");
      if (!["OK", "PARTIAL", "ERROR"].includes(status)) {
        return NextResponse.json({ error: "BAD_STATUS" }, { status: 400 });
      }
      const num = (v: unknown) => Math.max(0, parseInt(String(v ?? "0"), 10) || 0);
      const run = await db.importRun.create({
        data: {
          source: code,
          status,
          rowsTotal: num(body?.rowsTotal),
          created: num(body?.created),
          updated: num(body?.updated),
          skipped: num(body?.skipped),
          error: String(body?.error || "").trim().slice(0, 300) || null,
          createdBy: admin.id,
        },
      });
      await audit("DATOS_IMPORT_RESULT", { runId: run.id, status });
      return NextResponse.json({ ok: true, runId: run.id, message: "IMPORT_REGISTRAT" });
    }

    case "verificar": {
      const t0 = Date.now();
      let ok = false;
      let munisTotal: number | null = null;
      let munisRent: number | null = null;
      let zmrt: number | null = null;
      try {
        await db.$queryRaw`SELECT 1`;
        [munisTotal, munisRent] = await Promise.all([
          db.municipality.count(),
          db.municipality.count({ where: { rentLatest: { not: null } } }),
        ]);
        try {
          const q = (await db.$queryRaw<Array<{ n: number }>>`SELECT count(*)::int AS n FROM "geo"."municipis" WHERE "zmrt" IS TRUE`) as Array<{ n: number }>;
          zmrt = q?.[0]?.n ?? null;
        } catch {
          zmrt = null;
        }
        // KPI-2 (≥690 amb sèrie) + ZMRT 302 (si la capa geo és accessible)
        ok = munisTotal >= 940 && munisRent >= 690 && (zmrt === null || zmrt === 302);
      } catch {
        ok = false;
      }
      const meta = { munisTotal, munisRent, zmrt, verificacioOk: ok, latenciaMs: Date.now() - t0 };
      await audit("DATOS_VERIFICAR", meta);
      return NextResponse.json({ ok: true, ...meta, message: ok ? "VERIFICACIO_OK" : "VERIFICACIO_KO" });
    }

    case "rollback": {
      const confirm = String(body?.confirm || "").trim();
      if (confirm !== `ROLLBACK ${code}`) {
        return NextResponse.json({ error: "CONFIRM_REQUIRED", message: `Escriu «ROLLBACK ${code}» per confirmar.` }, { status: 400 });
      }
      await audit("DATOS_ROLLBACK_SOLICIT", { confirm, procediment: PROCEDIMENT_ROLLBACK });
      return NextResponse.json({ ok: true, comandos: PROCEDIMENT_ROLLBACK, message: "ROLLBACK_SOLICITAT" });
    }

    case "pausar": {
      const motivo = String(body?.motivo || "").trim();
      if (motivo.length < 4) {
        return NextResponse.json({ error: "MOTIVO_REQUIRED", message: "El motiu és obligatori per pausar." }, { status: 400 });
      }
      await db.dataSource.update({ where: { code }, data: { active: false } });
      await audit("DATOS_FONT_PAUSE", { motivo: motivo.slice(0, 500) });
      return NextResponse.json({ ok: true, message: "FONT_PAUSADA" });
    }

    case "activar": {
      await db.dataSource.update({ where: { code }, data: { active: true } });
      await audit("DATOS_FONT_ACTIVATE", {});
      return NextResponse.json({ ok: true, message: "FONT_ACTIVADA" });
    }
  }
  return NextResponse.json({ error: "UNKNOWN_ACTION" }, { status: 400 });
}
