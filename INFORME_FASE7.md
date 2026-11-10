# INFORME FASE 7 — Validació final · PreuReal.cat

**Data:** 11-11-2026 · **Versió validada:** v34 (`0ae0a43`) + correccions v35
**Mètode:** sondes HTTP de només lectura contra producció (`www.preureal.com`), inspecció de BD descartada per disseny (la base de dades de producció només és accessible des de Vercel), smoke test amb navegador real, gates locals complets i contrast dels valors clau amb les fonts oficials publicades.
**Eina de validació versionada:** `scripts/fase7_validate.ts` (re-executable en qualsevol moment: `bun scripts/fase7_validate.ts`).

---

## 1. Resum executiu

| Bloc | Resultat |
|---|---|
| Sondes de producció (disponibilitat, seguretat, capçaleres, rendiment, dades) | **54 PASS / 0 FAIL** |
| Tests unitaris (`bun test`) | **52/52** ✓ |
| TypeScript (`tsc --noEmit`) | **Net** ✓ |
| ESLint | 13 avisos preexistents (verificat contra v33 amb worktree: **0 nous**) |
| Errors de consola navegant les 7 rutes | **0** |
| Contrast amb fonts oficials (INE IPVA / INE Atlas / Incasòl) | **Coherent; IPVA coincidència exacta** |
| Migracions / canvis de pagaments | **0** (només lectura + 2 correccions de text) |

**Conclusió:** el sistema compleix la verificació de la Fase 7. Les sis funcionalitats de la proposta (referència oficial, indicadors, evolució històrica, esforç econòmic, guía legal, ajudes + informes PDF) estan operatives i amb la procedència visible. Abans d'anunciar públicament queden **accions del propietari** (§7), cap de codi.

---

## 2. Qualitat de dades contra fonts oficials

| Indicador a producció | Valor | Font oficial | Veredicte |
|---|---|---|---|
| IPVA Catalunya, taxa anual 2024 | **+3,1 %** | Nota de premsa INE (IPVA base 2015, any 2024): «Cataluña y La Rioja (ambas 3,1 %) presentaron las menores subidas» | ✅ Coincidència exacta |
| Renda neta mitjana per llar, Barcelona 2024 | **49.915 €/any** | INE Atlas ADRH 2024 (publicat 19/10/2026): mitjana estatal per llar 40.605 € | ✅ Coherent (Barcelona per sobre de l'estatal; període = l'últim publicat) |
| Lloguer mitjà Barcelona 2025 (fiances) | **1.134,6 €/mes** (2024: 1.147,2) | Gencat/Incasòl Q4-2025: BCN 1.160,99 €/mes; Catalunya 884,19 € | ✅ Coherent (mitjana anual vs dada trimestral; mateixa tendència) |
| Esforç econòmic Barcelona (canari) | 792,7 € × 12 / 45.000 € = **21,14 %** | Càlcul exacte dels tests unitaris | ✅ Canari verd |

**Cobertura verificada:**

