#!/usr/bin/env bash
set -Eeuo pipefail

# Usage: verify-backup.sh [--remote | /path/to/postgres.dump]
# Restores a dump into a throwaway database and prints row counts.
# Default: newest local dump. --remote: newest dump in the off-site bucket.

APP_DIR=${APP_DIR:-/srv/erp-pos/app}
BACKUP_DIR=${BACKUP_DIR:-/srv/erp-pos/backups}
MEDIA_DIR=${MEDIA_DIR:-/srv/erp-pos/media}
VERIFY_DB=erp_pos_verify

cd "$APP_DIR"
set -a
source .env
set +a
source "$(dirname "$(readlink -f "$0")")/rclone.sh"

COMPOSE=(docker compose --env-file .env -f docker-compose.production.yml)
PSQL=("${COMPOSE[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq)

cleanup() {
  "${PSQL[@]}" -c "DROP DATABASE IF EXISTS $VERIFY_DB" || true
  if [[ -n ${FETCHED:-} ]]; then rm -f "$FETCHED"; fi
}
trap cleanup EXIT

if [[ ${1:-} == --remote ]]; then
  offsite_enabled || { echo "BACKUP_R2_* is not set" >&2; exit 2; }
  NAME=$(rclone lsf "backup:$BACKUP_R2_BUCKET/postgres" --include "postgres-*.dump" | sort | tail -1)
  [[ -n $NAME ]] || { echo "No dumps in backup:$BACKUP_R2_BUCKET/postgres" >&2; exit 1; }
  mkdir -p "$BACKUP_DIR/verify"
  rclone copyto "backup:$BACKUP_R2_BUCKET/postgres/$NAME" "/backups/verify/$NAME"
  DUMP=$BACKUP_DIR/verify/$NAME
  FETCHED=$DUMP
elif [[ -n ${1:-} ]]; then
  DUMP=$1
else
  DUMP=$(ls -1 "$BACKUP_DIR"/postgres-*.dump | sort | tail -1)
fi

echo "Verifying $DUMP"
"${PSQL[@]}" -c "DROP DATABASE IF EXISTS $VERIFY_DB" -c "CREATE DATABASE $VERIFY_DB"
"${COMPOSE[@]}" exec -T postgres \
  pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d "$VERIFY_DB" < "$DUMP"

"${COMPOSE[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$VERIFY_DB" -At -c "
  SELECT 'migrations', count(*)::text FROM _prisma_migrations
  UNION ALL SELECT 'stores', count(*)::text FROM \"Store\"
  UNION ALL SELECT 'users', count(*)::text FROM \"User\"
  UNION ALL SELECT 'products', count(*)::text FROM \"Product\"
  UNION ALL SELECT 'sales', count(*)::text FROM \"Sale\"
  UNION ALL SELECT 'last_sale', coalesce(max(\"createdAt\")::text, '-') FROM \"Sale\";"

echo "Restore OK"
