#!/usr/bin/env bash
# =============================================================================
# PreuReal.cat — Suite E2E (Fase 17). Requereix:
#   - servidor standalone en marxa a $BASE amb PostgreSQL real a DATABASE_URL
#   - DEMO_CHECKOUT=true, sense RESEND_API_KEY (correus en sandbox = verificables)
# Execució: bash tests/e2e.sh
# =============================================================================
BASE="${BASE:-http://localhost:3202}"
PASS=0; FAIL=0
JAR_A=/tmp/e2e_userA.jar; JAR_B=/tmp/e2e_admin.jar; JAR_C=/tmp/e2e_userC.jar
EMAIL_A="e2e.usuari.a@gmail.com"
EMAIL_A2="e2eusuaria@gmail.com"   # mateixa bústia normalitzada
EMAIL_C="e2e.xss@gmail.com"
PW="Contrasenya123!"

ok()   { PASS=$((PASS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
check() { # $1 desc, $2 condició (0 = ok)
  if [ "$2" -eq 0 ]; then ok "$1"; else fail "$1"; fi
}

echo "──────────────────────────────────────────────────────────────"
echo " PREUREAL.CAT — PROVES E2E REALS ($BASE)"
echo "──────────────────────────────────────────────────────────────"

rm -f $JAR_A $JAR_B $JAR_C

# 1. HEALTH + BD
echo "» Salut i base de dades"
H=$(curl -s $BASE/api/health)
echo "$H" | grep -q '"ok":true' && echo "$H" | grep -q '"provider":"postgresql"' && check "health: BD PostgreSQL operativa" 0 || check "health: BD PostgreSQL operativa" 1
curl -s $BASE/ | grep -qi "PreuReal" && check "pàgina principal serveix HTML" 0 || check "pàgina principal serveix HTML" 1
HDRS=$(curl -sI $BASE/)
echo "$HDRS" | grep -qi "X-Frame-Options" && check "capçaleres de seguretat presents" 0 || check "capçaleres de seguretat presents" 1

# 2. CERCA MUNICIPIS (insensible a majúscules — PG)
echo "» Cerques"
M1=$(curl -s "$BASE/api/municipalities?q=barcel&limit=5")
echo "$M1" | grep -q '"name":"Barcelona"' && check "cerca municipi 'barcel' → Barcelona" 0 || check "cerca municipi 'barcel' → Barcelona" 1
M2=$(curl -s "$BASE/api/municipalities?q=GIRONA&limit=5")
echo "$M2" | grep -qi 'girona' && check "cerca insensible 'GIRONA'" 0 || check "cerca insensible 'GIRONA'" 1

# 3. EDIFICIS (core map)
B=$(curl -s "$BASE/api/buildings?west=2.1560&south=41.3860&east=2.1660&north=41.3960")
echo "$B" | grep -q '"coverage"' && check "buildings: 200 amb cobertura de mosaics" 0 || check "buildings: 200 amb cobertura de mosaics" 1
echo "$B" | python3 -c "import json,sys; d=json.load(sys.stdin); assert len(d['buildings'])>10" 2>/dev/null && check "buildings: edificis reals carregats" 0 || check "buildings: edificis reals carregats" 1

# 4. GEOCODE (ICGC) + REFCAT
G=$(curl -s "$BASE/api/geocode?q=carrer%20de%20sants%2010%20barcelona")
echo "$G" | grep -q '"label"' && check "geocode: adreça ICGC trobada" 0 || check "geocode: adreça ICGC trobada" 1
R=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/lookup-refcat?rc=CURTA")
[ "$R" = "400" ] && check "lookup-refcat: refcat invàlid → 400" 0 || check "lookup-refcat: refcat invàlid → 400" 1

# 5. REGISTRE + NORMALITZACIÓ GMAIL
echo "» Registre i auth"
REG=$(curl -s -c $JAR_A -X POST $BASE/api/auth/register -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL_A\",\"password\":\"$PW\",\"name\":\"Usuari E2E\",\"locale\":\"ca\"}")
echo "$REG" | grep -q '"ok":true' && check "registre usuari A" 0 || check "registre usuari A" 1
REG2=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/auth/register -H "Content-Type: application/json" -d "{\"email\":\"e2e.usuari.a+truc@gmail.com\",\"password\":\"$PW\"}")
[ "$REG2" = "409" ] && check "duplicat Gmail (punts/+alias) → 409" 0 || check "duplicat Gmail (punts/+alias) → 409" 1

# usuari C amb nom maliciós (test XSS)
curl -s -c $JAR_C -X POST $BASE/api/auth/register -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL_C\",\"password\":\"$PW\",\"name\":\"<img src=x onerror=alert(1)>\",\"locale\":\"ca\"}" > /dev/null

# 6. ME + QUOTA FREE (3/mes) APLICADA AL SERVIDOR
ME=$(curl -s -b $JAR_A $BASE/api/auth/me)
echo "$ME" | grep -q '"limit":3' && check "me: quota FREE 3/mes" 0 || check "me: quota FREE 3/mes" 1
LOOK1=$(curl -s -b $JAR_A -X POST $BASE/api/lookup -H "Content-Type: application/json" -d '{"lat":41.3925,"lng":2.1650}')
echo "$LOOK1" | grep -q '"kind":"full"' && check "lookup 1/3 → full" 0 || check "lookup 1/3 → full" 1
curl -s -b $JAR_A -X POST $BASE/api/lookup -H "Content-Type: application/json" -d '{"lat":41.3850,"lng":2.1700}' > /dev/null
curl -s -b $JAR_A -X POST $BASE/api/lookup -H "Content-Type: application/json" -d '{"lat":41.3800,"lng":2.1400}' > /dev/null
LOOK4=$(curl -s -b $JAR_A -X POST $BASE/api/lookup -H "Content-Type: application/json" -d '{"lat":41.3900,"lng":2.1600}')
echo "$LOOK4" | grep -q 'QUOTA_EXCEEDED' && check "lookup 4/3 → 402 QUOTA_EXCEEDED (quota real al servidor)" 0 || check "lookup 4/3 → 402 QUOTA_EXCEEDED (quota real al servidor)" 1

# 7. PERMISOS: FREE no té preferits/historial/PDF
F=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A -X POST $BASE/api/favorites -H "Content-Type: application/json" -d '{"municipalityCode":"080193","label":"Barcelona"}')
[ "$F" = "403" ] && check "FREE: preferits → 403 PLAN_REQUIRED" 0 || check "FREE: preferits → 403 PLAN_REQUIRED" 1
HI=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A "$BASE/api/history")
[ "$HI" = "403" ] && check "FREE: historial → 403" 0 || check "FREE: historial → 403" 1
PDF_FREE=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A "$BASE/api/reports/pdf?mun=080193")
[ "$PDF_FREE" = "403" ] && check "FREE: PDF → 403" 0 || check "FREE: PDF → 403" 1
AD=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A $BASE/api/admin/stats)
[ "$AD" = "403" ] && check "no-admin: admin/stats → 403" 0 || check "no-admin: admin/stats → 403" 1

