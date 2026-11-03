/**
 * Tests unitaris PreuReal.cat (bun test).
 * Execució: bun test tests/unit.test.ts
 */
import { describe, expect, test } from "bun:test";
import { normalizeEmail } from "../src/lib/email";
import { escapeHtml, htmlToText, sanitizeName, clientIp, hashIp } from "../src/lib/security";
import { PLANS } from "../src/lib/plans";

describe("normalizeEmail (anti-abús Gmail)", () => {
  test("elimina punts i +alias de Gmail", () => {
    expect(normalizeEmail("joan.perez+app@gmail.com")).toBe("joanperez@gmail.com");
    expect(normalizeEmail("J.O.A.N@GoogleMail.com")).toBe("joan@gmail.com");
  });
  test("no toca altres proveïdors", () => {
    expect(normalizeEmail("joan.perez@outlook.com")).toBe("joan.perez@outlook.com");
    expect(normalizeEmail("us+tag@proton.me")).toBe("us+tag@proton.me");
  });
  test("entrades degenerades", () => {
    expect(normalizeEmail("   ")).toBe("");
    expect(normalizeEmail("@gmail.com")).toBe("@gmail.com");
    expect(normalizeEmail("a@")).toBe("a@");
  });
});

describe("security: escapament i sanitització", () => {
  test("escapeHtml neutralitza XSS", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
    );
  });
  test("htmlToText treu etiquetes i entitats", () => {
    expect(htmlToText("<p>Hola <b>mon</b> &amp; gent</p>")).toBe("Hola mon & gent");
    expect(htmlToText('<img src=x onerror=alert(1)>hola')).toBe("hola");
  });
  test("sanitizeName treu < > i control", () => {
    expect(sanitizeName('<script>alert("x")</script>Juan')).toBe("scriptalert(\"x\")/scriptJuan");
    expect(sanitizeName("  Ana María  ")).toBe("Ana María");
    expect(sanitizeName("")).toBeNull();
  });
  test("hashIp és SHA-256 estable i diferent per IPs diferents", () => {
    const a = hashIp("1.2.3.4");
    expect(a).toBe(hashIp("1.2.3.4"));
    expect(a).not.toBe(hashIp("1.2.3.5"));
    expect(a.length).toBe(32);
  });
  test("clientIp (P1.5): confia en l'ÚLTIM valor de x-forwarded-for, mai el primer", () => {
    // el client pot falsificar el primer valor; el darrer el posa el proxy de confiança
    const req = new Request("https://x.cat", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } });
    expect(clientIp(req)).toBe("10.0.0.1");
  });
  test("clientIp (P1.5): x-real-ip té prioritat (la posa l'edge, no spoofable)", () => {
    const req = new Request("https://x.cat", {
      headers: { "x-real-ip": "77.1.2.3", "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
    });
    expect(clientIp(req)).toBe("77.1.2.3");
  });
  test("clientIp (P1.5): rebutja valors no-IP i cau en 'local' (fail-closed)", () => {
    const spoof = new Request("https://x.cat", { headers: { "x-forwarded-for": "hack; drop table" } });
    expect(clientIp(spoof)).toBe("local");
    const ipv6 = new Request("https://x.cat", { headers: { "x-forwarded-for": "2a01:c800::1" } });
    expect(clientIp(ipv6)).toBe("2a01:c800::1");
  });
});

describe("plans: valors per defecte", () => {
  test("FREE 3 consultes, il·limitats -1, features correctes", () => {
    expect(PLANS.FREE.quotaMonth).toBe(3);
    expect(PLANS.PREMIUM.quotaMonth).toBe(-1);
    expect(PLANS.PRO.features.exportCsv).toBe(true);
    expect(PLANS.FREE.features.exportCsv).toBe(false);
    expect(PLANS.PREMIUM.features.preferits).toBe(true);
    expect(PLANS.PREMIUM.features.pdfEdifici).toBe(false);
    expect(PLANS.PRO.features.pdfEdifici).toBe(true);
  });
});
