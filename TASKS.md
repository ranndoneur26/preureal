# TASKS — PreuReal.cat

Prioridad: **P0** bloquea / verificar primero · **P1** importante · **P2** mejora.
Ninguna tarea cambia el diseño visual sin tu autorización explícita.

## Noves funcionalitats — anàlisi i valoració (encàrrec 2026-11-11)
- [x] **Fase 1 auditoria de dades** — `INFORME_AUDITORIA_FUNCIONALIDADES.md` (auditoria real: 692/947 munis amb sèrie Incasòl 2005–2025, Atlas INE 947/947, esforç de renta ja calculat, sense €/m² ni secció censal; 0 migracions per a les 4 funcionalitats)
- [x] **Propietari**: 6 punts del §5 validats via preguntes interactives (€/habitatge, ometre secció censal, mediana/any, valoració territorial v1, quotes 5/30, SVG propis)
- [x] **F3 esforç de renta** (v38): termòmetre + comparativa Catalunya — Premium
- [x] **F1 evolució temporal** (v38): LineChart SVG interactiu a fitxa + comparador multi-municipi — Premium (gratuït manté la mini-taula actual)
- [x] **F2 comparativa territorial** (v38): BarChart muni/comarca/província mateix any + extrems + secció censal «no disponible» — Premium
- [x] **F4 valoració** (v38): POST /api/valuation (quota VALUATION 5/30, configurable admin) + ValuationPanel al panell — Premium/Pro
- [x] Gates: tests 72/72 (+20 nous), tsc net, eslint 0 nous, dispatcher 59 rutes, sondes producció (plans flags ✓, /api/valuation 401 ✓, home/lookup ✓)
- [ ] **Propietari**: verificació visual amb compte Premium (fitxa municipi amb dada: BCN; comparador amb 3+ municipis; valoració) i, si s'escau, retoc de quotes/flags des de `#/admin`
- [ ] P2 futur: importar Atlas INE per secció censal (renda) si es vol l'esforç per secció

## Fase 7 — Validación final (2026-11-11: SUPERADA, ver `INFORME_FASE7.md`)
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
- [x] Tests mínimos (2026-11-12 v38.3): suite bun (unitarios, TOTP RFC 6238, PDF, suscripciones) + Playwright E2E (landing/preus/mapa/legal/registro) + CI en GitHub Actions. PENDIENTE: 2 expectativas antiguas de computeValuation (motor F4) fallan desde antes de v38; corregirlas.
- [x] Colas PDF (2026-11-12, decisión): generación síncrona mantenida (pdf-lib ~50-150 ms, cuota 5-30/mes, rate limit 10/min); migrar a Inngest/Trigger.dev documentado como roadmap en README si el volumen crece.
- [ ] Importación de datos por edificio/illa (convenio Incasòl).
- [x] 255 municipis sense dada (2026-11-11): Palamós recuperat amb la sèrie oficial Incasòl (cruïlla de nom) i 254 municipis amb REFERÈNCIA DE COMARCA (mitjana ponderada pel nº de contractes, mateix any, mín. 3 munis) exposada separada (`comarcaRefLatest/History`, `rentSource="COMARCA_REF"`) i sempre etiquetada com a estimació a la UI (mapa, fitxa, històric, comparador i valoració). Cap dada municipal inventada.
