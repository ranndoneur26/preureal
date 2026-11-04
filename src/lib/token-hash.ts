import * as crypto from "crypto";

/**
 * P0 (auditoria correu v19): a la BD només es guarda el HASH del token, mai el
 * token cru. El token original viatja ÚNICAMENT dins del correu; si la BD es
 * filtra, els enllaços pendents no són utilitzables (el token té 192 bits
 * d'entropia: el SHA-256 és irreversible a la pràctica).
 *
 * Sense salt: el token és aleatori d'alta entropia (no escollit per l'usuari),
 * i la cerca és per igualtat exacta (findUnique on token).
 */
export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}
