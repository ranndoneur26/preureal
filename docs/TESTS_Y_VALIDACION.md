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

### 3. Pendiente de validación en producción (tras el deploy de Vercel)

1. `prisma migrate deploy` aplica la migración `20261115120000_entorn_geo` (aditiva).
2. Primera ejecución del cron `/api/cron/entorn` (06:15 UTC): sembrado 2.353 + 5.680 puntos y ~32 lotes de municipios (2-3 días de cron).
3. Sonda `GET /api/entorn/<buildingId>` en producción: 200 con `energia.certificats` cuando la fuente responde.
4. Validación visual del bloque «Serveis i qualitat de l'entorn» en ficha (BCN, municipio metropolitano, ciudad mediana, municipio pequeño, zona rural).
5. Añadir `tests/entorn.test.ts` a la línea bloqueante de `.github/workflows/ci.yml` (requiere edición del propietario vía web, como en v38).

### 4. Regresión garantizada

- La migración es **aditiva**: ninguna tabla ni columna existente cambia.
- La ficha demográfica, los informes PDF, el shop, el auth y los crons v39 no se han modificado.
- E2E Playwright existente sin cambios; suite bloqueante ampliada y en verde.
