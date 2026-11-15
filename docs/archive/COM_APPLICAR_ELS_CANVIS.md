# Com aplicar els canvis (Fase 1 — Registre d'usuaris)

Aquest ZIP conté els fitxers nous i modificats del sistema de registre
d'usuaris de PreuReal.cat. **No cal tocar la base de dades ni executar cap
migració**: les taules ja existeixen a Supabase.

## Opció A — Subir-ho amb GitHub (web, la de sempre)

1. Descomprimeix el ZIP al teu ordinador. Veureu carpetes `src/` i dos
   documents `.md` a l'arrel.
2. Entra a `github.com/ranndoneur26` → repositori **preureal**.
3. Per CADA fitxer del ZIP (mateixa ruta que dins del ZIP):
   - Navega a la carpeta corresponent del repo → obre el fitxer → icona de
     llapis (Edit) → enganxa el contingut nou → **Commit changes**.
   - Per als fitxers NOUS (no existeixen al repo): obre la carpeta on van →
     **Add file → Create new file** → escriu el nom complet de la ruta
     (ex.: `src/components/views/VerificaView.tsx`) → enganxa el contingut →
     Commit.
4. Quan acabis, Vercel farà el desplegament sol (un commit = un deploy).
   Comprova a `vercel.com/digitalformacio/preureal/deployments` que queda
   verd (1-2 minuts).

> Truc: si GitHub permet «Upload files» arrossegant (Add file → Upload files
> dins d'una carpeta), pots arrossegar els fitxers del ZIP respectant les
> carpetes; GitHub manté les rutes.

## Opció B — Amb Terminal (més ràpid)

Des de la carpeta on has descomprimit el ZIP (`preureal` = el teu repo local):

```bash
cp -R src/ /camí/al/preureal/
cp AUDITORIA_FASE1_REGISTRE.md COM_APPLICAR_ELS_CANVIS.md /camí/al/preureal/
cd /camí/al/preureal
git add -A
git commit -m "Fase 1: registre d'usuaris complet (verificació, sessions, perfil)"
git push
```

## Fitxers NOUS (no existeixen al repo actual)

| Ruta | Què és |
|---|---|
| `src/components/views/VerificaView.tsx` | Pàgina on aterra l'enllaç «Verificar correu» del correu electrònic |
| `src/components/views/CheckEmailView.tsx` | Pàgina «Revisa el teu correu» |
| `src/app/api/_impl/auth/sessions/revoke-all/route.ts` | Tancar sessions d'altres dispositius |
| `src/app/api/_impl/account/activity/route.ts` | Historial d'activitat del compte |
| `src/lib/site-url.ts` | Guardia d'URL del lloc (mai falla per env mal escrita) |
| `src/lib/analytics.ts` | Registre d'esdeveniments del compte |

## Fitxers MODIFICATS (substitueix el contingut pel del ZIP)

- `src/app/api/[[...path]]/route.ts` — dispatcher (+2 rutes noves)
- `src/app/api/_impl/auth/verify/route.ts`
- `src/app/api/_impl/auth/register/route.ts`
- `src/app/api/_impl/auth/login/route.ts`
- `src/app/api/_impl/auth/password-reset/confirm/route.ts`
- `src/app/api/_impl/auth/google/callback/route.ts`
- `src/app/api/_impl/lookup/route.ts`
- `src/components/AppShell.tsx`
- `src/components/views/AuthView.tsx`
- `src/components/views/MapView.tsx`
- `src/components/views/PanelView.tsx`
- `src/lib/auth.ts` · `src/lib/i18n.ts` · `src/lib/mail.ts` · `src/lib/security.ts`
- `src/app/layout.tsx`
- `package.json` (només la versió: 0.7.0)
- `.env.production.example` · `VERCEL.md` (documentació)
- `tests/unit.test.ts` (tests unitaris amb bun)

## Comprovació final (5 minuts)

1. **Registre**: `preureal.vercel.app` → Registra't → ha d'aparèixer «Revisa
   el teu correu».
2. **Correu**: si `RESEND_API_KEY` encara no està configurada, el correu es
   queda registrat al **panell d'administració** (Sandbox/E-mails): pots obrir
   l'enllaç des d'allà per provar la verificació.
3. **Verificació**: clica «Verificar correu» → «Correu verificat
   correctament» + el panell mostra «Correu verificat ✓».
4. **Bloqueig**: amb un compte NO verificat, una consulta detallada al mapa
   mostra el panell de verificació (el servidor retorna 403).
5. **Restabliment**: «He oblidat la contrasenya» → correu → nova contrasenya
   → pantalla «Contrasenya canviada».
6. **Sessions**: panell → Seguretat → «Tanca les sessions d'altres
   dispositius» → missatge de confirmació (ja no dona error).
