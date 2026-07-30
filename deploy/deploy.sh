#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR=${APP_DIR:-/srv/erp-pos/app}
cd "$APP_DIR"

mkdir -p /srv/erp-pos/postgres /srv/erp-pos/media/products /srv/erp-pos/media/receipts /srv/erp-pos/media/temp /srv/erp-pos/backups

./deploy/backup.sh || true

docker compose --env-file .env -f docker-compose.production.yml pull
docker compose --env-file .env -f docker-compose.production.yml up -d postgres
docker compose --env-file .env -f docker-compose.production.yml run --rm backend npx prisma migrate deploy
docker compose --env-file .env -f docker-compose.production.yml up -d --remove-orphans

./deploy/health-check.sh
