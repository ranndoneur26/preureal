import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/security";
import munisSeed from "@/data/municipalities.json";

/**
 * POST /api/admin/seed-municipalities — sincronitza la taula Municipality
 * amb src/data/municipalities.json (fiances Incasòl oficials + referència de
 * comarca dels 254 municipis sense renda publicada + Palamós recuperat).
 *
 * Idempotent (upsert per code): reexecutar només refresca les dades; mai
 * duplica files. NOMÉS escriu a Municipality (mai a usuaris, pagaments ni
 * reports). Pensat per executar-se des del panell #/admin sense necessitat
 * d'un .env local amb DATABASE_URL (mateix pla B que /api/admin/seed-aid).
 *
 * RENDIMENT (fix 2026-11-11 — «es queda pensant… bloquejat»): la versió
 * anterior feia 947 UPDATE individuals en 38 rondes seqüencials de 25
 * (~20-40 s amb la latència real de la BD): la funció serverless moria per
 * timeout ABANS de respondre i la UI es quedava penjada, encara que les
 * dades haguessin aterrat (els comptadors de /api/health pujaven mentre el
 * botó no acabava mai). Ara tot l'upsert és UNA sola sentència SQL
 * (INSERT … ON CONFLICT DO UPDATE des de json_to_recordset): 1 ida i
 * tornada, ~1-3 s. `boundary`/`boundaryFetchedAt` NO es toquen (es preserva
 * la caché ICGC) i `updatedAt` = NOW().
 *
 * contractsPeriod: el JSON el porta (els 947 municipis) però el model
 * Municipality NO el té (només contractsLatest): enviar-lo llança
 * PrismaClientValidationError «Unknown argument» i invalida el seed sencer
 * (causa arrel del SEED_FAIL de 2026-11-11, reproduïda contra un model
 * mirall). El mapping de sota només inclou camps existents al schema.
 */

interface MunRow {
  code: string;
  ineCode: string | null;
  name: string;
  comarca: string | null;
  province: string | null;
  lat: number;
  lng: number;
  rentLatest: number | null;
  rentPeriod: string | null;
  rentPrevYear: number | null;
  rentPrevPeriod: string | null;
  rentHistory: Record<string, number> | null;
  contractsLatest: number | null;
  comarcaRefLatest: number | null;
  comarcaRefPeriod: string | null;
  comarcaRefHistory: Record<string, number> | null;
  rentSource: string | null;
  isTense: boolean;
  tenseList: string | null;
}

export async function POST() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const rl = await rateLimit(`seed-municipalities:${admin.id}`, 3, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "TOO_MANY" }, { status: 429 });

  const rows = munisSeed as unknown as MunRow[];
  if (!Array.isArray(rows) || rows.length < 900) {
    return NextResponse.json(
      { error: "BAD_SEED", message: `El seed empaquetat és suspecte (${rows?.length} files).` },
      { status: 500 },
    );
  }

  // Mapping → JSON: NOMÉS camps que existeixen al model Municipality.
  const payload = rows.map((m) => ({
    code: m.code,
    ineCode: m.ineCode ?? null,
    name: m.name,
    comarca: m.comarca ?? null,
    province: m.province ?? null,
    lat: m.lat,
    lng: m.lng,
    rentLatest: m.rentLatest ?? null,
    rentPeriod: m.rentPeriod ?? null,
    rentPrevYear: m.rentPrevYear ?? null,
    rentPrevPeriod: m.rentPrevPeriod ?? null,
    rentHistory: m.rentHistory ? JSON.stringify(m.rentHistory) : null,
    contractsLatest: m.contractsLatest ?? null,
    comarcaRefLatest: m.comarcaRefLatest ?? null,
    comarcaRefPeriod: m.comarcaRefPeriod ?? null,
    comarcaRefHistory: m.comarcaRefHistory ? JSON.stringify(m.comarcaRefHistory) : null,
    rentSource: m.rentSource ?? null,
    isTense: m.isTense,
    tenseList: m.tenseList ?? null,
  }));
  const json = JSON.stringify(payload);

  try {
    // UNA sola sentència: insereix els nous i refresca els existents en 1 ida.
    const synced = await db.$executeRaw`
INSERT INTO "Municipality" (
  "code", "ineCode", "name", "comarca", "province", "lat", "lng",
  "rentLatest", "rentPeriod", "rentPrevYear", "rentPrevPeriod", "rentHistory",
  "contractsLatest", "comarcaRefLatest", "comarcaRefPeriod", "comarcaRefHistory",
  "rentSource", "isTense", "tenseList", "updatedAt")
SELECT
  x."code", x."ineCode", x."name", x."comarca", x."province", x."lat", x."lng",
  x."rentLatest", x."rentPeriod", x."rentPrevYear", x."rentPrevPeriod", x."rentHistory",
  x."contractsLatest", x."comarcaRefLatest", x."comarcaRefPeriod", x."comarcaRefHistory",
  x."rentSource", x."isTense", x."tenseList", NOW()
FROM json_to_recordset(${json}::json) AS x(
  "code" text, "ineCode" text, "name" text, "comarca" text, "province" text,
  "lat" double precision, "lng" double precision,
  "rentLatest" double precision, "rentPeriod" text, "rentPrevYear" double precision,
  "rentPrevPeriod" text, "rentHistory" text,
  "contractsLatest" int, "comarcaRefLatest" double precision, "comarcaRefPeriod" text,
  "comarcaRefHistory" text, "rentSource" text, "isTense" boolean, "tenseList" text)
ON CONFLICT ("code") DO UPDATE SET
  "ineCode" = EXCLUDED."ineCode",
  "name" = EXCLUDED."name",
  "comarca" = EXCLUDED."comarca",
  "province" = EXCLUDED."province",
  "lat" = EXCLUDED."lat",
  "lng" = EXCLUDED."lng",
  "rentLatest" = EXCLUDED."rentLatest",
  "rentPeriod" = EXCLUDED."rentPeriod",
  "rentPrevYear" = EXCLUDED."rentPrevYear",
  "rentPrevPeriod" = EXCLUDED."rentPrevPeriod",
  "rentHistory" = EXCLUDED."rentHistory",
  "contractsLatest" = EXCLUDED."contractsLatest",
  "comarcaRefLatest" = EXCLUDED."comarcaRefLatest",
  "comarcaRefPeriod" = EXCLUDED."comarcaRefPeriod",
  "comarcaRefHistory" = EXCLUDED."comarcaRefHistory",
  "rentSource" = EXCLUDED."rentSource",
  "isTense" = EXCLUDED."isTense",
  "tenseList" = EXCLUDED."tenseList",
  "updatedAt" = NOW()`;

    await audit(admin.id, "SEED_MUNICIPALITIES", null, { total: rows.length, synced }).catch(
      () => null,
    );
    return NextResponse.json({ ok: true, synced, total: rows.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await audit(admin.id, "SEED_MUNICIPALITIES_FAIL", null, {
      message: message.slice(0, 300),
    }).catch(() => null);
    return NextResponse.json({ error: "SEED_FAIL", message }, { status: 502 });
  }
}