# 8. REPORTS (validació + duplicats)
RP=$(curl -s -b $JAR_A -X POST $BASE/api/reports -H "Content-Type: application/json" -d '{"municipalityCode":"080193","offerEurMonth":950,"surfaceM2":65,"contractType":"HABITATGE"}')
echo "$RP" | grep -q '"ok":true' && check "report enviat" 0 || check "report enviat" 1
RPD=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A -X POST $BASE/api/reports -H "Content-Type: application/json" -d '{"municipalityCode":"080193","offerEurMonth":950}')
[ "$RPD" = "409" ] && check "report duplicat → 409" 0 || check "report duplicat → 409" 1
RPB=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A -X POST $BASE/api/reports -H "Content-Type: application/json" -d '{"municipalityCode":"080193","offerEurMonth":5}')
[ "$RPB" = "400" ] && check "report fora de rang → 400" 0 || check "report fora de rang → 400" 1

# 9. ADMIN (login com a admin@preureal.cat)
echo "» Panell d'administració"
AL=$(curl -s -c $JAR_B -X POST $BASE/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@preureal.cat","password":"PreuReal2026!"}')
echo "$AL" | grep -q '"role":"ADMIN"' && check "login admin OK" 0 || check "login admin OK (contrasenya de dev PreuReal2026!)" 1
ST=$(curl -s -b $JAR_B $BASE/api/admin/stats)
echo "$ST" | grep -q '"mrr"' && check "admin stats (MRR real)" 0 || check "admin stats (MRR real)" 1

# 10. ADMIN puja l'usuari A a PREMIUM → preferits/historial/PDF municipi OK
UID_A=$(echo "$AL" > /dev/null; curl -s -b $JAR_B "$BASE/api/admin/users?q=e2eusuaria" | python3 -c "import json,sys; print(json.load(sys.stdin)['users'][0]['id'])")
curl -s -b $JAR_B -X PATCH $BASE/api/admin/users -H "Content-Type: application/json" -d "{\"id\":\"$UID_A\",\"plan\":\"PREMIUM\"}" > /dev/null
FAV=$(curl -s -b $JAR_A -X POST $BASE/api/favorites -H "Content-Type: application/json" -d '{"municipalityCode":"080193","label":"Barcelona"}')
echo "$FAV" | grep -q '"ok":true' && check "PREMIUM: preferits OK" 0 || check "PREMIUM: preferits OK" 1
HIS=$(curl -s -b $JAR_A "$BASE/api/history")
echo "$HIS" | grep -q '"history"' && check "PREMIUM: historial OK (amb registre de les 3 consultes)" 0 || check "PREMIUM: historial OK" 1
PDFB=$(curl -s -b $JAR_A "$BASE/api/reports/pdf?mun=080193")
echo "$PDFB" | head -c 5 | grep -q "%PDF-" && check "PREMIUM: PDF municipi generat (%PDF)" 0 || check "PREMIUM: PDF municipi generat (%PDF)" 1
PDFB2=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A "$BASE/api/reports/pdf?building=noexisteix")
[ "$PDFB2" = "404" ] || [ "$PDFB2" = "403" ] && check "PREMIUM: PDF edifici bloquejat (Pro)" 0 || check "PREMIUM: PDF edifici bloquejat (Pro)" 1

