#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR=${APP_DIR:-/srv/erp-pos/app}
BACKUP_DIR=${BACKUP_DIR:-/srv/erp-pos/backups}
MEDIA_DIR=${MEDIA_DIR:-/srv/erp-pos/media}
RETENTION_DAYS=${RETENTION_DAYS:-14}
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"

# Cron and deploy.sh can start a backup at the same moment.
exec 8>/tmp/erp-pos-backup.lock
flock 8

set -a
source .env
set +a
source "$(dirname "$(readlink -f "$0")")/rclone.sh"

BACKUP_REMOTE_RETENTION_DAYS=${BACKUP_REMOTE_RETENTION_DAYS:-30}
COMPOSE=(docker compose --env-file .env -f docker-compose.production.yml)
DB_FILE="$BACKUP_DIR/postgres-$TIMESTAMP.dump"
MEDIA_FILE="$BACKUP_DIR/media-$TIMESTAMP.tar.gz"
CHECKSUM_FILE="$BACKUP_DIR/checksums-$TIMESTAMP.sha256"

echo "[$TIMESTAMP] backup started"

"${COMPOSE[@]}" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > "$DB_FILE.partial"
# A truncated dump fails to list; never keep or upload it.
"${COMPOSE[@]}" exec -T postgres pg_restore --list < "$DB_FILE.partial" > /dev/null
mv "$DB_FILE.partial" "$DB_FILE"

tar -C "$MEDIA_DIR" -czf "$MEDIA_FILE" .
(cd "$BACKUP_DIR" && sha256sum "$(basename "$DB_FILE")" "$(basename "$MEDIA_FILE")") > "$CHECKSUM_FILE"

find "$BACKUP_DIR" -type f -mtime +"$RETENTION_DAYS" -name "*.dump" -delete
find "$BACKUP_DIR" -type f -mtime +"$RETENTION_DAYS" -name "*.tar.gz" -delete
find "$BACKUP_DIR" -type f -mtime +"$RETENTION_DAYS" -name "*.sha256" -delete
find "$BACKUP_DIR" -type f -name "*.partial" -delete

if offsite_enabled; then
  REMOTE="backup:$BACKUP_R2_BUCKET"

  rclone copy /backups "$REMOTE/postgres" --include "*-$TIMESTAMP.*"

  if [[ ${STORAGE_PROVIDER:-local} == r2 && -n ${R2_BUCKET_NAME:-} ]]; then
    # Objects deleted or replaced in the app bucket are moved aside, not lost.
    rclone sync "images:$R2_BUCKET_NAME" "$REMOTE/images" \
      --checksum --fast-list --backup-dir "$REMOTE/images-deleted/$TIMESTAMP"
  fi

  rclone delete "$REMOTE/postgres" --min-age "${BACKUP_REMOTE_RETENTION_DAYS}d"
  # Moved objects keep their original mtime, so expire by the run timestamp in the path.
  CUTOFF=$(date -u -d "-$BACKUP_REMOTE_RETENTION_DAYS days" +"%Y%m%dT%H%M%SZ")
  for dir in $(rclone lsf --dirs-only "$REMOTE/images-deleted" 2>/dev/null || true); do
    if [[ ${dir%/} < $CUTOFF ]]; then
      rclone purge "$REMOTE/images-deleted/${dir%/}"
    fi
  done
else
  echo "BACKUP_R2_* is not set: backup kept on this server only." >&2
fi

if [[ -n ${BACKUP_HEARTBEAT_URL:-} ]]; then
  curl -fsS -m 10 --retry 3 "$BACKUP_HEARTBEAT_URL" > /dev/null || echo "Heartbeat ping failed" >&2
fi

echo "Backup created:"
echo "  $DB_FILE"
echo "  $MEDIA_FILE"
echo "  $CHECKSUM_FILE"
echo "Restore DB with: ./deploy/restore.sh $DB_FILE"
