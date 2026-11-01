import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, revokeSessions } from "@/lib/auth";
import { sanitizeName, audit } from "@/lib/security";

/**
 * PATCH /api/account  { name?, locale? }        — edita el perfil (Fase 6)
 * DELETE /api/account { confirm: "ESBORRA" }    — eliminació del compte (RGPD)
 *
 * L'eliminació esborra dades personals (nom, correu, hash) i anonimitza els
 * registres d'ús que tenen valor estadístic (SearchLog/Event), preservant
 * agregats sense dades personals.
 */
export async function PATCH(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const data: { name?: string | null; locale?: string } = {};
  if (body?.name !== undefined) data.name = body.name === null ? null : sanitizeName(String(body.name));
  if (body?.locale === "es" || body?.locale === "ca") data.locale = body.locale;
  const updated = await db.user.update({ where: { id: user.id }, data });
  return NextResponse.json({
    ok: true,
    user: { id: updated.id, email: updated.email, name: updated.name, locale: updated.locale },
  });
}

export async function DELETE(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (body?.confirm !== "ESBORRA") {
    return NextResponse.json({ error: "CONFIRM_REQUIRED" }, { status: 400 });
  }

  await db.$transaction([
    // dades personals directes
    db.favorite.deleteMany({ where: { userId: user.id } }),
    db.savedComparison.deleteMany({ where: { userId: user.id } }),
    db.passwordToken.deleteMany({ where: { userId: user.id } }),
    db.emailToken.deleteMany({ where: { userId: user.id } }),
    db.subscription.deleteMany({ where: { userId: user.id } }),
    db.priceReport.deleteMany({ where: { userId: user.id } }),
    // pseudonimització d'ús històric (mètriques agregades sense PII)
    db.searchLog.updateMany({ where: { userId: user.id }, data: { userId: null } }),
    db.event.updateMany({ where: { userId: user.id }, data: { userId: null } }),
    db.emailLog.deleteMany({ where: { to: user.email } }),
  ]);
  await revokeSessions(user.id);
  await db.user.delete({ where: { id: user.id } });
  await audit(null, "ACCOUNT_DELETED", user.id, { email: "(esborrat)" });
  return NextResponse.json({ ok: true });
}
