/**
 * Verificació estructural de la Fase 1 (registre i autenticació).
 * No requereix BD: comprova codi font + unitats pures.
 * Executar: npx tsx scripts/test_auth_fase1.ts
 */
import * as fs from "fs";
import * as path from "path";
import { maskEmail } from "../src/lib/security";

const ROOT = path.join(process.cwd());
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf-8");

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : " — " + detail}`);
};

// ── 1. Unitats pures: maskEmail ─────────────────────────────────────────────
check("maskEmail('joan.perez@gmail.com') === 'jo***@gmail.com'", maskEmail("joan.perez@gmail.com") === "jo***@gmail.com");
check("maskEmail('a@b.cat') === 'a***@b.cat'", maskEmail("a@b.cat") === "a***@b.cat");
check("maskEmail('@ruin') === '***'", maskEmail("@ruin") === "***");
check("maskEmail('') === '***'", maskEmail("") === "***");

// ── 2. i18n: paritat ca/es de les claus noves ───────────────────────────────
const i18n = read("src/lib/i18n.ts");
const NEW_AUTH_KEYS = ["checkEmailTitle", "checkEmailDesc1", "checkEmailDesc2", "checkEmailResend", "checkEmailResent", "checkEmailNoAccount", "checkEmailContinue", "checkEmailLogin"];
for (const k of NEW_AUTH_KEYS) {
  const n = (i18n.match(new RegExp(k + ":", "g")) || []).length;
  check(`i18n auth.${k} present a ca+es`, n >= 2, `trobades ${n}`);
}
for (const k of ["title", "desc", "resend", "sent", "goToPanel"]) {
  // dins del bloc map.verify (2 blocs: ca + es)
  const n = (i18n.match(new RegExp(`verify: \\{`, "g")) || []).length;
  check(`i18n map.verify bloc x2 (${k})`, n === 2, `blocs verify: ${n}`);
  break;
}

// ── 3. Dispatcher: les 2 rutes noves hi són ────────────────────────────────
const dispatcher = read("src/app/api/[[...path]]/route.ts");
check("dispatcher enruta /api/account/activity", dispatcher.includes('seg: ["account", "activity"]'));
check("dispatcher enruta /api/auth/sessions/revoke-all", dispatcher.includes('seg: ["auth", "sessions", "revoke-all"]'));

// ── 4. lookup: bloqueig de verificació AL SERVIDOR ─────────────────────────
const lookup = read("src/app/api/_impl/lookup/route.ts");
check("lookup: porta 403 EMAIL_NOT_VERIFIED abans de la quota",
  lookup.indexOf("EMAIL_NOT_VERIFIED") < lookup.indexOf("canConsult(session.id"));
check("lookup: els ADMIN no queden bloquejats", lookup.includes('session.role !== "ADMIN"'));
check("lookup: correu emmascarat a la resposta", lookup.includes("maskEmail(session.email)"));

// ── 5. verify: estats diferenciats + invalidació creuada ───────────────────
const verify = read("src/app/api/_impl/auth/verify/route.ts");
check("verify: redirect ja_usat", verify.includes("verificacio=ja_usat"));
check("verify: redirect caducat", verify.includes("verificacio=caducat"));
check("verify: invalida altres tokens en verificar", verify.includes("emailToken.updateMany"));
check("verify: event EMAIL_VERIFIED", verify.includes('"EMAIL_VERIFIED"'));

// ── 6. register/login: camps nous per a la UI ──────────────────────────────
check("register: verificationSent=true", read("src/app/api/_impl/auth/register/route.ts").includes("verificationSent: true"));
check("login: emailVerified a la resposta", read("src/app/api/_impl/auth/login/route.ts").includes("emailVerified: Boolean(user.emailVerifiedAt)"));

// ── 7. password-reset confirm: invalidació d'altres tokens ─────────────────
const pwconfirm = read("src/app/api/_impl/auth/password-reset/confirm/route.ts");
check("reset confirm: anul·la altres enllaços pendents", pwconfirm.includes("passwordToken.updateMany"));

// ── 8. Google: correu verificat d'ofici ────────────────────────────────────
const gcb = read("src/app/api/_impl/auth/google/callback/route.ts");
check("google callback: emailVerifiedAt en crear compte", gcb.includes("emailVerifiedAt: new Date()"));
check("google callback: backfill si faltava", gcb.includes("!user.emailVerifiedAt"));

// ── 9. Sessions: revocació d'altres dispositius ────────────────────────────
const revokeAll = read("src/app/api/_impl/auth/sessions/revoke-all/route.ts");
check("revoke-all: requereix sessió", revokeAll.includes("requireUser"));
check("revoke-all: incrementa tokenVersion (revokeSessions)", revokeAll.includes("revokeSessions(user.id)"));
check("revoke-all: manté sessió actual (createSessionFor)", revokeAll.includes("createSessionFor(fresh)"));

// ── 10. UI: pantalles i navegació ──────────────────────────────────────────
const shell = read("src/components/AppShell.tsx");
check("AppShell: ruta /revisa-correu", shell.includes('"/revisa-correu" && <CheckEmailView />'));
const authView = read("src/components/views/AuthView.tsx");
check("AuthView: registre → revisa-correu", authView.includes('navigate("/revisa-correu")'));
check("AuthView: login condicional segons emailVerified", authView.includes('d.user?.emailVerified ? "/mapa" : "/revisa-correu"'));
const mapView = read("src/components/views/MapView.tsx");
check("MapView: gestiona 403 EMAIL_NOT_VERIFIED", mapView.includes('"EMAIL_NOT_VERIFIED"') && mapView.includes('panelState === "verificacio"'));
const panel = read("src/components/views/PanelView.tsx");
check("PanelView: estats ja_usat/caducat/invalid", panel.includes("ja_usat") && panel.includes("caducat") && panel.includes('"invalid"'));
check("PanelView: botó sessions altres dispositius", panel.includes("/api/auth/sessions/revoke-all"));
check("PanelView: activitat recent del compte", panel.includes("/api/account/activity") && panel.includes("activityLabel"));

// ── 11. BD: cap canvi d'esquema requerit ───────────────────────────────────
const schema = read("prisma/schema.prisma");
check("schema: User.emailVerifiedAt existeix (cap migració nova)", schema.includes("emailVerifiedAt"));
check("schema: User.tokenVersion existeix", schema.includes("tokenVersion"));
check("schema: EmailToken i PasswordToken existeixen", schema.includes("model EmailToken") && schema.includes("model PasswordToken"));

console.log(failures === 0 ? "\n✓ TOTES LES VERIFICACIONS PASSEN (Fase 1)" : `\n✗ ${failures} verificacions fallades`);
process.exit(failures === 0 ? 0 : 1);
