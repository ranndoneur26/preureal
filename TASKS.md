# TASKS — PreuReal.cat

Prioridad: **P0** bloquea / verificar primero · **P1** importante · **P2** mejora.
Ninguna tarea cambia el diseño visual sin tu autorización explícita.

## Mantenimiento de datos — Fase P0 (encàrrec 2026-11-19, v70)
- [x] **Auditoría previa F0** (`pipeline/qa/auditoria_f0.py`): 12 controles C1-C12 con puerta go/no-go — veredicto GO/NO-GO/GO-CONDICIONAL + informe JSON; selftest 13/13 verde (fixture limpio → GO · fixture con errores plantados → NO-GO con C5/C6/C8/C9 ROJO).
- [x] **Canario diario** (`scripts/canary_diario.py`): sondas API (health · zones 08019 A · 08227 B · geo/illes) + KPI-1/2/3/4/6 + baseline v69.2 (947 · 302 = A 118 · B 131 · C 53); escalado A1 (3 fallos consecutivos → CRÍTICA con estado persistido); selftest 9/9.
- [x] **Vigilancia DOGC** (`scripts/dogc_watch.py` + `dogc_baseline.json`): diff de resoluciones TER contra las 3 vigentes → CRÍTICA A3 (import < 72 h) / MEDIA revocación / MEDIA A7; selftest 6/6.
- [x] **Notificaciones email** (`pipeline/qa/notificaciones/`): envia_alerta.py (Resend + modo seco) + 5 plantillas email-safe (CRÍTICA #B23B3B · MEDIA #B8860B · BAJA #2563EB · ÉXITO #2E7D5B · DIGEST); selftest 16/16.
- [x] **Cron de mantenimiento** (`.github/workflows/mantenimiento.yml`): canario diario `0 5 * * *` · DOGC quincenal `0 8 1,15 * *` · DOGC diario ventanas `0 8 * 4,10 *` · backup+digest semanal `0 3 * * 0` · ciclo trimestral `0 3 1 1,4,7,10 *` (F0 → backup → update_all.sh → canario → email; NO-GO detiene con producción intacta) + smoke manual; vercel.json y ci.yml intactos.
- [x] **Manual + checklists** (`docs/mantenimiento/FASE_P0_IMPLEMENTACION.md`): cron tabla maestra UTC/CET-CEST + crontab VPS, pseudo-código del verificador post-actualización (mapa a implementaciones reales), matriz de alertas A1-A12 ↔ plantillas, procedimientos P-01..P-08, checklists pre/post + por fuente + firma.
- [ ] **Propietario (una vez)**: configurar secretos GitHub (`DATABASE_URL`, `RESEND_API_KEY`, `ALERT_EMAIL_TO`) — ver Anexo B del doc; ejecutar job `smoke` (4 selftests) y job `canario` manual para verificar el digest.
- [ ] **Propietario (marzo, calendario)**: ensayo completo en staging (C11/C12) con una importación real → criterio de cierre formal de la fase P0.

## Buscador invers (encàrrec 2026-11-19, v67)
- [x] **Buscador invers a la portada** (substitueix el mòdul «Consulta el preu real registrat», que passa a pàgina pròpia `/#/consulta` amb entrada de menú «Consulta ràpida»): autocompletat de municipis, targeta d'estat ZMRT amb semàfor, taula ordenable per secció censal (preu real €/m², índex €/m², % compliment amb semàfor), filtre «Mostrar només municipis no tensionats», CTA «Verificar un edifici concret en aquesta zona» → `/#/analitza?muni=` amb municipi prefilat (cercle invers→directe tancat).
- [x] **Backend**: DDL additiu `pipeline/sql/002_zones_buscador_invers.sql` (3 taules PostGIS), loader idempotent `pipeline/f4_zones_buscador.py`, API pública `GET /api/zones` (104a ruta, ORDER BY compliment DESC NULLS LAST, honesta 503/FORA_ABAST). RGPD: agregació secció censal, mai edifici/vivenda.
- [x] **Validació**: +20 tests, suite completa sense regressions noves (baseline git stash verificat), tsc+eslint nets, E2E navegador real (cerca → dades → CTA → prefil; toggle filtra; mòbil correcte; 0 errors de consola). Executat al PG local amb PostGIS: 947 municipis · 27 coberts · 1.983 seccions · 1.945 agregats.
- [x] **Decisió propietari (v68, 2026-11-19)**: «Consulta ràpida» surt del menú (desktop, mòbil i peu) — «sembla una ampliació de consulta»; el menú només ofereix «Consulta» (eina completa /analitza amb mapa ICGC). La ruta /consulta continua viva com a destí directe (guarda U7 evolucionada, zero regressions).
- [ ] **Propietari**: revisió visual de la portada amb el buscador (desktop/mòbil); decidir si el mòdul ràpid (/consulta, ara fora del menú) també mostra el mapa.
- [x] **Càrrega de producció feta (v68.1, 2026-11-19)**: F3+F4 executats contra la BD de l'app (Supabase, PostGIS 3.3.7) — dim 142.283 · 10,039 €/m² · 11.633 illes ST_IsValid · 1.983 seccions · 947 municipis (171 ZMRT) · 1.945 agregats 2025; `/api/zones` i `/api/geo/illes` serveixen dades reals (fix ST_Multi + batching execute_values, CHANGES v68.1).
- [x] **Auditoria ZMRT completa (v69, 2026-11-19)**: encàrrec del propietari — els 131 municipis de TER/2408/2024 (2a tanda, DOGC núm. 9196 de 3-7-2024) eren VIGENTS i faltaven (l'apunt «van caducar» era un error d'anàlisi); total vigent **302** = 118 A + 131 B + 53 C; migració additiva idempotent (20261119100000_zmrt_ter2408_2024_131), texts 171→302 a tot el web, `tensePublicacio` per llista (mai la data del paquet 2026 per a un municipi B), guardes v69 (9 tests) + Z9; zero col·lisions INE amb els 171 (protocol intacte).
- [x] **Capa geo en producció feta (v69.2, 2026-11-19)**: `f4_zones_buscador.py` reexecutat amb la DATABASE_URL contra Supabase — `geo.municipis` amb **302 ZMRT (A 118 · B 131 · C 53)** amb font i publicació PER LLISTA (B → «Resolució TER/2408/2024 (Generalitat)» · «DOGC 3-7-2024»); guardes pre/post verificades: els 171 A/C idèntics byte-a-byte (conjunt + valors), B 131/131 igual al repo sense cap creuament ni duplicat, agregats 1.945 i seccions 1.983 idèntics fila a fila, illes 11.633 i dim 142.283 intactes; APIs en viu: `/api/zones?muni=08019` (A · 1.053 zones · índex 11,595 €/m²) i `/api/zones?muni=08227` (B · `llista: B` · `publicacio: DOGC 3-7-2024` · cobertura FORA_ABAST_PILOT honesta) — report `f4_carga_v692.json`.
- [ ] **Propietari**: verificació visual del mapa amb 302 municipis.
- [ ] **Quan INCASÒL publiqui el fitxer seccional**: `f1 --incasol-seccional-csv` + reexecutar `f4` (passa automàticament a `nivell_dada='SECCIONAL'` + `% compliment` real per contractes; zero canvis de DDL/API — vegeu `docs/buscador-invers.md` §3/§6).

## Redisseny del formulari de la Home (encàrrec 2026-11-15, fases F0–F4)
- [x] **F1** (28b2d0f): separació UX de la Home en dues funcionalitats + etiquetes honestes + avís SERPAVI zones tensades.
- [x] **F2** (5bce5f7): nivell N1 «Estima el lloguer del teu habitatge» (fiança Incasòl × escalat superfície, rang orientatiu traçat, degradació honesta, formulari progressiu, avís legal, metodologia N1, pàgina SEO /estima).
- [x] **F3** (c9dd420): nivell N2 (estat de conservació ×0,80–1,12 ancoratge Fotocasa 2021; densitat m²/hab limitada ±5%), nivell real mai inflat, N3 documentat honestament com a no viable amb dades públiques (botó oficial SERPAVI, mai simulat), variables sense coeficient documentat NO es demanen (regla d'or).
- [x] **F4** (2026-11-16): QA integral — tests RGPD a nivell de ruta (`tests/f4_qa.test.ts`, 16 tests), invariants del motor en bateria de casos, informe de viabilitat A/B/C formalitzat (`docs/SERPAVI_VIABILITAT.md` + secció a `#/metodologia`), suite CI 100% bloquejant (10 fitxers, sense `continue-on-error`: els 2 tests antics de computeValuation ja passen), secció QA a la metodologia. Mapa, freemium i rendiment de la Home intactes.
- [ ] **Propietari**: verificació visual de `#/estima` (mòbil + desktop), del resultat N2 amb traçabilitat i de la nova secció de viabilitat a `#/metodologia`.

## Noves funcionalitats — anàlisi i valoració (encàrrec 2026-11-11)
- [x] **Fase 1 auditoria de dades** — `docs/archive/INFORME_AUDITORIA_FUNCIONALIDADES.md` (auditoria real: 692/947 munis amb sèrie Incasòl 2005–2025, Atlas INE 947/947, esforç de renta ja calculat, sense €/m² ni secció censal; 0 migracions per a les 4 funcionalitats)
- [x] **Propietari**: 6 punts del §5 validats via preguntes interactives (€/habitatge, ometre secció censal, mediana/any, valoració territorial v1, quotes 5/30, SVG propis)
- [x] **F3 esforç de renta** (v38): termòmetre + comparativa Catalunya — Premium
- [x] **F1 evolució temporal** (v38): LineChart SVG interactiu a fitxa + comparador multi-municipi — Premium (gratuït manté la mini-taula actual)
- [x] **F2 comparativa territorial** (v38): BarChart muni/comarca/província mateix any + extrems + secció censal «no disponible» — Premium
- [x] **F4 valoració** (v38): POST /api/valuation (quota VALUATION 5/30, configurable admin) + ValuationPanel al panell — Premium/Pro
- [x] Gates: tests 72/72 (+20 nous), tsc net, eslint 0 nous, dispatcher 59 rutes, sondes producció (plans flags ✓, /api/valuation 401 ✓, home/lookup ✓)
- [ ] **Propietari**: verificació visual amb compte Premium (fitxa municipi amb dada: BCN; comparador amb 3+ municipis; valoració) i, si s'escau, retoc de quotes/flags des de `#/admin`
- [ ] P2 futur: importar Atlas INE per secció censal (renda) si es vol l'esforç per secció

## Fase 7 — Validación final (2026-11-11: SUPERADA, ver `docs/archive/INFORME_FASE7.md`)
- [x] Sondes de producció 54/54 (disponibilitat, seguretat, capçaleres, rendiment, dades) — `bun scripts/fase7_validate.ts`
- [x] Contrast de valors amb fonts oficials: IPVA Catalunya 2024 = +3,1 % (coincidència exacta INE), Atlas ADRH 2024 vigent, fiances Incasòl coherents amb Gencat
- [x] Smoke test navegador: 7 rutes, 0 errors de consola, canvi CA/ES correcte
- [x] Correccions de text ca (tagline «illa a illa» + subtítol landing) — v35
- [ ] **Propietari**: prémer «Sincronitza el catàleg» a `#/admin` (falten 2 de 4 ajudes a producció)
- [x] **Propietari** (2026-11-11): domini connectat = `preureal.com` (canònic `www.preureal.com`, ja actiu a Vercel). El `.cat` NO està registrat; si més endavant es vol, registrar-lo i afegir-lo a Vercel (Settings → Domains) com a domini addicional amb redirecció. URLs residuals del `.cat` netejades en v36
- [ ] **Propietari**: Stripe real (`DEMO_CHECKOUT=false` + preus + webhook), Resend amb domini verificat, textos legals, `ADMIN_BOOTSTRAP_CODE`
- [ ] P2 futur: netejar els 13 avisos ESLint (react-compiler) a MapView/ComparadorView/PanelView/use-user-plan (preexistents, no bloquegen)

## P0 — Base verde
- [x] Build verificado en macOS (2026-11-02): Next 16.4.3, `prisma generate` y `next build` OK, TypeScript OK. Aviso no bloqueante: Next detecta un `package-lock.json` en `/Users/marcxicola` (fuera del repo); resuelto fijando `turbopack.root` en `next.config.ts`.
- [ ] Probar el flujo completo en local con Postgres: registro → login → mapa → consulta → paywall → checkout DEMO.

## P1 — Limpieza de restos de Z.ai (ver `MIGRATION_ZAI.md`)
- [x] `src/instrumentation.ts`: eliminada la lógica de `.localpg` / `pg_local.sh` (queda solo el log de conexión).
- [x] Rutas fijas `/home/z/my-project` en `gen_api_dispatcher.py`, `prepare_data.py`, `update_all.sh` → rutas relativas.
- [x] `update_all.sh`: quitada la rama SQLite y la comprobación de `db/`; ahora exige `DATABASE_URL` postgres y `psycopg2`.
- [x] `VERCEL.md`, `schema.prisma`, `google.ts`: quitadas referencias a archivos inexistentes.
- [ ] `.gitignore`: revisar entradas del sandbox (`.z-ai-config`, `.localpg/`, etc.).
- [ ] `next.config.ts`: revisar CSP `frame-ancestors` (pensada para el iframe del preview).
- [x] Gestor: npm (`package-lock.json`, `bun.lock` y `bun-types` fuera, `tsx` + `@types/node` añadidos, script `db:seed`).

## P1 — Coherencia de datos y textos (requiere tu visto bueno)
- [x] Zonas tensadas = 171 (118+53). Palamós corregido en `prepare_data.py` (`NAME_ALIASES` + aviso de control) y en `data/municipalities.json`.
- [ ] Refrescar datos con `update_all.sh` para que Palamós reciba alquiler (si el Excel lo nombra "Palamós") y comprobar el aviso de control de tensados.
- [x] Lista tensada "C" unificada (schema y PDF); 947 municipios; "datos hasta 2025".
- [x] Docstring de `prepare_data.py` actualizado a TER/3739 y 3740/2026.

## P1 — Producción
- [x] Textos legales (2026-11-12 v38.1): titular/responsable con contacto real (admin@preureal.cat) y proveedores; NIF/razón social pendientes de que el titular los facilite (no se inventan; la UI lo declara).
- [ ] Stripe real: crear precios, webhook, `DEMO_CHECKOUT=false`; probar renovación y fallo de pago.
- [ ] Resend: verificar dominio y `MAIL_FROM`.
- [ ] Google OAuth: redirect URI de producción.
- [ ] (Opcional v38.3) Definir `SENTRY_DSN` en Vercel para activar Sentry sin SDK.

## P2 — Calidad
- [x] Corregir los errores de lint de React 19 sin cambiar comportamiento (2026-11-11: 13 errores → 0).
- [ ] Eliminar o activar `tailwind.config.ts` (Tailwind 4) tras comprobar que no altera estilos. NOTA v38.2: los componentes ya NO usan hex duro sino tokens de globals.css; el config legacy sigue muerto (Tailwind 4 no lo lee).
- [ ] Revisar dependencias sin uso aparente (`@mdxeditor/editor`, `react-syntax-highlighter`, `@dnd-kit/*`, `next-intl`, `zustand`…) antes de quitar nada.
- [x] SEO rutas reales (2026-11-12 v38.1): puente sin 404 para /preus, /metodologia, /lloguer/** (server-rendered) y sitemap dinámico; el routing interno sigue siendo hash.
- [x] Tests mínimos (2026-11-12 v38.3): suite bun (unitarios, TOTP RFC 6238, PDF, suscripciones) + Playwright E2E (landing/preus/mapa/legal/registro) + CI en GitHub Actions. RESOLT 2026-11-16 (F4 redisseny Home): les 2 expectatives antigues de computeValuation ja passen (arreglades amb els commits F2/F3 del motor validat) i el pas `continue-on-error` s'ha eliminat del CI — tota la suite (10 fitxers) és bloquejant.
- [x] Colas PDF (2026-11-12, decisión): generación síncrona mantenida (pdf-lib ~50-150 ms, cuota 5-30/mes, rate limit 10/min); migrar a Inngest/Trigger.dev documentado como roadmap en README si el volumen crece.
- [ ] Importación de datos por edificio/illa (convenio Incasòl).
- [x] 255 municipis sense dada (2026-11-11): Palamós recuperat amb la sèrie oficial Incasòl (cruïlla de nom) i 254 municipis amb REFERÈNCIA DE COMARCA (mitjana ponderada pel nº de contractes, mateix any, mín. 3 munis) exposada separada (`comarcaRefLatest/History`, `rentSource="COMARCA_REF"`) i sempre etiquetada com a estimació a la UI (mapa, fitxa, històric, comparador i valoració). Cap dada municipal inventada.
