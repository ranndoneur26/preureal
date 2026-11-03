/**
 * Diagnóstico de envío de correo: lee los últimos registros de EmailLog
 * (solo lectura) para ver el estado y el error real devuelto por Resend.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.emailLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      to: true,
      subject: true,
      provider: true,
      status: true,
      error: true,
      createdAt: true,
    },
  });

  if (rows.length === 0) {
    console.log("SIN REGISTROS: la tabla EmailLog está vacía.");
    return;
  }

  for (const r of rows) {
    const mask = (t: string) => {
      const [user, domain] = t.split("@");
      if (!domain) return t.slice(0, 3) + "***";
      const u = user.length <= 2 ? user[0] + "*" : user.slice(0, 2) + "***";
      return `${u}@${domain}`;
    };
    const line = [
      r.createdAt.toISOString(),
      `provider=${r.provider}`,
      `status=${r.status}`,
      `to=${mask(r.to)}`,
      `subject=${r.subject.slice(0, 50)}`,
    ].join(" | ");
    console.log(line);
    if (r.error) console.log(`   ERROR -> ${r.error.slice(0, 400)}`);
  }
}

main()
  .catch((e) => {
    console.error("DB_ERROR:", e instanceof Error ? e.message : String(e));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
