import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { htmlToText } from "@/lib/security";

/**
 * GET /api/admin/emails — log de correos automáticos (solo admin).
 * SEGURETAT (V1 de l'auditoria): el cos s'entrega SEMPRE com a TEXT net
 * (les etiquetes HTML es strippen al servidor) — la UI no pot renderitzar
 * HTML controlat per l'usuari.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const emails = await db.emailLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      to: true,
      subject: true,
      provider: true,
      status: true,
      error: true,
      createdAt: true,
      body: true,
      // telemetría v19
      type: true,
      attempts: true,
      providerMessageId: true,
      sentAt: true,
    },
  });
  // SEGURETAT (V1): mai es retorna el HTML cru; només el text net
  return NextResponse.json({
    emails: emails.map(({ body, ...e }) => ({ ...e, bodyText: htmlToText(body) })),
  });
}
