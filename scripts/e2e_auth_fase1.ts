/**
 * E2E de la Fase 1 (registre i autenticació) contra el servidor de producció
 * local (standalone) amb la BD PostgreSQL local del sandbox. NO toca producció.
 *
 * Prerequisits:
 *   bash scripts/pg_local.sh start
 *   DATABASE_URL='postgresql://preureal@127.0.0.1:5432/preureal' npx prisma migrate deploy
 *   PORT=3100 DATABASE_URL=... AUTH_SECRET=e2e node .next/standalone/server.js &
 *   npx tsx scripts/e2e_auth_fase1.ts
 */
import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import { hashToken } from "../src/lib/token-hash";

const db = new PrismaClient();
const BASE = process.env.E2E_BASE || "http://127.0.0.1:3100";
const EMAIL = `e2e-fase1-${Date.now()}@test.preureal.local`;
const PW1 = "Contrasenya-E2E-1";
const PW2 = "Contrasenya-E2E-2";

let failures = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (!cond) failures++;
  console.log(`${cond ? "✓" : "✗"} ${name}${cond || !detail ? "" : " — " + detail}`);
};

/** fetch amb límit de temps (evita colgaments d'undici de 300 s). */
const f = (url: string, init: RequestInit = {}) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });

async function main() {
  // ── fixtures locals (BD de prova del sandbox, s'esborren al final) ──
  const mun = await db.municipality.create({
    data: {
      code: `T${Date.now()}`.slice(0, 10),
      name: "E2E Test",
      province: "Barcelona",
      lat: 41.3874,
      lng: 2.1686,
      rentLatest: 985.5,
      rentPeriod: "2025",
      isTense: false,
    },
  });
  const bld = await db.building.create({
    data: {
      externalId: `E2E-${Date.now()}`,
      municipalityCode: mun.code,
      polygonJson: "[[[2.168,41.387],[2.169,41.387],[2.169,41.388],[2.168,41.388],[2.168,41.387]]]",
      centroidLat: 41.3875,
      centroidLng: 2.1685,
      avgRentEurMonth: 1010.25,
      sampleSize: 12,
    },
  });

  let cookie = "";
  const authedFetch = (path: string, init: RequestInit = {}) =>
    f(BASE + path, {
      ...init,
      redirect: "manual",
      headers: { ...(init.headers || {}), ...(cookie ? { Cookie: cookie } : {}) },
    });
  const saveCookie = (res: Response) => {
    const sc = res.headers.getSetCookie?.() || [];
    for (const c of sc) if (c.startsWith("pr_session=")) cookie = c.split(";")[0];
  };

  // ── 1. registre ──
  console.log("· [1] registre…");
  const reg = await f(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PW1, name: "E2E Fase1", locale: "ca" }),
  });
  const regBody = await reg.json();
  saveCookie(reg);
  ok("registre 200", reg.status === 200, String(reg.status));
  ok("registre verificationSent:true", regBody.verificationSent === true);

  // correu de verificació (sandbox → EmailLog)
  await new Promise((r) => setTimeout(r, 400));
  const vmail = await db.emailLog.findFirst({
    where: { to: EMAIL, subject: { contains: "Verifica" } },
    orderBy: { createdAt: "desc" },
  });
  ok("correu de verificació enregistrat (sandbox EmailLog)", !!vmail);

  // ── 2. lookup sense verificar → 403 EMAIL_NOT_VERIFIED (bloqueig servidor) ──
  console.log("· [2] lookup sense verificar…");
  const lk1 = await authedFetch("/api/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: 41.3875, lng: 2.1685, buildingId: bld.id }),
  });
  const lk1Body = await lk1.json();
  ok("lookup sense verificar → 403", lk1.status === 403, String(lk1.status));
  ok("error EMAIL_NOT_VERIFIED", lk1Body.error === "EMAIL_NOT_VERIFIED");
  ok("correu emmascarat a la resposta", typeof lk1Body.email === "string" && lk1Body.email.includes("***"));

  // ── 3. verificació del correu (validació AL SERVIDOR) ──
  console.log("· [3] verificació del correu…");
  const et = await db.emailToken.findFirst({
    where: { user: { email: EMAIL } },
    orderBy: { createdAt: "desc" },
  });
  ok("token de verificació enregistrat pel registre", !!et);
  // v19: a la BD es guarda el HASH — creem un token propi (hash del cru) per
  // provar el flux complet, perquè el cru generat pel registre no és recuperable
  const uRow = await db.user.findUnique({ where: { email: EMAIL } });
  ok("usuari registrat existeix", !!uRow);
  const rawVerify = crypto.randomBytes(24).toString("hex");
  await db.emailToken.deleteMany({ where: { userId: uRow!.id } });
  const etOwn = await db.emailToken.create({
    data: { userId: uRow!.id, token: hashToken(rawVerify), expiresAt: new Date(Date.now() + 24 * 3600_000) },
  });
  ok("token de verificació existeix amb caducitat 24h", etOwn.expiresAt.getTime() - Date.now() > 23 * 3600_000);
  const v1 = await f(`${BASE}/api/auth/verify?token=${rawVerify}`, { redirect: "manual" });
  ok("verificació → redirect verificacio=ok", v1.status >= 300 && v1.status < 400 && (v1.headers.get("location") || "").includes("verificacio=ok"), v1.headers.get("location") || "");
  // reutilització del mateix enllaç → ja_usat (missatge específic)
  const v2 = await f(`${BASE}/api/auth/verify?token=${rawVerify}`, { redirect: "manual" });
  ok("reús de l'enllaç → verificacio=ja_usat", (v2.headers.get("location") || "").includes("verificacio=ja_usat"));
  // token caducat → caducat
  const expired = await db.emailToken.create({
    data: { userId: uRow!.id, token: hashToken("e2e-expired-token"), expiresAt: new Date(Date.now() - 3600_000) },
  });
  const v3 = await f(`${BASE}/api/auth/verify?token=e2e-expired-token`, { redirect: "manual" });
  ok("enllaç caducat → verificacio=caducat", (v3.headers.get("location") || "").includes("verificacio=caducat"));

  // ── 4. login: ara emailVerified=true ──
  console.log("· [4] login…");
  const login = await f(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PW1 }),
  });
  const loginBody = await login.json();
  saveCookie(login);
  ok("login 200", login.status === 200, String(login.status));
  ok("login emailVerified:true", loginBody.emailVerified === true);

  // ── 5. lookup verificat → funció principal desbloquejada ──
  console.log("· [5] lookup verificat…");
  const lk2 = await authedFetch("/api/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: 41.3875, lng: 2.1685, buildingId: bld.id }),
  });
  const lk2Body = await lk2.json();
  ok("lookup verificat → 200 kind:full", lk2.status === 200 && lk2Body.kind === "full", `${lk2.status} ${JSON.stringify(lk2Body).slice(0, 120)}`);
  ok("preu real del municipi a la resposta", lk2Body?.municipality?.rentLatest === 985.5);

  // ── 6. tancar sessions d'altres dispositius ──
  console.log("· [6] revoke-all…");
  const rev = await authedFetch("/api/auth/sessions/revoke-all", { method: "POST" });
  const revBody = await rev.json();
  ok("revoke-all ok:true", rev.status === 200 && revBody.ok === true, String(rev.status));

  // la sessió ANTIGA (tv anterior) ha de quedar morta; la nova (de la resposta) viu
  const oldCookie = cookie;
  const newSc = rev.headers.getSetCookie?.() || [];
  for (const c of newSc) if (c.startsWith("pr_session=")) cookie = c.split(";")[0];
  const meOld = await f(`${BASE}/api/auth/me`, { headers: { Cookie: oldCookie }, cache: "no-store" });
  const meOldBody = await meOld.json();
  ok("sessió antiga revocada (me → user:null)", meOldBody.user === null);
  const meNew = await authedFetch("/api/auth/me");
  const meNewBody = await meNew.json();
  ok("sessió actual viu després de revoke-all", meNewBody.user?.email === EMAIL);

  // ── 7. activitat del compte ──
  console.log("· [7] activitat…");
  const act = await authedFetch("/api/account/activity");
  const actBody = await act.json();
  ok("activitat: 200 amb esdeveniments", act.status === 200 && Array.isArray(actBody.events) && actBody.events.length > 0);
  const types = (actBody.events || []).map((e: any) => e.type);
  ok("activitat inclou SESSIONS_REVOKED i LOGIN", types.includes("SESSIONS_REVOKED") && types.includes("LOGIN"), types.join(","));

  // ── 8. recuperació de contrasenya completa ──
  console.log("· [8] recuperació de contrasenya…");
  const pr = await f(`${BASE}/api/auth/password-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL }),
  });
  ok("password-reset ok:true (sense revelar existència)", pr.status === 200 && (await pr.json()).ok === true);
  const pt = await db.passwordToken.findFirst({ where: { user: { email: EMAIL } }, orderBy: { createdAt: "desc" } });
  ok("PasswordToken creat amb caducitat 1h", !!pt && pt.expiresAt.getTime() - Date.now() > 55 * 60_000);
  // v19: el guardat és el HASH — per provar el confirm creem un token propi
  await db.passwordToken.deleteMany({ where: { user: { email: EMAIL } } });
  const rawReset = crypto.randomBytes(24).toString("hex");
  await db.passwordToken.create({
    data: { userId: uRow!.id, token: hashToken(rawReset), expiresAt: new Date(Date.now() + 3600_000) },
  });
  // enllaç de verificació també reenviat? (el correu ja estava verificat → no cal)
  const pc = await f(`${BASE}/api/auth/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: rawReset, password: PW2 }),
  });
  ok("confirm canvia contrasenya ok:true", pc.status === 200 && (await pc.json()).ok === true);
  // el token usat no es pot reutilitzar
  const pc2 = await f(`${BASE}/api/auth/password-reset/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: rawReset, password: PW1 }),
  });
  ok("token de reset usat → TOKEN_INVALID", pc2.status === 400);
  const login2 = await f(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PW2 }),
  });
  ok("login amb la contrasenya nova", login2.status === 200);

  // ── 9. registre duplicat → protecció ──
  console.log("· [9] registre duplicat…");
  const dup = await f(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PW1, locale: "ca" }),
  });
  ok("registre duplicat → 409 EMAIL_EXISTS", dup.status === 409);

  console.log(failures === 0 ? "\n✓ E2E FASE 1 COMPLET: TOTES LES PROVES PASSEN" : `\n✗ ${failures} proves fallades`);

  // ── neteja ──
  await db.favorite.deleteMany({ where: { user: { email: EMAIL } } });
  await db.savedComparison.deleteMany({ where: { user: { email: EMAIL } } });
  await db.passwordToken.deleteMany({ where: { user: { email: EMAIL } } });
  await db.emailToken.deleteMany({ where: { user: { email: EMAIL } } });
  await db.searchLog.deleteMany({ where: { user: { email: EMAIL } } });
  await db.event.deleteMany({ where: { userId: (await db.user.findUnique({ where: { email: EMAIL } }))?.id } });
  await db.emailLog.deleteMany({ where: { to: EMAIL } });
  await db.user.deleteMany({ where: { email: EMAIL } });
  await db.building.delete({ where: { id: bld.id } });
  await db.municipality.delete({ where: { code: mun.code } });
  console.log("✓ neteja de fixtures E2E feta");
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E ERROR:", e);
  process.exit(1);
});
