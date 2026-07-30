#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR=${APP_DIR:-/srv/erp-pos/app}
cd "$APP_DIR"

set -a
source .env
set +a

./deploy/backup.sh

docker compose --env-file .env -f docker-compose.production.yml exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v owner_username="$PLATFORM_OWNER_USERNAME" \
  -f /dev/stdin < deploy/reset-test-data.sql