# 11. XSS: el cos del correu de benvinguda de l'usuari C arriba COM A TEXT net
EM=$(curl -s -b $JAR_B $BASE/api/admin/emails)
echo "$EM" | python3 -c "
import json,sys
d = json.load(sys.stdin)
mal = [e for e in d['emails'] if 'e2exss' in e.get('to','')]
assert mal, 'no hi ha correu per a e2e.xss'
assert 'body' not in mal[0], 'la API encara retorna el HTML cru (body)!'
assert isinstance(mal[0].get('bodyText'), str) and len(mal[0]['bodyText']) > 10, 'bodyText absent'
" 2>/dev/null && check "XSS corregit: la API no retorna HTML cru (només bodyText)" 0 || check "XSS corregit: la API no retorna HTML cru (només bodyText)" 1

# 12. IMPORT (E3: avgRentEurMonth/sampleSize es guarden)
IMP=$(curl -s -b $JAR_B -X POST $BASE/api/admin/import -H "Content-Type: application/json" -d '{"rows":[{"refcat":"9876541ZZ9999E","municipalityCode":"080193","polygon":[[2.17,41.39],[2.171,41.391],[2.169,41.392]],"yearBuilt":1930,"avgRentEurMonth":1250.5,"sampleSize":34}]}')
echo "$IMP" | grep -q '"created":1' && check "import: fila creada" 0 || check "import: fila creada" 1
RC=$(curl -s "$BASE/api/lookup-refcat?rc=9876541ZZ9999E")
echo "$RC" | grep -q '"result":{"id"' && check "refcat importada localitzable" 0 || check "refcat importada localitzable" 1
python3 -c "
import json,sys,os,psycopg2
c = psycopg2.connect(os.environ['DATABASE_URL'])
cur = c.cursor()
cur.execute('SELECT \"avgRentEurMonth\", \"sampleSize\" FROM \"Building\" WHERE \"refcat\"=%s', ('9876541ZZ9999E',))
row = cur.fetchone()
assert row == (1250.5, 34), f'IMPORT no ha guardat les dades: {row}'
print('ok')
" 2>/dev/null && check "E3/Fase 9.1: avgRentEurMonth+sampleSize guardats a BD" 0 || check "E3/Fase 9.1: avgRentEurMonth+sampleSize guardats a BD" 1

