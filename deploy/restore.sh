#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /path/to/postgres.dump [/path/to/media.tar.gz]" >&2
  exit 2
fi

APP_DIR=${APP_DIR:-/srv/erp-pos/app}
MEDIA_DIR=${MEDIA_DIR:-/srv/erp-pos/media}
DB_DUMP=$1
MEDIA_ARCHIVE=${2:-}

cd "$APP_DIR"
set -a
source .env
set +a

docker compose --env-file .env -f docker-compose.production.yml exec -T postgres \
  pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$DB_DUMP"

if [[ -n "$MEDIA_ARCHIVE" ]]; then
  mkdir -p "$MEDIA_DIR"
  tar -C "$MEDIA_DIR" -xzf "$MEDIA_ARCHIVE"
fi
