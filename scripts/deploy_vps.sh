#!/usr/bin/env bash
# ============================================================================
# PreuReal.cat — bootstrap de un VPS Ubuntu 22.04/24.04 recién creado
#
# Uso (EN el VPS, como root):
#   ssh root@TU_IP
#   bash deploy_vps.sh
#
# Qué hace: instala Docker Engine + compose, configura el firewall (22/80/443)
# y crea el usuario 'deploy' (grupo docker). NO toca tu código ni tus secretos.
# ============================================================================
set -euo pipefail

if [ "$(id -u)" != "0" ]; then echo "✗ Ejecuta como root (sudo su -)"; exit 1; fi
if ! grep -qi ubuntu /etc/os-release; then echo "⚠ Probado en Ubuntu 22.04/24.04"; fi

echo "» [1/4] Actualizando el sistema…"
apt-get update -y && apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw sqlite3

echo "» [2/4] Instalando Docker Engine + plugin compose…"
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

echo "» [3/4] Firewall UFW: solo 22 / 80 / 443…"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "» [4/4] Usuario 'deploy' (grupo docker)…"
id -u deploy &>/dev/null || useradd -m -s /bin/bash -G docker deploy

cat <<'NEXT'

✓ VPS listo. Continúa como usuario 'deploy':

    su - deploy
    git clone <TU_REPO_PRIVADO> ~/preureal && cd ~/preureal
    cp .env.production.example .env && nano .env     # AUTH_SECRET, ADMIN_PASSWORD, DOMAIN
    docker compose build
    docker compose up -d
    docker compose logs -f app                        # Ctrl+C para salir
    curl -s http://localhost/api/health               # debe responder {"status":"ok"...}

NEXT
