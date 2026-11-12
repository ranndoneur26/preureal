import { describe, test, expect } from "bun:test";
import {
  generateTotpSecret,
  totpNow,
  verifyTotp,
  otpauthUri,
  encryptTotpSecret,
  decryptTotpSecret,
  generateRecoveryCodes,
  normalizeRecoveryCode,
} from "../src/lib/totp";

/**
 * Tests del 2FA TOTP (v37).
 * Vector oficial RFC 6238 (apèndix B): secret ASCII "12345678901234567890"
 * → base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ; a T=59 s el HOTP de 6 dígits
 * és 287082 (els vectors del RFC són de 8 dígits: 94287082).
 */

const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("2FA TOTP (RFC 6238)", () => {
  test("vector oficial del RFC: T=59s → 287082", () => {
    expect(totpNow(RFC_SECRET, 59_000)).toBe("287082");
  });

  test("vector oficial del RFC: T=1111111109s → 081804", () => {
    expect(totpNow(RFC_SECRET, 1_111_111_109_000)).toBe("081804");
  });

  test("verifyTotp accepta el codi vigent i la finestra ±1 pas", () => {
    const t = 59_000_000; // 16,4 h — prou lluny de l'origen per testejar la finestra
    expect(verifyTotp(RFC_SECRET, totpNow(RFC_SECRET, t), t)).toBe(true);
    // pas anterior (t - 30 s) també vàlid amb finestra ±1
    expect(verifyTotp(RFC_SECRET, totpNow(RFC_SECRET, t - 30_000), t)).toBe(true);
    // 3 passos de diferència: fora de finestra
    expect(verifyTotp(RFC_SECRET, totpNow(RFC_SECRET, t - 90_000), t)).toBe(false);
  });

  test("verifyTotp rebutja codis malformats i secrets buits", () => {
    expect(verifyTotp(RFC_SECRET, "abc", 59_000)).toBe(false);
    expect(verifyTotp(RFC_SECRET, "", 59_000)).toBe(false);
    expect(verifyTotp("", "287082", 59_000)).toBe(false);
  });

  test("generateTotpSecret: base32 de 32 caràcters, únic per crida", () => {
    const s1 = generateTotpSecret();
    const s2 = generateTotpSecret();
    expect(s1).toHaveLength(32);
    expect(/^[A-Z2-7]+$/.test(s1)).toBe(true);
    expect(s1).not.toBe(s2);
  });

  test("otpauth:// ben format amb emissor i compte", () => {
    const uri = otpauthUri("usuari@example.cat", "ABCD234567");
    expect(uri.startsWith("otpauth://totp/Preureal%3Ausuari%40example.cat?")).toBe(true);
    expect(uri).toContain("secret=ABCD234567");
    expect(uri).toContain("issuer=Preureal");
  });

  test("xifrat AES-GCM: roundtrip i dany = null (mai llança)", () => {
    const enc = encryptTotpSecret(RFC_SECRET);
    expect(enc.startsWith("v1.")).toBe(true);
    expect(enc).not.toContain(RFC_SECRET);
    expect(decryptTotpSecret(enc)).toBe(RFC_SECRET);
    expect(decryptTotpSecret(enc.slice(0, -4) + "AAAA")).toBeNull();
    expect(decryptTotpSecret("garbage")).toBeNull();
    expect(decryptTotpSecret(null)).toBeNull();
  });

  test("codis de recuperació: format XXXXX-XXXXX i normalització", () => {
    const codes = generateRecoveryCodes(10);
    expect(codes).toHaveLength(10);
    for (const c of codes) expect(/^[0-9A-F]{5}-[0-9A-F]{5}$/.test(c)).toBe(true);
    expect(normalizeRecoveryCode("  a1b2c-d3e4f ")).toBe("A1B2C-D3E4F");
  });
});
