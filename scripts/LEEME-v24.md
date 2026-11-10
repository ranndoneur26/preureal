# v24 — Panell Premium útil · Instruccions per aplicar-ho al teu projecte

Data: 9 de novembre de 2026 · Toca **14 fitxers** (12 modificats + 2 nous)

## Què inclou aquesta versió

1. **Panell accionable**: Historial, Preferits i Comparacions tenen ara botons
   «Al mapa» / «Obrir» que reobren la consulta exacta (el mapa hi vola i obre
   el panell de detall; el comparador carrega la comparació desada).
2. **Resum mensual de preferits per correu** (opt-in): casella nova a
   Panell → Preferits. Els dies 1–3 de cada mes, qui la tingui activada rep un
   correu amb el preu mitjà vigent de cada preferit i l'enllaç directe.
   *El primer resum arribarà a principi del mes vinent.*

## Passos (GitHub Desktop, sense terminal)

1. **Baixa el zip** `PreuReal-cat-v24-panell-premium.zip` i descomprimeix-lo.
2. Dins veuràs la carpeta `preureal-v24/` amb aquesta estructura (és la teva
   carpeta del projecte, però NOMÉS amb els fitxers que canvien):

```
preureal-v24/
├── CHANGES.md
├── LEEME-v24.md                      (aquest document)
├── prisma/
│   ├── schema.prisma
│   └── migrations/20261109100000_user_alerts_enabled/migration.sql
└── src/
    ├── app/api/[[...path]]/route.ts
    ├── app/api/_impl/account/route.ts
    ├── app/api/_impl/auth/me/route.ts
    ├── app/api/_impl/buildings/[id]/route.ts        (NOU)
    ├── app/api/_impl/cron/emails/route.ts
    ├── app/api/_impl/municipalities/route.ts
    ├── components/app-context.ts
    ├── components/views/ComparadorView.tsx
    ├── components/views/MapView.tsx
    ├── components/views/PanelView.tsx
    └── lib/mail.ts
```

3. **Copia cada fitxer** sobre el seu lloc a la teva carpeta
   `Desktop/Feines 2025-26/preureal`, mantenint les mateixes subcarpetes
   (substitueix els existents; els 2 nous simplement s'afegeixen).
   Truc: al Finder pots obrir les dues finestres lado a lado i arrossegar
   carpeta per carpeta (`prisma/`, `src/`…) deixant-les caure A DINS de la
   teva carpeta del projecte — macOS preguntarà "Substituir?" → **Substituir**.
4. Obre **GitHub Desktop** → apareixeran els fitxers canviats →
   Summary: `v24: panell Premium útil (accions, comparacions, avisos preferits)`
   → **Commit to main** → **Push origin**.
5. Vercel desplegarà automàticament (~2 min). **La migració de la base de
   dades s'aplica sola durant el build** (`prisma migrate deploy`), no cal
   fer res a Supabase.

## Com comprovar-ho (2 minuts)

- **Deep link directe**: obre `https://preureal.vercel.app/#/mapa?mun=080734`
  → el mapa ha de volar a Cornellà de Llobregat i dibuixar-ne el límit.
- **Panell**: Historial i Preferits → botó «Al mapa» a cada fila;
  Comparacions → «Obrir» carrega la comparació al comparador.
- **Avisos**: Panell → Preferits → casella «Avisa'm per correu cada mes…» →
  missatge verd «ACTIVATS». (Amb correu real activat, el primer resum arriba
  els dies 1–3 del mes vinent; sense Resend, es veu al panell admin → Correus.)
- **Salut**: `https://preureal.vercel.app/api/health` ha de dir `"status":"ok"`.

## Si el desplegament falla

Vercel → pestaña **Deployments** → clica el desplegament vermell → llegeix el
**Build Log**. El més habitual: un fitxer copiat a una carpeta equivocada
(l'error diu quin fitxer falta). Revisa el pas 3 i torna a fer push.
