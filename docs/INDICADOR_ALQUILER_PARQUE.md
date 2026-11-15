# INDICADOR_ALQUILER_PARQUE.md — «% estimado de alquiler sobre el parque residencial»

Versión metodológica: **1.0** · Implementado en v41 (2026-11-15) · Documento vivo

---

## 1. Qué es y qué NO es

| | |
|---|---|
| **Nombre público** | % estimado de alquiler sobre el parque residencial (ca: «% estimat d'alquiler sobre el parc residencial») |
| **Fórmula** | `(fiances vigentes INCASÒL / inmuebles de uso residencial del Catastro) × 100` |
| **Ámbito** | Municipal (947 municipios de Cataluña; se calcula solo donde ambas fuentes existan) |
| **Denominación correcta** | Es una **estimación elaborada por PreuReal** a partir de componentes oficiales. **NO** debe llamarse «% oficial de viviendas principales en alquiler»: el parque catastral no distingue viviendas principales, secundarias y vacías. |
| **Contraste censal oficial** | Se muestra SIEMPRE por separado: **Censo de Población y Viviendas 2021** (viviendas principales en alquiler / total de viviendas principales), disponible para 615 municipios. |
| **Lo que NO es el flujo** | El número de **contratos con fianza depositada en un año** (flux) mide actividad de mercado, no stock. **Nunca se usa como numerador** ni se presenta como «viviendas alquiladas». |

## 2. Fuentes (estado verificado a 2026-11-15)

### 2.1 Numerador — fiances VIGENTES (stock) · `INCASOL_FIANZES_VIGENTS` · **PENDIENTE DE FUENTE**

- **Verificación realizada** (HTTP real, catálogo de Dades Obertes `analisi.transparenciacatalunya.cat`): el único dataset municipal de fiances publicado (`qww9-bvhh`) es **flujo** (su descripción oficial dice «contractes que s'han donat d'alta al Registre de fiances en el període considerat»). La búsqueda de «fiances vigents» devuelve 0 resultados. El saldo neto altas/bajas (`Saldo_contractes_Htge_i_Temp.xlsx`, habitatge.gencat.cat) es **solo a nivel de Cataluña**, no municipal.
- **Conclusión**: no existe hoy publicación abierta municipal del stock de fianzas vigentes. No se inventa ningún valor.
- **Conector**: `POST /api/admin/import-rental-share` (ver §5). Se activa cuando exista publicación oficial (Dades Obertes, portal Incasòl o convenio — misma vía que la pendiente de la media por edificio).

### 2.2 Denominador — parque residencial catastral · `DNP_CATASTRE_PARC` · **PENDIENTE DE VERIFICACIÓN**

- **Verificación realizada**: la disseminación INE (WS Tempus3, 166 operaciones) **no contiene** la estadística de bienes inmuebles catastrales; el portal del DNP (`catastro.meh.es`, `catastro.minhap.es`, `catastro.minhafp.es`) no resuelve DNS desde el entorno de trabajo; `ovc.catastro.meh.es` responde «página ya no disponible».
- **Requisitos del dato**: inmuebles con **uso principal residencial** del municipio (excluidos locales, oficinas, garajes, trasteros, inmuebles industriales). Nunca valores catastrales ni datos protegidos.
- **Conector**: mismo endpoint administrativo (§5). Alternativa a explorar fuera del sandbox: estadística de bienes inmuebles del DNP (bienios) y/o feeds INSPIRE de Catastro ya catalogados en `CATALOGO_FUENTES_DATOS.md` (T.1).

### 2.3 Contraste censal — Censo 2021 vía Idescat · `IDESCAT_CENS2021_TENENCIA` · **ACTIVA**

- **API**: `https://api.idescat.cat/taules/v2/censph/310/20419/mun/data?lang=es` (JSON-stat 2.0). Tabla «Habitatges principals. Per règim de tinença» (nodo 310, tabla 20419, año 2021).
- **Cobertura verificada**: 615 municipios + agregado Catalunya. Los códigos MUN son los **códigos censales de 6 dígitos idénticos a `Municipality.code`** (615/615 match, 0 sin match — comprobado contra el seed). Los 332 municipios restantes no tienen tabla municipal en el Cens 2021 de Idescat (están en agrupaciones censales, `/ac`; extensión futura).
- **Nota oficial de la fuente**: los resultados están **redondeados aleatoriamente a múltiplos de 3** (secreto estadístico) — citado en UI.
- **Valores de contraste verificados**: Manresa 8.793/31.029 → 28,34 %; Barcelona 208.467/671.178 → 31,06 %; Cataluña 692.285/2.989.357 → 23,16 % (coincide con la publicación web).
- **Licencia**: Llicència Oberta d'Ús d'Informació — Catalunya (IDESCAT). Perioricidad: censal.
- **Variables**: `CENS_MAIN_PROP`, `CENS_MAIN_RENTAL`, `CENS_MAIN_OTH`, `CENS_MAIN_NC` («no consta»), `CENS_MAIN_TOTAL` en `StatObservation` (geoLevel `MUNI` / `CAT`, periodo `2021`).

### 2.4 Referencia de mercado — flujo anual de fiances · `INCASOL_FIANZES_FLUX` · **ACTIVA**

- **API**: `https://analisi.transparenciacatalunya.cat/resource/qww9-bvhh.json` (SODA). Filtro importado: `ambit_territorial='Municipi' AND periode='gener-desembre'` → **solo el año completo**.
- **Cobertura verificada en ingesta local**: 15.297 filas municipio-año (2007-2025 según municipio), 0 skipped tras el fallback de mapeo `ineCode` (255 municipios del seed actual no tienen `ineCode` rellenado; el código censal de 6 dígitos siempre empieza por el INE de 5 → derivación documentada, unión siempre por código, nunca por nombre).
- **Uso**: referencia de actividad del mercado (chips del comparador, tabla de la ficha). **Nunca numerador del %**.
- **Variables**: `INCASOL_CONTRACTES_PERIODE` (unidad «contractes amb fiança depositada (flux anual)», meta `{kind:"FLUX", dataset:"qww9-bvhh"}`).

### 2.5 Indicador derivado · `PREUREAL_CALC_RENTAL_SHARE`

- Fila de `DataSource` que documenta el cálculo elaboración propia (fórmula, condiciones y limitaciones) y hace visible el indicador en `/api/provenance` y en la metodología pública.

## 3. Modelo de datos

### 3.1 Componentes → `StatObservation` (tabla general existente, encargo §4)

| Variable | Fuente | geoLevel | Periodo | Significado |
|---|---|---|---|---|
| `INCASOL_FIANZES_VIGENTS` | conector admin | MUNI | «2025», «2026-T1»… | stock de fianzas vigentes (numerador) |
| `CAT_PARC_RESIDENCIAL` | conector admin | MUNI | año catastral | inmuebles de uso residencial (denominador) |
| `CENS_MAIN_*` | Idescat censph | MUNI + CAT | «2021» | contraste censal |
| `INCASOL_CONTRACTES_PERIODE` | SODA qww9-bvhh | MUNI | año | flujo anual (referencia) |

### 3.2 Histórico del cálculo → `RentalShareObservation` (tabla nueva, migración aditiva `20261115140000_rental_share`)

Campos principales: `municipalityCode` (enlace lógico por código, nunca por nombre) + `municipalityName` (denormalizado para UI), `referenceKey`, `numeratorKind`, `incasolActiveDeposits`, `incasolDepositsPeriod` (flujo de referencia), `incasolPeriod`, `residentialProperties`, `cadastreYear`, `rentalPercentage`, `censusMainRental`, `censusMainTotal`, `censusRentalPercentage`, `censusYear`, `incasolSource`, `cadastreSource`, `censusSource`, `methodologyVersion`, `dataStatus`, `warnings` (JSON), `runId`.

- **Clave única** `(municipalityCode, referenceKey)`; `referenceKey = "C:2021"` (solo censal) o `"N:<período-numerador>|D:<año-catastral>"` (compuesto).
- **Histórico sin sobrescrituras**: una publicación nueva crea una fila nueva (nuevo referenceKey); reimportar la misma publicación actualiza esa fila (idempotente).
- **Migración aditiva**: no toca ninguna tabla existente; reversible (drop table).

## 4. Cálculo y validaciones (encargo §5 — implementadas en `computeRentalShare`)

| Regla | Comportamiento |
|---|---|
| Falta numerador o denominador | No se calcula; estado `NO_NUMERATOR` / `NO_DENOMINATOR` + aviso |
| Denominador = 0 | No se calcula (`NO_DENOMINATOR`) + aviso; nunca división por cero |
| Valores negativos | `NEGATIVE_INPUT`; nunca se sustituyen por ceros |
| Numerador y denominador de municipios distintos | `MISMATCH_MUNI` (comparación por código INE), sin cálculo |
| % > 100 | `REVIEW_OVER_100`: no se publica, requiere revisión manual (aviso con los valores) |
| Períodos temporalmente incompatibles | Se calcula pero estado `TIMING_MISMATCH` + aviso; la UI lo presenta como «valor indicativo, no definitivo» |
| Cens con total = 0 o alquiler > total | % censal no publicado + aviso |
| Cens incompleto (un solo componente) | null + aviso; nunca 0 automático |
| Solo disponible contraste censal | Fila `C:2021` con estado `CENS_REF_ONLY` (estado real de las fuentes a 2026-11-15 para los 615 municipios con dato) |
| Municipios sin ningún componente | Sin fila (`NO_DATA`); la ficha muestra «sin información» y el comparador omite el chip |

Estados posibles: `OK`, `TIMING_MISMATCH`, `REVIEW_OVER_100`, `NEGATIVE_INPUT`, `MISMATCH_MUNI`, `NO_NUMERATOR`, `NO_DENOMINATOR`, `CENS_REF_ONLY`.

## 5. Conector administrativo (para las fuentes pendientes)

```
POST /api/admin/import-rental-share
Authorization: sesión admin (requireAdmin) · rate limit 10/min
{
  "dryRun": true,   // valida y calcula sin persistir
  "rows": [
    { "municipalityCode": "081136",              // o "ineCode": "08113"
      "incasolActiveDeposits": 8811,             // numerador (STOCK, mai flujo)
      "incasolPeriod": "2025",                   // período oficial del numerador
      "incasolSource": "Incasòl — Registre de fiances (publicació oficial)",
      "residentialProperties": 41250,            // denominador (uso residencial)
      "cadastreYear": "2026",
      "cadastreSource": "Dirección General del Catastro (estadística oficial)" }
  ]
}
```

- Valida cada fila (códigos 6/5 dígitos, componentes enteros ≥ 0, al menos un componente) y resuelve `ineCode → municipalityCode` contra `Municipality` (nunca por nombre).
- Escribe los componentes en `StatObservation` con `meta {kind:"STOCK", via:"admin-import"}` y recalcula los municipios afectados vía `recalcRentalShare` (todo trazado en `ImportRun` + `AuditLog`).
- `dryRun:true` devuelve el preview del cálculo (referenceKey, %, estado, avisos) sin persistir nada.

## 6. Automatización

- **Cron mensual** `/api/cron/rental-share` (día 5, 20:00 UTC — `vercel.json`): reimporta el cens (idempotente, ventana de sustitución), reimporta el flujo anual (paginado SODA) y recalcula los 947 municipios. Presupuesto 40 s dentro del límite de 60 s; idempotente, se completa en la siguiente ejecución si se corta.
- El importador local de referencia completó en **6,9 s** el ciclo completo (3.080 obs censales + 15.297 obs de flujo + 615 filas de indicador), muy por debajo del presupuesto.
- Cuando el numerador/denominador tengan fuente automática (nuevo dataset SODA o descarga verificada), se añade su importador al mismo cron; mientras tanto, la carga es manual por el conector administrativo.

## 7. Integración en la aplicación (encargo §7-8)

| Superficie | Archivo | Contenido |
|---|---|---|
| Ficha SEO `/lloguer/[slug]` (SSR) | `src/app/lloguer/[slug]/page.tsx` | Sección «Parc d'habitatges i mercat del lloguer»: % estimado (o estado «sense informació suficient» con fórmula), referencia censal oficial con Cataluña, tabla de flujo anual con nota «flux ≠ stock», fuentes y enlace a metodología |
| Panel del mapa (cliente) | `src/components/views/RentalSharePanel.tsx` + `MapView.tsx` | Mismo contenido compacto, ca/es, degradación elegante |
| Comparador | `_impl/comparator/route.ts` + `ComparadorView.tsx` | Chip censal «alquiler (cens 2021) X%», chip estimado cuando exista, chip de flujo anual; público y sin gating (igual que demografía) |
| API pública | `GET /api/rental-share?muni=:code` | Detalle completo + metodología + historial + serie de flujo + referencia de Cataluña; cache 1 h + SWR |
| Ranking público | `GET /api/rental-share/ranking?order=desc&source=census|estimat&limit=n` | Ordenación por % censal (disponible) o estimado (cuando exista); identifica los municipios con mayor peso del alquiler |
| Metodología pública | `MetodologiaView.tsx` (#/metodologia) | Texto metodológico bilingüe del encargo §9, fórmula, estado de fuentes, limitaciones y ciclo de actualización |

## 8. Limitaciones (encargo §10 — expuestas en UI y metodología)

**Incasòl**: puede haber contratos sin fianza depositada; altas/bajas con retraso; fianzas que no equivalen a viviendas únicas; modalidades con tratamiento estadístico diferente.
**Catastro**: puede incluir inmuebles no habitables; no distingue principales/secundarias/vacías; diferencias entre inmuebles catastrales y viviendas físicas.
**Censo**: referencia estructural comparable, sin periodicidad de Incasòl; año 2021 siempre visible; valores redondeados a múltiplos de 3.
**Temporal**: numerador (trimestral/semestral) y denominador (anual/bienal) pueden desfasarse → estado `TIMING_MISMATCH` visible.
**Cobertura censal**: 615/947 municipios (los 332 restantes sin tabla municipal en el Cens 2021 → «sin información», nunca estimados).

## 9. Procedimiento de actualización (operación futura)

1. **Automático**: cron mensual (cens + flujo + recálculo) — no requiere acción.
2. **Cuando aparezca el numerador municipal** (fiances vigentes): verificar el dataset en Dades Obertes/Incasòl, añadir/importar por el conector admin (`dryRun` primero), revisar estados `TIMING_MISMATCH` y `REVIEW_OVER_100` en `RentalShareObservation`, y pasar el importador al cron.
3. **Cuando esté verificada la descarga catastral**: mismo procedimiento para el denominador.
4. **Revisión de anomalías**: `SELECT * FROM "RentalShareObservation" WHERE "dataStatus" IN ('REVIEW_OVER_100','MISMATCH_MUNI','NEGATIVE_INPUT');` → corregir en la fuente, nunca en la tabla.
5. **Cambio metodológico**: incrementar `methodologyVersion` (campo en cada fila) y actualizar este documento + `/metodologia`.

## 10. Pruebas

- **Unitarias** (`tests/rental_share.test.ts`, 26 tests, añadidos a la suite bloqueante de CI): parsers puros con las fixtures reales descargadas de las fuentes (Idescat JSON-stat y SODA), cálculo con las 13 reglas de validación y validador del conector. Suite bloqueante de CI: 89 → **115 tests**.
- **E2E local** (PostgreSQL local, producción intacta): `scripts/e2e_rental_share.ts` — migración aplicada, seed 947 municipios, ingesta viva (cens 3.080 obs; flux 15.297 obs, 0 skipped), recálculo 615 filas `CENS_REF_ONLY` + 332 sin fila, fitxa Manresa correcta (28,338 % censal; flujo 2007-2025), ranking top (Alp 34,18 %…) y resumen de comparador.
- **Piloto Manresa** (`scripts/pilot_rental_share_manresa.py`, código independiente): contraste vivo contra las publicaciones oficiales (Manresa, Barcelona y Cataluña coinciden cifra a cifra).
- **Preexistentes**: 7 tests fallan en `main` fuera de CI (entorno sandbox: crypto/plans); son anteriores a v41 y no se han tocado.
