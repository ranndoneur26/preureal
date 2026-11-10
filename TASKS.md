# TASKS — PreuReal.cat

Prioridad: **P0** bloquea / verificar primero · **P1** importante · **P2** mejora.
Ninguna tarea cambia el diseño visual sin tu autorización explícita.

## Fase 7 — Validación final (2026-11-11: SUPERADA, ver `INFORME_FASE7.md`)
- [x] Sondes de producció 54/54 (disponibilitat, seguretat, capçaleres, rendiment, dades) — `bun scripts/fase7_validate.ts`
- [x] Contrast de valors amb fonts oficials: IPVA Catalunya 2024 = +3,1 % (coincidència exacta INE), Atlas ADRH 2024 vigent, fiances Incasòl coherents amb Gencat
- [x] Smoke test navegador: 7 rutes, 0 errors de consola, canvi CA/ES correcte
- [x] Correccions de text ca (tagline «illa a illa» + subtítol landing) — v35
- [ ] **Propietari**: prémer «Sincronitza el catàleg» a `#/admin` (falten 2 de 4 ajudes a producció)
- [ ] **Propietari**: connectar domini `preureal.cat` a Vercel si es vol la marca .cat (ara no resol DNS)
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
- [ ] Rellenar textos legales (razón social, NIF, domicilio, contacto) en `LegalView`.
- [ ] Stripe real: crear precios, webhook, `DEMO_CHECKOUT=false`; probar renovación y fallo de pago.
- [ ] Resend: verificar dominio y `MAIL_FROM`.
- [ ] Google OAuth: redirect URI de producción.

## P2 — Calidad
- [ ] Corregir los 12 errores de lint de React 19 sin cambiar comportamiento.
- [ ] Eliminar o activar `tailwind.config.ts` (Tailwind 4) tras comprobar que no altera estilos.
- [ ] Revisar dependencias sin uso aparente (`@mdxeditor/editor`, `react-syntax-highlighter`, `@dnd-kit/*`, `next-intl`, `zustand`…) antes de quitar nada.
- [ ] SEO: sitemap sin `#/` o rutas reales (implica cambiar el routing: requiere decisión).
- [ ] Tests mínimos: auth, cuotas (`canConsult`), webhook Stripe, rate limit.
- [ ] Importación de datos por edificio/illa (convenio Incasòl) y datos por municipio sin alquiler (255 sin dato).
