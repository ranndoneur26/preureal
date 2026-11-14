# TESTS_Y_VALIDACION.md — Pruebas realizadas y resultados

## v40 (Fase A primera integración) — 2026-11-15

### 1. Suite de tests (local, bun)

| Suite | Resultado | Contenido nuevo |
|---|---|---|
| `tests/entorn.test.ts` | **16/16 pass** | Parsers con fixtures REALES (ICAEN, recàrrega, sanitaris, docents, equipaments), normalización de refcat/kind, coordenadas fuera de rango → null, haversine (Barcelona→Girona ≈ 85 km), bbox 500 m con corrección cos(lat), radios 300/500/1000/2000 |
| Suite bloqueante completa (`unit`, `totp`, `pdf_report`, `audit_v23`, `reports_shop`, `entorn`) | **105/105 pass, 0 fail** | 89 preexistentes + 16 nuevos |
| `typecheck` (tsc --noEmit) | **OK sin errores** | Modelos Prisma nuevos incluidos |
| `eslint` sobre los archivos v40 | **0 errores** (regla react-compiler corregida en EntornPanel) | |
| `npm run audit` (high+) | **0 vulnerabilidades** | |
| `check_repo` (anti-drift dispatcher) | **OK** | 2 rutas nuevas registradas automáticamente (`/api/entorn/:id`, `/api/cron/entorn`) |
| `next build` (como CI, DATABASE_URL ficticio) | **OK** | Sin regresiones de build |

### 2. Verificación de fuentes contra los datasets reales (SODA)

| Verificación | Resultado |
|---|---|
| Conteos reales: ICAEN 1.342.960 · recàrrega 2.353 · sanitaris 5.680 · docents 38.108 · equipaments 33.552 | OK |
| SoQL del importador: `$order=:id`, `IN` con `codi_municipi_6` (docentes), filtro `starts_with(categoria,…)` + `IN` sin cero inicial (equipaments, **1.025 filas solo Barcelona**) | OK (detectó y corrigió 2 bugs de sintaxis/tipo antes del deploy) |
| Lookup on-demand ICAEN por refcat (`8761106DG6086S0001MG`) | 1 certificado, consumo A / emisiones A |
| Licencias por metadata API (todas «See Terms of Use» + marco Generalitat) | Documentado en REGISTRO/LIMITACIONES |
| Formatos de código municipal por dataset (kvmv censal con cero; 8gmd/tb2m censal sin cero; nrmq INE con cero) | Cubierto por mapa dual de códigos + test |

### 3. Validación en producción (15-11-2026, completada)

1. Deploy Vercel OK: migración `20261115120000_entorn_geo` aplicada; `/api/entorn/test-noexiste` → `BUILDING_NOT_FOUND` (ruta viva).
2. Cron `/api/cron/entorn`: **sembrado completo, `done: true`** — recàrrega 2.353, sanitaris 5.609 (71 sin coords descartadas), docents 16/16 lotes (5.428 centros curso 2026/2027), equipaments 16/16 lotes (10.901 Cultura/Esports).
3. End-to-end con edificios reales del Eixample: contadores por radios por tipología correctos y consistentes entre edificios vecinos; recàrrega 6 estaciones a 2 km.
4. On-demand ICAEN con refcat real sin certificado: degradación honesta (coincide con la fuente). Caso positivo cubierto por test de fixture (mapping A/A verificado contra la fuente).
5. Incidencias detectadas y corregidas durante el sembrado: ver REGISTRO_INTEGRACIONES.md §verificación.

### 4. Pendiente del propietario

- Añadir `tests/entorn.test.ts` a la línea bloqueante de `.github/workflows/ci.yml` (edición vía web, como en v38).
- Validación visual del nuevo bloque en ficha (desktop + móvil) y en los 5 contextos del encargo.
- Ciclo anterior (fuera de v40): prueba de compra end-to-end tras el fix v38.10 y confirmación del webhook «7 eventos».

### 4. Regresión garantizada

- La migración es **aditiva**: ninguna tabla ni columna existente cambia.
- La ficha demográfica, los informes PDF, el shop, el auth y los crons v39 no se han modificado.
- E2E Playwright existente sin cambios; suite bloqueante ampliada y en verde.
