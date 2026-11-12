import crypto from "node:crypto";

/**
 * 2FA TOTP (RFC 6238) — v37.
 *
 * Implementació SENSE dependències externes (node:crypto): el producte és de
 * pagament i el secret 2FA és material crític, així que:
 *  - El secret es genera localment (20 bytes → base32 RFC 4648, 32 caràcters).
 *  - El secret es guarda a la BD CIFRAT (AES-256-GCM, clau SHA-256 de
 *    AUTH_SECRET): una còpia de la BD mai conté el secret en clar.
 *  - La verificació accepta finestra ±1 pas de 30 s (drift de rellotge) amb
 *    comparació en temps constant.
 *  - Compatible amb Google Authenticator, Authy, Aegis, 1Password...
 *    (otpauth://totp/ amb SHA1/6 dígits/30 s — el perfil universal).
 */

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Secret base32 de 32 caràcters (160 bits d'entropia, recomanació RFC 4226). */
export function generateTotpSecret(): string {
  const buf = crypto.randomBytes(20);
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/, "").toUpperCase().replace(/\s+/g, "");
  let bits = "";
  for (const c of clean) {
    const v = B32.indexOf(c);
    if (v < 0) continue;
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(key: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", key).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | ((h[off + 1] & 0xff) << 16) | ((h[off + 2] & 0xff) << 8) | (h[off + 3] & 0xff);
  return String(bin % 1_000_000).padStart(6, "0");
}

export function totpNow(secretB32: string, atMs: number = Date.now()): string {
  return hotp(base32Decode(secretB32), Math.floor(atMs / 1000 / 30));
}

/** Verifica un codi de 6 dígits amb finestra ±1 pas i comparació constant. */
export function verifyTotp(secretB32: string, code: string, atMs: number = Date.now()): boolean {
  const c = String(code || "").replace(/\D/g, "");
  if (c.length !== 6) return false;
  const key = base32Decode(secretB32);
  if (key.length === 0) return false;
  const given = Buffer.from(c);
  const counter = Math.floor(atMs / 1000 / 30);
  for (let w = -1; w <= 1; w++) {
    const expected = Buffer.from(hotp(key, counter + w));
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return true;
  }
  return false;
}

/** URI per a l'app d'autenticació (escaneig QR o alta manual). */
export function otpauthUri(email: string, secret: string): string {
  const label = encodeURIComponent(`Preureal:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=Preureal&algorithm=SHA1&digits=6&period=30`;
}

// ── xifrat del secret en repòs (AES-256-GCM) ────────────────────────────────

function encKey(): Buffer {
  const s = process.env.AUTH_SECRET || "dev-secret-preureal-local";
  return crypto.createHash("sha256").update(s).digest();
}

export function encryptTotpSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return `v1.${iv.toString("base64url")}.${enc.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptTotpSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  try {
    const [v, ivB, encB, tagB] = String(stored).split(".");
    if (v !== "v1") return null;
    const d = crypto.createDecipheriv("aes-256-gcm", encKey(), Buffer.from(ivB, "base64url"));
    d.setAuthTag(Buffer.from(tagB, "base64url"));
    return Buffer.concat([d.update(Buffer.from(encB, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Codis de recuperació d'un sol ús: "XXXXX-XXXXX" (10 caràcters hex). */
export function generateRecoveryCodes(n = 10): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const hex = crypto.randomBytes(5).toString("hex").toUpperCase();
    out.push(`${hex.slice(0, 5)}-${hex.slice(5)}`);
  }
  return out;
}

/** Normalitza un codi de recuperació (majúscules, sense espais). */
export function normalizeRecoveryCode(s: string): string {
  return String(s || "").trim().toUpperCase().replace(/\s+/g, "");
}
