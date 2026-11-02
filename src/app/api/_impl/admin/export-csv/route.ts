import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/security";

/**
 * GET /api/admin/export-csv?type=users|reports|subscriptions|audit
 * Exportacions CSV per a administradors (Fase 12), amb auditoria de l'ús.
 */
export async function GET(req: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const type = new URL(req.url).searchParams.get("type") || "users";
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /^[=+\-@]/.test(s) ? `'${s}` : s.replace(/"/g, '""').replace(/[\r\n]+/g, " ");
  };
  const toCsv = (headers: string[], rows: unknown[][]) =>
    [headers.join(";"), ...rows.map((r) => r.map(esc).join(";"))].join("\n");

  let csv = "";
  if (type === "users") {
    const users = await db.user.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
    csv = toCsv(
      ["id", "email", "nom", "pla", "rol", "actiu", "verificat", "creat"],
      users.map((u) => [u.id, u.email, u.name, u.plan, u.role, u.active, Boolean(u.emailVerifiedAt), u.createdAt.toISOString()])
    );
  } else if (type === "reports") {
    const reports = await db.priceReport.findMany({ orderBy: { createdAt: "desc" }, take: 5000, include: { user: { select: { email: true } } } });
    csv = toCsv(
      ["id", "municipi", "preu_eur_mes", "eur_m2", "superficie_m2", "habitacions", "tipus_contracte", "estat", "usuari", "creat"],
      reports.map((r) => [r.id, r.municipalityCode, r.offerEurMonth, r.offerEurM2, r.surfaceM2, r.rooms, r.contractType, r.status, r.user?.email || "anònim", r.createdAt.toISOString()])
    );
  } else if (type === "subscriptions") {
    const subs = await db.subscription.findMany({ orderBy: { createdAt: "desc" }, take: 5000, include: { user: { select: { email: true } } } });
    csv = toCsv(
      ["id", "usuari", "pla", "estat", "demo", "periode_fi", "stripe_customer", "creat"],
      subs.map((s) => [s.id, s.user.email, s.plan, s.status, s.demo, s.currentPeriodEnd?.toISOString() || "", s.stripeCustomerId || "", s.createdAt.toISOString()])
    );
  } else if (type === "audit") {
    const logs = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 5000 });
    csv = toCsv(
      ["id", "actor", "accio", "objectiu", "meta", "data"],
      logs.map((l) => [l.id, l.actorId || "", l.action, l.target || "", l.meta || "", l.createdAt.toISOString()])
    );
  } else {
    return NextResponse.json({ error: "BAD_TYPE" }, { status: 400 });
  }

  await audit(admin.id, "CSV_EXPORT", type, undefined);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="preureal_admin_${type}.csv"`,
    },
  });
}
