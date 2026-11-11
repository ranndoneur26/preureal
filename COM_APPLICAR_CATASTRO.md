# Com aplicar el fix del Catastro (any de construcció) — 2026-11-11

**Problema:** el servei oficial `COVCCatastro.svc/Consulta_DNPPC` de la D.G. del
Catastro ha estat retirat (404 a totes les operacions i al WSDL). La fitxa
d'edificis deixava de poder obtenir l'any de construcció i `/api/health`
reportava `catastro ok:false, status:404`.

**Solució:** migració al servei viu `OVCCallejero.asmx → Consulta_DNPRC`,
verificada en calent contra el servei real (parcel·les reals de Barcelona i
Sant Cugat del Vallès). Detall complet a `CHANGES.md`.

- **No cal cap migració de base de dades.**
- **No cal cap variable d'entorn nova.**
- Són 5 fitxers MODIFICATS (cap de nou). Cap canvi visual ni de disseny.

## Fitxers modificats

| Fitxer | Canvi |
|---|---|
| `src/lib/catastro.ts` | Migració del servei: `.svc/Consulta_DNPPC` → `OVCCallejero.asmx/Consulta_DNPRC` (Provincia + Municipio + RC; any a `<debi><ant>`). Retall RC 20→14, errors de negoci `<err>` amb HTTP 200 → null (mai s'inventa). Cau en BD intacte. |
| `src/app/api/_impl/lookup/route.ts` | Passa el context territorial (provincia, municipio, municipalityCode) a `getYearBuilt`. |
| `src/app/api/health/route.ts` | La prova de Catastro ara és una consulta real al servei viu amb parcel·la real i valida el XML (abans només mirava l'HTTP d'una URL morta). |
| `src/app/api/_impl/provenance/route.ts` | Text de font: `Consulta_DNPRC (OVCCallejero.asmx)`. |
| `src/app/api/_impl/reports/pdf/route.ts` | Text de font al PDF: `serveis lliures DNPRC`. |
| `CHANGES.md` | Entrada del fix amb la verificació executada. |

## Opció A — GitHub (web, la de sempre)

1. Descomprimeix aquest ZIP al teu ordinador.
2. Entra a github.com → repositori **preureal**.
3. Per a CADA fitxer del ZIP (mateixa ruta que dins del ZIP):
   - Fitxer existent: obre'l al repo → icona de llapis (Edit) → enganxa el
     contingut nou → **Commit changes** (un commit per fitxer o tots seguits).
4. Vercel farà el desplegament sol (1-2 minuts per commit).

## Opció B — Terminal

```bash
cp -R src/ /camí/al/preureal/
cp CHANGES.md /camí/al/preureal/
cd /camí/al/preureal
git add -A
git commit -m "Fix: migració servei Catastro a OVCCallejero.asmx/Consulta_DNPRC (el .svc ha estat retirat)"
git push
```

## Verificació després del desplegament (2 minuts)

1. `https://www.preureal.com/api/health` → `"catastro": {"ok": true, ...}`
2. Al mapa: zoom a un edifici de l'Eixample (l'Eixample no tenia l'any en
   cau perquè es va importar abans) → clic a un edifici → consulta → la fitxa
   ha de mostrar **Any de construcció** amb la font «Cadastre».
3. Nota: els edificis que ja tenien `yearBuilt` en BD el segueixen mostrant
   del cau; el servei nou només actua per als que falten.
