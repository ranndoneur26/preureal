import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireVerifiedUser, isEmailNotVerifiedError } from "@/lib/auth";
import { planAllows } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/security";

/**
 * /api/alertes — FASE 2 (plans migració progressiva), punt «Nou» de Premium:
 * ALERTES DE PREU I NORMATIVA per municipi, configurades per l'usuari
 * (model §5 «alertes_usuari» → taula UserAlert, creada a la migració
 * 20261118130000_plans_fase2_premium).
 *
 *  GET    /api/alertes            — llista les alertes de l'usuari (+ nom de municipi)
 *  POST   /api/alertes            — afegeix { municipalityCode, tipus } (PRICE|TENSE|NORMATIVA)
 *  DELETE /api/alertes?id=...     — elimina UNA alerta pròpia per id
 *
 * Revisió diària contra FONTS OFICIALS (cron /api/cron/alertes):
 *   PRICE      → fiances Incasòl via habitatge.gencat.cat (avança rentPeriod)
 *   TENSE      → llistes d'àrees tensades (DOGC 19-10-2026, TER/3739 i TER/3740)
 *   NORMATIVA  → normativa vigent consolidada (IRAV INE, resolucions, RDL 29/2026)
 * Idempotència dels correus: PriceAlertLog (única per usuari+entitat+tipus+període),
 * la mateixa taula que el flux de preferits v37 → mai dobles notificacions.
 *
 * Gating server-side: auth + correu verificat + planAllows(features.alertes)
 * → Premium i Pro (el Gratuït no canvia res: mantenim preferits amb alerta %
 * v37 intactes). Límit d'higiene: 20 alertes actives per usuari.
 */

const TIPUS = ["PRICE", "TENSE", "NORMATIVA"] as const;
type Tipus = (typeof TIPUS)[number];
/** Límit d'higiene per usuari (documentat a docs/millora-plans-fase2.md). */
const MAX_ALERTES_ACTIVES = 20;

const isEmailNotVerified = (e: unknown) =>
  isEmailNotVerifiedError(e);

async function gate() {
  let user;
  try {
    user = await requireVerifiedUser();
  } catch (e) {
    if (isEmailNotVerified(e)) {
      return { err: NextResponse.json({ error: "EMAIL_NOT_VERIFIED" }, { status: 403 }) };
    }
    return { err: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }) };
  }
  const plan = (user.plan as "FREE" | "PREMIUM" | "PRO") || "FREE";
  if (!(await planAllows(plan, "alertes"))) {
    return { err: NextResponse.json({ error: "PLAN_REQUIRED", plan: "PREMIUM" }, { status: 403 }) };
  }
  return { user, plan };
}

/** Adjunta el nom oficial del municipi a cada alerta (1 query, mapa en memòria). */
async function ambMunicipis(userId: string) {
  const alerts = await db.userAlert.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const codes = [...new Set(alerts.map((a) => a.entityKey.replace(/^MUNI:/, "")))];
  const muns = codes.length
    ? await db.municipality.findMany({
        where: { code: { in: codes } },
        select: { code: true, name: true, isTense: true, rentLatest: true, rentPeriod: true },
      })
    : [];
  const munMap = new Map(muns.map((m) => [m.code, m]));
  return {
    alerts: alerts.map((a) => {
      const m = munMap.get(a.entityKey.replace(/^MUNI:/, ""));
      return {
        ...a,
        municipi: m ? { code: m.code, name: m.name, isTense: m.isTense, rentLatest: m.rentLatest, rentPeriod: m.rentPeriod } : null,
      };
    }),
    limit: MAX_ALERTES_ACTIVES,
  };
}

export async function GET() {
  const g = await gate();
  if (g.err) return g.err;
  return NextResponse.json(await ambMunicipis(g.user!.id));
}

export async function POST(req: Request) {
  const g = await gate();
  if (g.err) return g.err;
  const user = g.user!;
  const ip = clientIp(req);
  const rl = await rateLimit(`alertes:${user.id}:${ip}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const munCode = String(body?.municipalityCode ?? "").slice(0, 6);
  const tipus = String(body?.tipus ?? "") as Tipus;
  if (!/^\d{6}$/.test(munCode)) {
    return NextResponse.json({ error: "BAD_MUNICIPALITY" }, { status: 400 });
  }
  if (!TIPUS.includes(tipus)) {
    return NextResponse.json({ error: "BAD_TIPUS", valid: TIPUS }, { status: 400 });
  }

  const mun = await db.municipality.findUnique({
    where: { code: munCode },
    select: { code: true, name: true },
  });
  if (!mun) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const actives = await db.userAlert.count({ where: { userId: user.id, activa: true } });
  if (actives >= MAX_ALERTES_ACTIVES) {
    return NextResponse.json({ error: "ALERT_LIMIT", limit: MAX_ALERTES_ACTIVES }, { status: 400 });
  }

  const entityKey = `MUNI:${munCode}`;
  // Upsert amable: si ja existia (inactiva o igual) es reactiva — mai fila doble.
  const alert = await db.userAlert.upsert({
    where: { userId_entityKey_tipus: { userId: user.id, entityKey, tipus } },
    update: { activa: true },
    create: { userId: user.id, entityKey, tipus, activa: true },
  });
  return NextResponse.json(await ambMunicipis(user.id));
}

export async function DELETE(req: Request) {
  const g = await gate();
  if (g.err) return g.err;
  const user = g.user!;
  const id = (new URL(req.url).searchParams.get("id") || "").slice(0, 40);
  if (!id) return NextResponse.json({ error: "BAD_ID" }, { status: 400 });
  // Només la seva: el where inclou userId (mai esborrar fileres d'altres).
  const del = await db.userAlert.deleteMany({ where: { id, userId: user.id } });
  if (del.count === 0) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json(await ambMunicipis(user.id));
}
