# CHANGES — PreuReal.cat v0.7.0 (Fase 1: registre i autenticació)

Data: 2026-11-03 · Base: v0.5.0 (v9) + alineació d'arquitectura + Fase 1 completa

## v18 — 2026-11-04 · Correcció CRÍTICA: els correus no sortien a producció

- **Causa (vista a Supabase → EmailLog com a «fetch: TimeoutError [23]»)**: tots
  els `sendMail` es llançaven com a promesa flotant després de respondre. Vercel
  congela la funció en tornar la resposta → el fetch a Resend queda a mig fer,
  el guardià d'abort el mata en descongelar-se i el correu MAI surt.
  Conseqüència visible: bloqueig «Verifica tu correo para continuar» en bucle.
- **Correcció**: tots els enviaments (registre: benvinguda + verificació,
  reenviament de verificació, restabliment de contrasenya, benvinguda Google,
  rebut Stripe) van ara dins de `after()` de next/server → Vercel manté la
  funció viva fins que els enviaments acaben (semàntica waitUntil).
- `mail.ts`: guardià per intent 15s → 20s, i el log d'error d'EmailLog inclou
  ara intent i durada en ms (`fetch [intento 1, 20004ms]: ...`) per diagnosticar
  de veritat: ~20000 ms = connexió congelada/penjada; pocs ms = DNS/socket/TLS.
- `maxDuration = 60` a les 5 rutes que envien correu (register, verify,
  password-reset, google/callback, stripe/webhook).

## FASE 1 — Registre i autenticació (cap canvi d'esquema de BD)

### Verificació del correu
- **Bloqueig server-side de les funcions principals** fins verificar el correu:
  `POST /api/lookup` respon `403 EMAIL_NOT_VERIFIED` amb correu emmascarat si
  `emailVerifiedAt` és null (els ADMIN hi escapen). Decisió al SERVIDOR.
- **Pantalla nova «Revisa el teu correu»** (`/#/revisa-correu`, component
  `CheckEmailView`): apareix després de registrar-se i en entrar sense verificar;
  amb botó de reenviament (genera token NOU de 24 h) i continuació al mapa.
- **Estats de verificació diferenciats** al panell: `ok`, `ja_usat` (enllaç ja
  utilitzat), `caducat` (24 h, amb reenviament), `invalid`.
- **Panell del mapa nou** quan una consulta està bloquejada per verificació:
  explica el motiu, deixa reenviar el correu i enllaça al compte.
- **Un sol enllaç viu**: en verificar, tots els altres `EmailToken` pendents del
  compte queden anul·lats; es registra l'esdeveniment `EMAIL_VERIFIED`.
- **Google OAuth coherent**: els comptes de Google neixen i queden verificats
  (`email_verified=true` s'exigeix al callback).

### Recuperació de contrasenya
- Confirmació de restabliment: ara **invalida tots els altres enllaços pendents**
  del compte (a més del ja existent ús únic + revocació de sessions).

### Sessions
- **Nou endpoint `POST /api/auth/sessions/revoke-all`**: tanca la sessió a tots
  els altres dispositius (incrementa `tokenVersion`) i renova la sessió actual.
- **Botó al panell (Seguretat)** + últim inici de sessió visible.

### Perfil
- **Nou endpoint `GET /api/account/activity`**: últims 20 esdeveniments del
  compte (registre, logins, verificació, restabliments, revocacions, consultes)
  + etiquetes llegibles bilingües al tab Seguretat.
- La verificació del correu es mostra també al resum del panell amb reenviament.

### Seguretat
- Nou helper `maskEmail()` (`jo***@gmail.com`) per a respostes compartides.
- Rate limits a les rutes noves (reenviament 3/5 min, revocació 5/5 min).
- Registe/login retornen `verificationSent` i `emailVerified` per dirigir la UI.

## Altres millores incloses (pre-Fase 1)

- **Guardia d'URL**: `src/lib/site-url.ts` + `layout.tsx` — un
  `NEXT_PUBLIC_SITE_URL` mal escrit (p. ex. `https//...`) ja no pot tancar el
  build; cau a `https://preureal.cat`. Testat amb el cas real de Vercel.
- **Alineació de l'arquitectura API** amb el desplegament v9: dispatcher únic
  (`/api/[[...path]]`) + 45 handlers a `src/app/api/_impl/` + `api/health` i
  `api/stripe/webhook` independents. Retirats duplicats de plantilla.

## Verificació

- `npm run build` ✓ (Next 16.4.3 + Turbopack + TypeScript)
- `npx tsx scripts/test_auth_fase1.ts` → 40/40 ✓ (estructural + unitats)
- `npx tsx scripts/e2e_auth_fase1.ts` → 32/32 ✓ (E2E real amb PostgreSQL:
  registre → bloqueig 403 → verificació → desbloqueig → sessions → reset → RGPD)
- Auditoria completa: `AUDIT.md` (secció V3)

## Desplegament (recordatori)

1. Aplicar `prisma/migrations/.../migration.sql` si la BD encara no té les taules
   (no cal cap migració NOVA per a aquesta versió).
2. Variables a Vercel: `DATABASE_URL` (pooler 6543), `AUTH_SECRET`,
   `NEXT_PUBLIC_SITE_URL` (amb `https://` complet!).
3. Correus: sense `RESEND_API_KEY` funcionen en sandbox (log d'admin).
