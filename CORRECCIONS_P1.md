# Correccions P1 — Auditoria de pagaments i seguretat

**Data:** 3 de novembre de 2026
**Abast:** 6 problemes detectats en la revisió (4 funcionals + 2 de seguretat)
**Canvis a la base de dades:** CAP (zero migracions; tots els estats nous caben als camps existents)
**Verificació:** `npm run build` verd · 11/11 tests unitaris (bun) · 0 placeholders

---

## Resum dels 6 problemes i les seves solucions

### P1.1 — Webhook de Stripe: risc de perdre esdeveniments ✅ CORREGIT
**Fitxer:** `src/app/api/stripe/webhook/route.ts`

**Abans:** l'event es registrava a `StripeEvent` ABANS de processar-lo. Si el
processament fallava, la fila ja existia i les reentregues de Stripe eren
rebutjades com a «duplicat» → subscripció dessincronitzada per sempre.

**Ara:** la fila `StripeEvent` fa de **LOCK**:
1. S'insereix (claim atòmic per la clau única `eventId`) → si ja existeix, la
   reentrega es respon `duplicate: true` sense efectes.
2. S'apliquen TOTS els efectes.
3. Si qualsevol efecte llança una excepció → **s'elimina el lock** i es respon
   `500 PROCESSING_FAILED` → Stripe reentrega i l'event es torna a executar.

Només un processament amb ÈXIT deixa l'event registrat: cap event es pot perdre.

### P1.2 — La verificació del correu es feia amb un GET que modifica dades ✅ CORREGIT
**Fitxers:** `src/app/api/_impl/auth/verify/route.ts` + `src/components/views/VerificaView.tsx`

**Abans:** obrir l'enllaç (GET) marcava el compte com a verificat i consumia el
token. Els escàners d'enllaços (antispam, previews de missatgeria, antivirus de
correu) visiten les URL sense cap acció humana → podien «devorar» l'enllaç.

**Ara:**
- `GET ?resposta=json` → NOMÉS consulta l'estat (`pendent | ja_usat | caducat |
  invalid`). Cap mutació.
- `GET` sense `resposta` → redirigeix a la vista de confirmació (cap mutació).
- `POST { token }` → **l'únic camí que consumeix el token i marca
  `emailVerifiedAt`**. L'initia la vista `/#/verifica` quan l'usuari real obre
  la pàgina (un escàner fa GET; no executa la SPA ni fa POST).
- Si l'usuari ja estava verificat, es conserva la data del PRIMER verificat.
- Detall addicional: el `GET` sense `resposta=json` ara redirigeix a
  `/#/verifica?token=...` (la vista de confirmació) en comptes del panell.

### P1.3 — El registre creava sessió sense exigir verificació a la resta d'endpoints ✅ CORREGIT
**Fitxers nous de comportament:** `src/lib/auth.ts` (funció nova) + 7 endpoints

