#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR=${APP_DIR:-/srv/erp-pos/app}
cd "$APP_DIR"

if [[ ! -f .env.rollback ]]; then
  echo ".env.rollback not found. Save previous BACKEND_IMAGE/FRONTEND_IMAGE there before deploy." >&2
  exit 2
fi

cp .env.rollback .env
docker compose --env-file .env -f docker-compose.production.yml pull
docker compose --env-file .env -f docker-compose.production.yml up -d --remove-orphans
./deploy/health-check.sh
