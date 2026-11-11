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
 * La mateixa font de veritat que el seed local (`npx tsx scripts/seed.ts`).
 * Idempotent (upsert per code): reexecutar només refresca les dades; mai
 * duplica files. NOMÉS escriu a Municipality (mai a usuaris, pagaments ni
 * reports). Pensat per executar-se des del panell #/admin sense necessitat
 * d'un .env local amb DATABASE_URL (mateix pla B que /api/admin/seed-aid).
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
  contractsPeriod?: string | null;
  comarcaRefLatest: number | null;
  comarcaRefPeriod: string | null;
  comarcaRefHistory: Record<string, number> | null;
  rentSource: string | null;
  isTense: boolean;
  tenseList: string | null;
}

function payload(m: MunRow) {
  return {
    ineCode: m.ineCode,
    name: m.name,
    comarca: m.comarca,
    province: m.province,
    lat: m.lat,
    lng: m.lng,
    rentLatest: m.rentLatest ?? null,
    rentPeriod: m.rentPeriod ?? null,
    rentPrevYear: m.rentPrevYear ?? null,
    rentPrevPeriod: m.rentPrevPeriod ?? null,
    rentHistory: m.rentHistory ? JSON.stringify(m.rentHistory) : null,
    contractsLatest: m.contractsLatest ?? null,
    contractsPeriod: m.contractsPeriod ?? null,
    comarcaRefLatest: m.comarcaRefLatest ?? null,
    comarcaRefPeriod: m.comarcaRefPeriod ?? null,
    comarcaRefHistory: m.comarcaRefHistory ? JSON.stringify(m.comarcaRefHistory) : null,
    rentSource: m.rentSource ?? null,
    isTense: m.isTense,
    tenseList: m.tenseList ?? null,
  };
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

  try {
    // 1) altes en un sol lot (normalment 0: la taula ja té els 947)
    const created = await db.municipality.createMany({
      data: rows.map((m) => ({ code: m.code, ...payload(m) })),
      skipDuplicates: true,
    });

    // 2) actualitzacions per lots paral·lels (idempotent, refresca tot)
    let updated = 0;
    const CHUNK = 25;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      await Promise.all(
        chunk.map((m) =>
          db.municipality.update({ where: { code: m.code }, data: payload(m) }).catch(() => null),
        ),
      );
      updated += chunk.length;
    }

    await audit(admin.id, "SEED_MUNICIPALITIES", null, { total: rows.length });
    return NextResponse.json({
      ok: true,
      created: created.count,
      updated,
      total: rows.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "SEED_FAIL", message: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
