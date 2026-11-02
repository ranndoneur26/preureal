/**
 * PreuReal.cat — Seed de la base de datos con datos reales.
 *
 * 1. Municipios (948) con lloguer Incasòl real (data/municipalities.json)
 * 2. Edificios reales del Eixample de Barcelona (ICGC RTT, API Territorial)
 * 3. Usuario administrador
 *
 * Ejecutar: bun run scripts/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import * as bcrypt from "bcryptjs";

const db = new PrismaClient();

const ICGC_BASE = "https://api.icgc.cat/territorial";
const UA = "PreuReal.cat/1.0 (dades obertes; +https://preureal.cat)";

async function icgcGet(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`ICGC ${res.status} ${url}`);
  return res.json();
}

interface Mun {
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
  contractsPeriod: string | null;
  isTense: boolean;
  tenseList: string | null;
}

async function seedMunicipalities() {
  const file = path.join(process.cwd(), "data", "municipalities.json");
  const muns: Mun[] = JSON.parse(fs.readFileSync(file, "utf-8"));
  let n = 0;
  for (const m of muns) {
    await db.municipality.upsert({
      where: { code: m.code },
      create: {
        code: m.code,
        ineCode: m.ineCode,
        name: m.name,
        comarca: m.comarca,
        province: m.province,
        lat: m.lat,
        lng: m.lng,
        rentLatest: m.rentLatest,
        rentPeriod: m.rentPeriod,
        rentPrevYear: m.rentPrevYear,
        rentPrevPeriod: m.rentPrevPeriod,
        rentHistory: m.rentHistory ? JSON.stringify(m.rentHistory) : null,
        contractsLatest: m.contractsLatest,
        isTense: m.isTense,
        tenseList: m.tenseList,
      },
      update: {
        rentLatest: m.rentLatest,
        rentPeriod: m.rentPeriod,
        rentPrevYear: m.rentPrevYear,
        rentPrevPeriod: m.rentPrevPeriod,
        rentHistory: m.rentHistory ? JSON.stringify(m.rentHistory) : null,
        contractsLatest: m.contractsLatest,
        isTense: m.isTense,
        tenseList: m.tenseList,
      },
    });
    n++;
  }
  console.log(`✓ Municipios insertados: ${n}`);
}

/** Descarga edificios reales (ICGC construccions-rtt) en mosaicos de ~25 ha. */
async function seedEixampleBuildings() {
  // Zona demo: Dreta de l'Eixample + Sagrada Família (Barcelona)
  const chunks: Array<[number, number, number, number]> = [
    [2.1570, 41.3870, 2.1630, 41.3920],
    [2.1630, 41.3870, 2.1690, 41.3920],
    [2.1690, 41.3870, 2.1750, 41.3920],
    [2.1570, 41.3920, 2.1630, 41.3970],
    [2.1630, 41.3920, 2.1690, 41.3970],
    [2.1690, 41.3920, 2.1750, 41.3970],
    [2.1750, 41.3900, 2.1810, 41.3950],
    [2.1510, 41.3880, 2.1570, 41.3930],
  ];
  let inserted = 0;
  for (const [w, s, e, n] of chunks) {
    const url = `${ICGC_BASE}/collections/construccions-rtt/items?bbox=${w},${s},${e},${n}&limit=3000`;
    const d = await icgcGet(url);
    const feats: any[] = d.features || [];
    for (const f of feats) {
      const p = f.properties || {};
      if (!["edi", "ill"].includes(p.tipus)) continue;
      const geom = f.geometry;
      let ring: number[][] | null = null;
      if (geom.type === "Polygon") ring = geom.coordinates[0];
      else if (geom.type === "MultiPolygon") ring = geom.coordinates[0][0];
      if (!ring || ring.length < 3) continue;
      let cx = 0, cy = 0;
      for (const [x, y] of ring) { cx += x; cy += y; }
      cx /= ring.length; cy /= ring.length;
      await db.building.upsert({
        where: { externalId: `RTT-${p.id}` },
        create: {
          externalId: `RTT-${p.id}`,
          source: "ICGC_RTT",
          municipalityCode: "080193",
          tipus: p.tipus,
          estat: p.estat,
          altura: p.altura ?? null,
          nom: p.nom || null,
          polygonJson: JSON.stringify(ring),
          centroidLat: cy,
          centroidLng: cx,
        },
        update: {
          tipus: p.tipus,
          estat: p.estat,
          altura: p.altura ?? null,
          polygonJson: JSON.stringify(ring),
          centroidLat: cy,
          centroidLng: cx,
        },
      });
      inserted++;
    }
    await new Promise((r) => setTimeout(r, 400)); // cortesía con la API
  }
  console.log(`✓ Edificios reales Eixample (ICGC RTT): ${inserted}`);
}

async function seedAdmin() {
  const email = "admin@preureal.cat";
  const password = process.env.ADMIN_PASSWORD || "PreuReal2026!";
  if (!process.env.ADMIN_PASSWORD) {
    console.warn(
      "\n⚠ ADMIN_PASSWORD no definida: el admin queda con la contraseña POR DEFECTO.\n" +
      "  Para producción (Neon/Vercel) ejecuta siempre:\n" +
      '  ADMIN_PASSWORD="una-contrasenya-forta" bun run scripts/seed.ts\n',
    );
  }
  const hash = await bcrypt.hash(password, 10);
  await db.user.upsert({
    where: { email },
    create: { email, passwordHash: hash, name: "Administració", role: "ADMIN", plan: "PRO", locale: "ca" },
    update: { role: "ADMIN" },
  });
  console.log(`✓ Admin creado: ${email} / ${password}`);
}

async function main() {
  await seedMunicipalities();
  await seedEixampleBuildings();
  await seedAdmin();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