- Atlas INE renda: **947/947 municipis** de Catalunya (renda per persona i per llar); 9.240 observacions municipals per variable; sèries ESTATAL/CCAA/PROV completes.
- IPVA INE: índex i taxa anual a nivell ESTATAL/CCAA/PROV/MUNI (1.222 observacions municipals — la desagregació existent; la resta es mostra «no disponible», mai s'interpola).
- Fiances Incasòl: mostra de 200 municipis → 146 amb lloguer, **tots en rang plausible** (268–1.465 €/mes per habitatge), cadascun amb el seu període visible (2018–2025).
- Zones tensades DOGC: **exactament 171** (118 TER/3739/2026 + 53 TER/3740/2026).
- Naus industrials (v33): Zona Franca de Barcelona → **70 naus (`tipus=ind`) + 480 edificis/illes**, cap nau amb preu d'habitatge assignat (diferenciació correcta).
- Cap importació INE en estat ERROR (4 runs OK el 10-11-2026).
- Banda P25–P75 per edifici: **null per disseny** — espera el conveni Incasòl per immoble / obertura SERPAVI; la UI i el PDF ho mostren com a «no disponible» amb explicació (principi del projecte: mai s'inventa cap xifra).

---

## 3. Seguretat (verificada en producció)

- **13 rutes protegides** responen 401/403 sense sessió: compte, exportació RGPD, activitat, facturació, informes PDF, indicadors municipals ampliats, favorites, canvi de pla i totes les d'admin (usuaris, estadístiques, auditoria, ajustos de pla).
- Login amb credencials dolentes → **401** sense filtrar informació.
- Cap cookie de sessió (`pr_session`) en pàgines públiques; la cookie de sessió és `httpOnly + SameSite=Lax + Secure` (verificat al codi, `src/lib/auth.ts`).
- Capçaleres: **HSTS**, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, CSP amb `frame-ancestors`.
- Guards de pla al servidor (quota 3/mes gratis, PDF 5/30 per mes, comparador 2/6) — l'escalat de pla només via Stripe o admin.
- El `.env` del sandbox apunta a SQLite local (`file:`): **la BD de producció no és accessible des de fora de Vercel**, postura correcta.
- Deute conegut no bloquejant: 13 avisos ESLint de react-compiler/react-hooks (setState en efectes i memoització manual) a `MapView`, `ComparadorView`, `PanelView` i `use-user-plan` — preexistents a v33, no afecten el build ni el comportament; es recomana netejar-los en una fase de manteniment.

## 4. Rendiment (producció, mediana de 3 mostres)

| Endpoint | Mediana | Màx |
|---|---|---|
| `GET /` (HTML) | 12 ms | 19 ms |
| `GET /api/aid` | 9 ms | 23 ms |
| `GET /api/plans` | 231 ms | 241 ms |
| `GET /api/provenance` | 241 ms | 289 ms |
| `GET /api/municipalities?limit=200` | 687 ms | 775 ms |
| `GET /api/ine/status` | 703 ms | 718 ms |
| `GET /api/health` | 1.368 ms | 1.372 ms |
| `GET /api/indicators/status` | 1.532 ms | 1.623 ms |
| `POST /api/lookup` (teaser) | 1.764 ms | 1.961 ms |
| `GET /api/buildings` (mosaic fred ZF) | ~3 s la 1a vegada; després cau 30 dies | — |

Cap endpoint supera els 2 s de mediana. El mosaic fred d'edificis (consulta ICGC en calent) és l'únic camí lent i només es paga el primer cop per àrea.

## 5. UX (navegador real, Firefox headless)

- Les 7 rutes renderitzen correctament: `#/mapa`, `#/comparador`, `#/guia`, `#/preus`, `#/entrada`, `#/admin`, landing. **0 errors de consola** en tot el recorregut.
- Commutador **CA ⇄ ES** funcional (hero, preus, peu i formularis es tradueixen).
- Missatges de gating correctes al gratuït («fins a 2 amb el pla gratuït i fins a 6 amb Premium o Pro»).
- Formulari de recuperació d'admin (break-glass) visible a `#/admin` amb instruccions clares.
- **2 errates de text detectades i corregides en v35** (cata cs): la tagline del peu en català deia «manzana a manzana» → «illa a illa»; i el subtítol de la landing tenia un punt trencat («de l'edifici. directament») → «, directament».

## 6. Traçabilitat i procedència

`/api/provenance` exposa **10 datasets** amb font, llicència, unitat i àmbit (fiances Incasòl, DOGC tensades, ICGC RTT, ICGC Refcat, Cadastre, importació per immoble marcada «pendent d'autorització», crowdsourcing, INE IPVA, INE Atlas). Cada xifra de la web i del PDF porta font, unitat i període.

## 7. Accions pendents del PROPIETARI (cap és de codi)

1. **Catàleg d'ajudes incomplet a producció:** apareixen 2 de les 4 ajudes del seed (falten `AJUTS_LLOGUER_GENCAT` i `SERVEI_MEDIACIO_GENCAT`). Solució: entrar a `#/admin` → tab Dades → botó **«Sincronitza el catàleg»** (idempotent, carrega les 4 amb font i data).
2. **Domini `preureal.cat` no resolt (DNS):** si es vol la marca .cat, connectar el domini a Vercel (Settings → Domains) i afegir els registres DNS al registrador.
3. **Stripe real** abans de cobrar: crear preus reals, webhook amb secret, `DEMO_CHECKOUT=false`, i provar renovació + pagament fallit.
4. **Resend:** verificar el domini d'enviament i `MAIL_FROM`.
5. **Google OAuth:** redirect URI de producció si es vol activar.
6. **Textos legals:** raó social, NIF, domicili i contacte a l'avís legal / privacitat.
7. **Accés admin:** definir `ADMIN_BOOTSTRAP_CODE` a Vercel + Redeploy i recuperar el compte des de `#/admin` (i canviar-se la contrasenya).
8. **Refresc de dades:** executar el cicle trimestral (`update_all.sh`) perquè Palamós i la resta de municipis rebin l'última onada de fiances.

## 8. Veredicte

**Fase 7 SUPERADA.** Sistema validat de punta a punta amb dades oficials contrastades, seguretat verificada en producció i UX sense errors. El projecte queda en estat d'anunci públic un cop el propietari completi les accions del §7 (administració i credencials, no desenvolupament).
