# Auditoría — Fase 1: Registre d'usuaris i autenticació

**Projecte:** PreuReal.cat · **Data:** 3 de novembre de 2026
**Abast:** sistema complet de registre, verificació de correu, recuperació de
contrasenya, sessions i perfil d'usuari (l'encàrrec «Fase 1»).
**Mètode:** revisió fitxer per fitxer dels 4 blocs de l'encàrrec + build de
producció (`next build`) + tests unitaris (9/9 ✓) + tests del guardia d'URL (8/8 ✓).

---

## 1. Veredicte general

| Bloc de l'encàrrec | Estat | Observacions |
|---|---|---|
| 1. Verificació de correu | ✅ COMPLET | Validació 100% al servidor; vista nova `/verifica` |
| 2. Recuperació de contrasenya | ✅ COMPLET | Tokens d'un sol ús; confirmació visual afegida |
| 3. Login i sessions | ✅ COMPLET | Endpoint «tancar sessions d'altres dispositius» creat (abans 404) |
| 4. Perfil d'usuari | ✅ COMPLET | Edició, canvi de contrasenya, activitat, eliminació RGPD |

**Base de dades: SENSER CANVI.** El model ja tenia tot el que calia
(`emailVerifiedAt`, `EmailToken`, `PasswordToken`, `tokenVersion`,
`lastLoginAt`) i les taules ja estan creades a Supabase (migració `init`
aplicada). No cal executar cap migració nova: producció no es toca.

---

## 2. Bloc 1 — Verificació de correu (requisit per requisit)

