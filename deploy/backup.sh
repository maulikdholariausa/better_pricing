#!/bin/bash
# Run as root from the project directory. Stops writes for a consistent DB/files archive.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
source .env
BACKUP_DIR="${BACKUP_DIR:-/srv/contract-negotiations/backups}"
mkdir -p "$BACKUP_DIR"
archive="$BACKUP_DIR/quotes-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
docker compose stop app
trap 'docker compose start app' EXIT
tar -czf "$archive" -C "$DATA_PATH" .
echo "$archive"
