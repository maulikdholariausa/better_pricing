#!/bin/bash
# Ubuntu 24.04 LTS. Run as root after copying this project to the instance.
set -euo pipefail
umask 027
if [[ $EUID -ne 0 ]]; then echo 'Run with sudo.' >&2; exit 1; fi
source /etc/os-release
if [[ $ID != ubuntu || $VERSION_ID != 24.04 ]]; then echo 'This script targets Ubuntu 24.04 LTS.' >&2; exit 1; fi
APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
DOMAIN="${DOMAIN:-}"
if [[ ! $DOMAIN =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ || $DOMAIN != *.* ]]; then
  echo 'Provide a DNS hostname: sudo DOMAIN=quotes.example.com bash deploy/ec2-startup.sh' >&2; exit 1
fi
if [[ ! -f $APP_DIR/package-lock.json ]]; then echo 'Project and package-lock.json must be present.' >&2; exit 1; fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  ARCH=$(dpkg --print-architecture)
  echo "deb [arch=$ARCH signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $VERSION_CODENAME stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker compose version
systemctl enable --now docker
install -d -m 0700 -o 1000 -g 1000 /srv/contract-negotiations/data
cd "$APP_DIR"
printf 'DOMAIN=%s\nDATA_PATH=/srv/contract-negotiations/data\n' "$DOMAIN" > .env
chmod 600 .env
docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 180
echo "Deployment started: https://$DOMAIN"
echo 'Check HTTPS after DNS resolves. Logs: sudo docker compose logs --tail=100'