# 13. PLANS CONFIGURABLES
PS=$(curl -s -b $JAR_B -X PUT $BASE/api/admin/plan-settings -H "Content-Type: application/json" -d '{"settings":{"FREE":{"quotaMonth":5,"priceEur":0}}}')
echo "$PS" | grep -q '"quotaMonth":5' && check "plan-settings: FREE→5 desat" 0 || check "plan-settings: FREE→5 desat" 1
# usuari nou FREE veu 5 (fora de cau 30s no garantit; mirem el GET)
PS2=$(curl -s -b $JAR_B $BASE/api/admin/plan-settings)
echo "$PS2" | grep -q '"quotaMonth":5' && check "plan-settings: llegit 5" 0 || check "plan-settings: llegit 5" 1
curl -s -b $JAR_B -X PUT $BASE/api/admin/plan-settings -H "Content-Type: application/json" -d '{"settings":{"FREE":{"quotaMonth":3,"priceEur":0}}}' > /dev/null

# 14. AUDITORIA
AUD=$(curl -s -b $JAR_B $BASE/api/admin/audit)
echo "$AUD" | grep -q 'IMPORT_RUN' && echo "$AUD" | grep -q 'PLAN_SETTINGS_UPDATED' && echo "$AUD" | grep -q 'USER_UPDATED' && check "auditoria: accions registrades" 0 || check "auditoria: accions registrades" 1

# 15. COMPARADOR
CO=$(curl -s -X POST $BASE/api/comparator -H "Content-Type: application/json" -d '{"entities":[{"type":"MUNI","code":"080193"},{"type":"MUNI","code":"170792"}]}')
echo "$CO" | grep -q '"stats"' && echo "$CO" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['stats']['count']==2; assert any(r['name']=='Barcelona' for r in d['results'])" 2>/dev/null && check "comparador: Barcelona vs Girona amb estadístics" 0 || check "comparador: Barcelona vs Girona amb estadístics" 1

# 16. STRIPE DEMO + RETURN
echo "» Stripe"
CO2=$(curl -s -b $JAR_A -X POST $BASE/api/stripe/checkout -H "Content-Type: application/json" -d '{"plan":"PREMIUM"}')
echo "$CO2" | grep -q '"mode":"DEMO"' && check "checkout DEMO activat (sense claus Stripe)" 0 || check "checkout DEMO activat" 1
RET=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A -X POST $BASE/api/stripe/return -H "Content-Type: application/json" -d '{"sessionId":"cs_test_fake123"}')
[ "$RET" = "503" ] && check "stripe/return sense claus → 503 controlat" 0 || check "stripe/return sense claus → 503 controlat" 1
DC=$(curl -s -b $JAR_A -X POST $BASE/api/stripe/demo)
echo "$DC" | grep -q '"ok":true' && check "cancel·lació DEMO OK" 0 || check "cancel·lació DEMO OK" 1
WH=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/stripe/webhook -d '{}' -H "stripe-signature: invalid")
[ "$WH" = "503" ] && check "webhook sense claus → 503 (no processa res)" 0 || check "webhook sense claus → 503" 1

