#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR=${APP_DIR:-/srv/erp-pos/app}
BACKUP_DIR=${BACKUP_DIR:-/srv/erp-pos/backups}
MEDIA_DIR=${MEDIA_DIR:-/srv/erp-pos/media}
RETENTION_DAYS=${RETENTION_DAYS:-14}
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"

set -a
source .env
set +a

DB_FILE="$BACKUP_DIR/postgres-$TIMESTAMP.dump"
MEDIA_FILE="$BACKUP_DIR/media-$TIMESTAMP.tar.gz"
CHECKSUM_FILE="$BACKUP_DIR/checksums-$TIMESTAMP.sha256"

docker compose --env-file .env -f docker-compose.production.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$DB_FILE"

tar -C "$MEDIA_DIR" -czf "$MEDIA_FILE" .
sha256sum "$DB_FILE" "$MEDIA_FILE" > "$CHECKSUM_FILE"

find "$BACKUP_DIR" -type f -mtime +"$RETENTION_DAYS" -name "*.dump" -delete
find "$BACKUP_DIR" -type f -mtime +"$RETENTION_DAYS" -name "*.tar.gz" -delete
find "$BACKUP_DIR" -type f -mtime +"$RETENTION_DAYS" -name "*.sha256" -delete

echo "Backup created:"
echo "  $DB_FILE"
echo "  $MEDIA_FILE"
echo "  $CHECKSUM_FILE"
echo "Restore DB with: ./deploy/restore.sh $DB_FILE"
