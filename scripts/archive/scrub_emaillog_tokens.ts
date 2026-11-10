/**
 * PreuReal.cat — P0 (auditoria de correu v19): purga ÚNICA de secrets històrics.
 *
 * Què fa:
 *  1. REDACTA els tokens dins del cos guardat a EmailLog (files anteriors a
 *     v19 guardaven l'HTML sencer, amb l'enllaç ?token=... en clar).
 *  2. ESBORRA els EmailToken/PasswordToken pendents i caducats: després del
 *     canvi a hash, els tokens antics en clar ja no són utilitzables, i així
 *     no queda cap enllaç viu a la BD.
 *
 * És IDEMPOTENT: es pot executar més d'un cop sense fer dany.
 *
 * Ús (des de la carpeta del projecte, amb la connexió DIRECTA/session a la BD):
 *   DATABASE_URL="postgresql://...:5432/postgres?sslmode=require" \
 *     npx tsx scripts/scrub_emaillog_tokens.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Mateixa redacció que src/lib/mail.ts (còpia intencional per no arrossegar el bundle) */
function redactSecrets(html: string): string {
  return html.replace(/([?&]token=)[^&"'<>\s]+/gi, "$1***");
}

async function main() {
  // 1) redacció del cos històric d'EmailLog
  const rows = await db.emailLog.findMany({
    where: { body: { contains: "token=" } },
    select: { id: true, body: true },
  });
  let scrubbed = 0;
  for (const r of rows) {
    const safe = redactSecrets(r.body);
    if (safe !== r.body) {
      await db.emailLog.update({ where: { id: r.id }, data: { body: safe } });
      scrubbed++;
    }
  }

  // 2) cap token en clar utilitzable a la BD: fora els pendents i caducats
  const et = await db.emailToken.deleteMany({
    where: { OR: [{ used: false }, { expiresAt: { lt: new Date() } }] },
  });
  const pt = await db.passwordToken.deleteMany({
    where: { OR: [{ used: false }, { expiresAt: { lt: new Date() } }] },
  });

  console.log(`✓ EmailLog redactats: ${scrubbed}`);
  console.log(`✓ EmailToken esborrats: ${et.count}`);
  console.log(`✓ PasswordToken esborrats: ${pt.count}`);
  console.log("(idempotent: pots repetir-ho quan vulguis)");
}

main()
  .catch((e) => {
    console.error("✗ Error:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