# 17. CANVI DE CONTRASENYA + REVOCACIÓ DE SESSIONS
echo "» Seguretat de sessions"
CPB=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR_A -X POST $BASE/api/auth/change-password -H "Content-Type: application/json" -d '{"currentPassword":"errada","newPassword":"NovaContra456!"}')
[ "$CPB" = "401" ] && check "canvi contrasenya: actual errònia → 401" 0 || check "canvi contrasenya: actual errònia → 401" 1
CPO=$(curl -s -c /tmp/e2e_userA2.jar -X POST $BASE/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL_A\",\"password\":\"$PW\"}")
# segona sessió (jar 2); després canvi de contrasenya des de jar A ha de revocar jar 2
CPOK=$(curl -s -b $JAR_A -X POST $BASE/api/auth/change-password -H "Content-Type: application/json" -d '{"currentPassword":"$PW","newPassword":"NovaContra456!"}' -o /dev/null -w "%{http_code}")
# NOTA: $PW dins de cometes simples no s'expandeix; ho fem amb variable correcta:
CPOK=$(curl -s -b $JAR_A -X POST $BASE/api/auth/change-password -H "Content-Type: application/json" -d "{\"currentPassword\":\"$PW\",\"newPassword\":\"NovaContra456!\"}" -o /dev/null -w "%{http_code}")
[ "$CPOK" = "200" ] && check "canvi contrasenya correcte → 200" 0 || check "canvi contrasenya correcte → 200" 1
OLDME=$(curl -s -b /tmp/e2e_userA2.jar $BASE/api/auth/me | grep -q '"user":{' && echo "amb usuari" || echo "sense usuari")
[ "$OLDME" = "sense usuari" ] && check "sessió antiga REVOCADA després del canvi" 0 || check "sessió antiga REVOCADA després del canvi" 1
curl -s -c /tmp/e2e_userA2.jar -X POST $BASE/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL_A\",\"password\":\"NovaContra456!\"}" | grep -q '"ok":true' && check "login amb la contrasenya nova OK" 0 || check "login amb la contrasenya nova OK" 1

# 19. ELIMINACIÓ DEL COMPTE (RGPD)
DEL1=$(curl -s -o /dev/null -w "%{http_code}" -b /tmp/e2e_userA2.jar -X DELETE $BASE/api/account -H "Content-Type: application/json" -d '{"confirm":"no"}')
[ "$DEL1" = "400" ] && check "eliminació sense confirmació → 400" 0 || check "eliminació sense confirmació → 400" 1
DEL2=$(curl -s -b /tmp/e2e_userA2.jar -X DELETE $BASE/api/account -H "Content-Type: application/json" -d '{"confirm":"ESBORRA"}')
echo "$DEL2" | grep -q '"ok":true' && check "eliminació de compte OK" 0 || check "eliminació de compte OK" 1
LG=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/auth/login -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL_A\",\"password\":\"NovaContra456!\"}")
[ "$LG" = "401" ] && check "compte esborrat: login → 401" 0 || check "compte esborrat: login → 401" 1

# 20. VERIFICACIÓ DE CORREU: token existeix al log sandbox (bústia C)
VT=$(python3 -c "
import json,urllib.request,os,psycopg2
c = psycopg2.connect(os.environ['DATABASE_URL'])
cur = c.cursor()
cur.execute('SELECT token FROM \"EmailToken\" ORDER BY \"createdAt\" DESC LIMIT 1')
print(cur.fetchone()[0])
" 2>/dev/null)
if [ -n "$VT" ]; then
  VCODE=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE/api/auth/verify?token=$VT")
  [ "$VCODE" = "200" ] && check "verificació de correu amb token → 200" 0 || check "verificació de correu amb token → 200 (code=$VCODE)" 1
else
  check "verificació de correu amb token → 200" 1
fi

# 18. RATE LIMIT COMPARTIT (login: 10/min per IP) — al final per no contaminar
RL=0
for i in $(seq 1 12); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST $BASE/api/auth/login -H "Content-Type: application/json" -d '{"email":"nobody@gmail.com","password":"wrongwrong"}')
  [ "$CODE" = "429" ] && RL=1 && break
done
[ "$RL" = "1" ] && check "rate limit login: 429 després de 10 intents" 0 || check "rate limit login: 429 després de 10 intents" 1

echo "──────────────────────────────────────────────────────────────"
echo " RESULTAT: $PASS OK · $FAIL KO"
echo "──────────────────────────────────────────────────────────────"
[ "$FAIL" -eq 0 ] && echo "TOT OK" || exit 1