**Ara existeix `requireVerifiedUser()`** a `src/lib/auth.ts`: envolta
`requireUser()` i llança `EMAIL_NOT_VERIFIED` si `emailVerifiedAt` és buit
(el rol ADMIN n'està exempt per operativa interna). La verificació ja no depèn
del frontend ni d'un únic endpoint.

Aplicada a TOTES les accions que requereixen correu verificat:

| Endpoint | Abans | Ara |
|---|---|---|
| `POST /api/lookup` | ja bloquejava (403) | igual (no canvia) |
| `GET/POST/DELETE /api/favorites` | només sessió | sessió + verificat |
| `GET/POST/DELETE /api/comparisons` | només sessió | sessió + verificat |
| `GET/DELETE /api/history` | només sessió | sessió + verificat |
| `GET /api/export/[code]` | només sessió | sessió + verificat |
| `GET /api/reports/pdf` | només sessió | sessió + verificat |
| `POST /api/stripe/checkout` | només sessió | sessió + verificat (mai es cobra a un correu sense verificar) |
| `POST /api/stripe/demo` | només sessió | sessió + verificat |

Sense verificar la resposta és `403 { error: "EMAIL_NOT_VERIFIED" }`.
Es mantenen NOMÉS amb sessió (sense exigir verificació), perquè són
autoservei necessaris abans de verificar: `account*`, `auth/*`,
`billing/history`, `stripe/portal`, `stripe/return`, `admin/*`.
El panell degrada amb gràcia: `PanelView` ja tracta les respostes no-ok com a
llista buida (`j()` retorna null → `[]`), cap vista es trenca.

### P1.4 — Subscripcions DEMO: estats incoherents ✅ CORREGIT
**Fitxers:** `src/lib/plans.ts` (funció nova), `checkout`, `demo`, `webhook`, `auth.ts`

**Ara hi ha `syncUserPlan(userId, { force })`** a `src/lib/plans.ts`:
1. Expira (`status: "expired"`) les subscripcions `active` el
   `currentPeriodEnd` de les quals ja ha passat → **el pla DEMO caduca sol als
   30 dies, sense botons ni cron**.
2. Recalcula el pla de l'usuari com el MÉS ALT de les subscripcions encara
   vigents → el pla sempre es deriva de les subscripcions actives.
3. Mai llança (si la BD falla, es manté el pla actual).

Punts de sincronització:
- `requireUser()` dels usuaris de pagament (auto-curiós a cada petició, amb cau
  de 60 s per usuari per no carregar la BD).
- `checkout.session.completed` (webhook): cancel·la les subscripcions actives
  anteriors de l'usuari abans d'activar la nova → **una única subscripció
  activa**; canviar Premium→Pro (o a l'inrevés) no deixa rastres actius.
- `customer.subscription.updated/deleted` i `invoice.paid`: recalculen el pla
  amb `syncUserPlan(force)` en comptes de fixar `FREE` a cegues.
- Checkout DEMO: cancel·la les actives anteriors abans de crear la nova
  (impossible acumular múltiples DEMO actives).
- Cancel·lació DEMO: només cancel·la les DEMO i recalcula — si l'usuari tingués
  una subscripció real vigent, NO perdria el pla.

### P1.5 — IP i rate limiting falsificables ✅ CORREGIT
**Fitxer:** `src/lib/security.ts`

**Abans:** `clientIp()` prenia el PRIMER valor de `x-forwarded-for`, que el
client controla → un atacant podia rotar la IP aparent i esquivar el rate limit.

**Ara:**
1. Prioritat a `x-real-ip` (la posa l'edge de Vercel amb la IP de la connexió
   TCP; no és spoofable).
2. Si no hi és, l'ÚLTIM valor vàlid de `x-forwarded-for` (el que afegeix el
   darrer proxy de confiança: Vercel edge / Caddy al self-hosting).
3. Validació estricta de format (IPv4 amb octets ≤ 255, IPv6 hexadecimal).
4. Si res no és vàlid → `"local"` (bucket compartit: el límit segueix
   aplicant-se — fail-closed).

Tests nous cobreixen: últim-XFF, prioritat de `x-real-ip`, rebutj de valors
falsificats i IPv6.

### P1.6 — Registre: 500 en registres simultanis del mateix correu ✅ CORREGIT
**Fitxer:** `src/app/api/_impl/auth/register/route.ts`

**Abans:** comprovar-crear sense capturar la carrera → la restricció UNIQUE de
la BD feia fallir una de les peticions amb 500.

**Ara:** el `db.user.create()` captura específicament
`Prisma.PrismaClientKnownRequestError` amb `code === "P2002"` i retorna
`409 EMAIL_EXISTS` (la comprovació prèvia es manté com a camí ràpid).

---

## Fitxers canviats (16)

| # | Fitxer | Tipus |
|---|---|---|
| 1 | `src/lib/auth.ts` | modificat (requireVerifiedUser + syncUserPlan a requireUser) |
| 2 | `src/lib/plans.ts` | modificat (syncUserPlan) |
| 3 | `src/lib/security.ts` | modificat (clientIp P1.5) |
| 4 | `src/app/api/stripe/webhook/route.ts` | modificat (P1.1 + P1.4) |
| 5 | `src/app/api/_impl/auth/verify/route.ts` | modificat (P1.2) |
| 6 | `src/app/api/_impl/auth/register/route.ts` | modificat (P1.6) |
| 7 | `src/app/api/_impl/stripe/checkout/route.ts` | modificat (P1.3 + P1.4) |
| 8 | `src/app/api/_impl/stripe/demo/route.ts` | modificat (P1.3 + P1.4) |
| 9 | `src/app/api/_impl/favorites/route.ts` | modificat (P1.3) |
| 10 | `src/app/api/_impl/comparisons/route.ts` | modificat (P1.3) |
| 11 | `src/app/api/_impl/history/route.ts` | modificat (P1.3) |
| 12 | `src/app/api/_impl/export/[code]/route.ts` | modificat (P1.3) |
| 13 | `src/app/api/_impl/reports/pdf/route.ts` | modificat (P1.3) |
| 14 | `src/components/views/VerificaView.tsx` | modificat (P1.2) |
| 15 | `tests/unit.test.ts` | modificat (tests nous P1.5) |
| 16 | `CORRECCIONS_P1.md` | document (aquest fitxer) |

**Sense canvis:** `prisma/schema.prisma` i migracions — cap alteració de BD.

---

## Com aplicar-ho (Terminal, com sempre)

```bash
cd ~/Downloads
unzip -o PreuReal-P1-correccions.zip -d preureal-p1
rsync -a preureal-p1/ "/Users/marcxicola/Desktop/Feines 2025-26/preureal/"
cd "/Users/marcxicola/Desktop/Feines 2025-26/preureal"
npm run build
vercel --prod
git add -A
git commit -m "P1: webhook idempotent, verificacio via POST, requireVerifiedUser, subscripcio unica, IP segura, P2002 a 409"
git push
```

## Comprovacions post-desplegament

1. **Verificació (P1.2):** registra un compte → obre l'enllaç del correu (o del
   registre `EmailLog` del panell admin) → la vista confirma sola. Torna a obrir
   el mateix enllaç → «Aquest enllaç ja s'havia utilitzat».
2. **Bloqueig (P1.3):** amb un compte NO verificat: el mapa detallat, preferits,
   historial, comparacions, export i «activar pla» responen bloqueig (panell de
   verificació / banner); amb el compte verificat tot torna a funcionar.
3. **DEMO (P1.4):** activa DEMO Premium → torna a fer checkout DEMO Pro → només
   queda UNA subscripció activa (Pro). Cancel·la → pla FREE. (Opcional, prova
   de caducitat: a la BD posa `currentPeriodEnd` d'ahir a la sub activa i
   recarrega el panell → pla FREE automàticament.)
4. **Registre (P1.6):** intenta registrar el mateix correu dues vegades → la
   segona respon «Aquest correu ja té un compte» (409), mai error genèric.