| Requisit de l'encàrrec | Implementació | Fitxer |
|---|---|---|
| Registre amb nom, correu i contrasenya | Valida format de correu, contrasenya ≥ 8, nom sanititzat (`sanitizeName`) | `_impl/auth/register/route.ts` |
| Compte neix sense verificar | `emailVerifiedAt = NULL` en crear-se | register + schema `User` |
| Enviament automàtic del correu | `verifyMail()` enviat just després del registre (no bloqueja la resposta) | register |
| Botó «Verificar correu» | Enllaç del correu → `/#/verifica?token=…` → **vista nova** que valida al servidor | `VerificaView.tsx` (NOVA) |
| Validació al servidor (no només frontend) | `GET /api/auth/verify` comprova el token CONTRA LA BD dins d'una transacció | `_impl/auth/verify/route.ts` |
| Activa el compte | `emailVerifiedAt = now()` + esdeveniment `EMAIL_VERIFIED` | verify |
| Redirecció a benvinguda | Estat `ok` → botons «Anar al mapa» / «Anar al panell» + banner al panell | VerificaView + PanelView |
| Pàgina «Revisa el teu correu» | `/#/revisa-correu` amb el correu mostrat | `CheckEmailView.tsx` |
| Botó per reenviar | `POST /api/auth/verify` (màx. 3 per 5 min per IP) | verify POST |
| Token amb caducitat | 24 h (`expiresAt`), token aleatori de 48 caràcters hex | register / verify |
| Nou token si ha caducat | Estat `caducat` → botó de reenviament → token NOU (l'antic queda anul·lat) | verify |
| Bloqueig de funcions principals fins verificar | El servidor retorna **403 `EMAIL_NOT_VERIFIED`** a la consulta detallada (`/api/lookup`) amb el correu emmascarat; el mapa mostra el panell de verificació amb reenviament | `_impl/lookup/route.ts` + `MapView.tsx` |
| Error si l'enllaç ja s'ha utilitzat | Estat específic `ja_usat` amb missatge propi | verify + VerificaView |
| Protecció contra registres repetits | `409 EMAIL_EXISTS` si el correu ja hi és | register |
| Confirmació visual | Banner verd `ok` + estat del compte al panell (BadgeCheck) | VerificaView + PanelView |

**Detalls de seguretat de la verificació:**
- Un sol ús lògic: en verificar, **tots** els altres enllaços pendents del
  compte es marquen com a usats (`updateMany` dins de la transacció).
- Comptes Google: es guarden com a verificats (`email_verified=true` s'exigeix
  a l'OAuth abans d'acceptar el compte) — `_impl/auth/google/callback/route.ts`.
- Modes sandbox: sense `RESEND_API_KEY` els correus es guarden a `EmailLog`
  (visibles al panell d'administració) sense enviar-ne cap.

---

## 3. Bloc 2 — Recuperació de contrasenya

| Requisit | Implementació | Fitxer |
|---|---|---|
| «He oblidat la contrasenya» | Enllaç visible al formulari d'entrada | `AuthView.tsx` (mode `login`) |
| Formulari de correu | `/#/oblidat` | AuthView (mode `forgot`) |
| Correu de recuperació | `resetMail()` — resposta sempre `ok` (no revela si el compte existeix) | `_impl/auth/password-reset/route.ts` |
| Enllaç segur temporal | `/#/restablir?token=…`, vàlid **1 hora**; el token va al fragment (`#`) → no surt als logs del servidor | mail.ts |
| Formulari de nova contrasenya | `/#/restablir` (mínim 8 caràcters, validat al servidor) | `_impl/auth/password-reset/confirm/route.ts` |
| Confirmació | **Pantalla nova de confirmació** «Contrasenya canviada» amb els CTAs al mapa/panell | AuthView (afegit en aquesta fase) |
| Invalidació de tokens després d'usar-lo | `used: true` + **tots** els altres tokens pendents del compte anul·lats | password-reset/confirm |
| Mesures extra | Revoca TOTES les sessions anteriors i n'emet una de nova; esdeveniment `PASSWORD_RESET` al historial | password-reset/confirm |

---

## 4. Bloc 3 — Login i sessions

| Requisit | Implementació | Fitxer |
|---|---|---|
| Inici amb correu + contrasenya | Comparació bcrypt; missatge d'error genèric (`BAD_CREDENTIALS`) que no revela si el compte existeix | `_impl/auth/login/route.ts` |
| Tancament de sessió | `POST /api/auth/logout` (esborra la cookie) + botons a capçalera i panell | `_impl/auth/logout/route.ts` |
| Recordar sessió de forma segura | JWT HS256 dins de cookie **httpOnly + SameSite=Lax + Secure** (30 dies) | `lib/auth.ts` |
| Redirecció automàtica si no autenticat | El panell mostra «Has d'iniciar la sessió» amb CTA; les API privades responen 401 | PanelView + `requireUser()` |
| Protecció de pàgines privades | `requireUser()` verifica JWT **i** usuari a la BD (existeix, actiu, `tokenVersion` vigent) en cada petició; rol/pla FRESCOS de la BD, no del JWT | `lib/auth.ts` |
| Expiració de sessions | JWT amb expiració de 30 dies; cookie `maxAge` equivalent | lib/auth.ts |
| Tancar sessions en altres dispositius | **`POST /api/auth/sessions/revoke-all` — NOU.** Incrementa `tokenVersion` (revoca tots els JWT antics) i emet sessió nova per al dispositiu actual. El botó del panell ja existia però el servidor responia 404; ara funciona | `_impl/auth/sessions/revoke-all/route.ts` (NOU) |
| Extra | Canviar la contrasenya tanca totes les sessions d'altres dispositius (mateix mecanisme) | change-password |

---

## 5. Bloc 4 — Perfil

| Requisit | Implementació | Fitxer |
|---|---|---|
| Nom (i cognoms si cal) | Camp «Nom» editable al panell → Perfil (sanitzat, màx. 80) | `_impl/account/route.ts` PATCH |
| Correu | Mostrat al panell (no editable — canviar-lo exigiria re-verificació; fora d'abast Fase 1) | PanelView |
| Estat de verificació | «Correu verificat ✓» o «No verificat — reenviar» | PanelView (Resum) |
| Edició de dades | `PATCH /api/account` (nom, idioma) | account |
| Canvi de contrasenya | `POST /api/auth/change-password`: exigeix l'actual, valida ≥ 8, revoca sessions d'altres dispositius mantenint l'actual | `_impl/auth/change-password/route.ts` |
| Preferències | Idioma (català/castellà) persistit a la BD (`locale`) i a `localStorage` | account PATCH + PanelView |
| Historial d'activitat | `GET /api/account/activity`: últims 20 esdeveniments propis + últim inici de sessió, amb etiquetes llegibles bilingües | `_impl/account/activity/route.ts` + PanelView |
| Eliminació del compte | `DELETE /api/account` amb confirmació «ESBORRA»: esborra dades personals, preferits, informes, subscripcions i correus; **anonimitza** els registres d'ús (SearchLog/Event) per conservar agregats sense PII; revoca sessions; registra a l'audit log | `_impl/account/route.ts` DELETE |
| Extra RGPD | Descàrrega de dades pròpies des del perfil (`/api/account/export`) | PanelView |

---

## 6. Incidències trobades i corregides en aquesta auditoria

1. **CRÍTIC — L'enllaç de verificació queia en una pàgina en blanc.**
   El correu apunta a `/#/verifica?token=…` però aquesta vista no existia:
   l'usuari no hauria pogut verificar el correu MAI. **Corregit** creant
   `VerificaView.tsx` + la ruta a `AppShell.tsx`.
2. **CRÍTIC — `POST /api/auth/sessions/revoke-all` no existia.** El dispatcher
   l'importava (el build fallava sense ell) i el panell el cridava (404).
   **Corregit** creant el handler.
3. **ALT — Enllaços dels correus podien sortir relatius o malformats** si
   `NEXT_PUBLIC_SITE_URL` falta o està mal escrita (el cas del desplegament:
   `https//…`). **Corregit**: `mail.ts` fa servir `getSiteUrlOrigin()` (mai
   llança, sempre absoluta) i el redirect de verificació valida l'env abans.
4. **MITJÀ — Faltava la confirmació visual del restabliment de contrasenya.**
   **Corregit**: pantalla «Contrasenya canviada» amb informació de sessions
   tancades.
5. **Nota sobre la còpia v9**: el `PanelView.tsx` del ZIP v9 tenia una línia
   trencada (`}, istory, …])`) que hauria trencat el panell; la versió actual
   ja hi és correcta i el ZIP inclou el fitxer arreglat.

---

## 7. Seguretat (revisió transversal)

- **Rate limiting compartit a BD** (taula `RateLimit`) per IP: registre 8/min,
  login 10/min, reenviament de verificació 3/5 min, restabliment 5/min,
  confirmació 10/min, canvi de contrasenya i revocació 5/5 min.
- **Tokens**: aleatoris de 24 bytes (`crypto.randomBytes`), d'un sol ús, amb
  caducitat (24 h verificació / 1 h restabliment) i anul·lació en cadena dels
  germans pendents.
- **No divulgació de dades**: errors genèrics a login/reset; correu emmascarat
  (`jo***@gmail.com`) a respostes compartides; l'eliminació del compte
  anonimitza els logs d'ús.
- **XSS**: escapament a correus (`escapeHtml`), sanitització del nom, React
  escapa per defecte; cap `dangerouslySetInnerHTML` amb dades d'usuari.
- **Open redirect**: cap — les redireccions de verificació només van al propi
  lloc amb ruta fixa `/#/panell?verificacio=…`.
- **Revolució immediata**: canvi de contrasenya / baixa → `tokenVersion +1`
  invalida tots els JWT a la següent petició.

---

## 8. Base de dades i desplegament

- **Esquema: intacte.** Les taules `EmailToken` i `PasswordToken` ja existien a
  la migració `init` (aplicada a Supabase). Cap migració nova, cap risc.
- **Variables d'entorn requerides a Vercel** (totes marcant Production +
  Preview + Development):
  - `DATABASE_URL` — pooler transaccional (port 6543, `pgbouncer=true`)
  - `AUTH_SECRET` — obligatori en producció (`openssl rand -hex 32`)
  - `NEXT_PUBLIC_SITE_URL` — `https://preureal.vercel.app` (ben escrita!)
  - `RESEND_API_KEY` + `MAIL_FROM` — perquè els correus surtin de veritat; si
    manquen, mode sandbox amb registre a `EmailLog` (panell d'admin)

## 9. Pendents recomanats (fora d'abasc Fase 1)

1. Connectar Resend (clau + domini verificat per a `MAIL_FROM`) — sense això
   els correus no s'envien de veritat.
2. Rotar la contrasenya de la BD de Supabase (va quedar exposada al Terminal).
3. Canviar la contrasenya de l'admin per defecte (`PreuReal2026!`).
4. Futures millores: canvi de correu amb re-verificació, 2FA opcional.
