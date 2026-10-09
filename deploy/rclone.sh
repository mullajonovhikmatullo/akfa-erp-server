# Sourced by backup.sh and verify-backup.sh after .env is loaded.
# Remotes: "images" is the app bucket (R2_*), "backup" is the off-site bucket (BACKUP_R2_*).

RCLONE_IMAGE=${RCLONE_IMAGE:-rclone/rclone:1.68.2}
BACKUP_R2_ENDPOINT=${BACKUP_R2_ENDPOINT:-${R2_ENDPOINT:-}}

offsite_enabled() {
  [[ -n ${BACKUP_R2_BUCKET:-} && -n ${BACKUP_R2_ACCESS_KEY_ID:-} && -n ${BACKUP_R2_SECRET_ACCESS_KEY:-} ]]
}

# Credentials go through the environment, never the docker command line (visible in ps).
export RCLONE_CONFIG_IMAGES_TYPE=s3
export RCLONE_CONFIG_IMAGES_PROVIDER=Cloudflare
export RCLONE_CONFIG_IMAGES_ENDPOINT=${R2_ENDPOINT:-}
export RCLONE_CONFIG_IMAGES_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID:-}
export RCLONE_CONFIG_IMAGES_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY:-}
export RCLONE_CONFIG_IMAGES_NO_CHECK_BUCKET=true
export RCLONE_CONFIG_BACKUP_TYPE=s3
export RCLONE_CONFIG_BACKUP_PROVIDER=Cloudflare
export RCLONE_CONFIG_BACKUP_ENDPOINT=$BACKUP_R2_ENDPOINT
export RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID=${BACKUP_R2_ACCESS_KEY_ID:-}
export RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY=${BACKUP_R2_SECRET_ACCESS_KEY:-}
export RCLONE_CONFIG_BACKUP_NO_CHECK_BUCKET=true

rclone() {
  local env_args=() name
  for name in $(compgen -e | grep '^RCLONE_CONFIG_'); do env_args+=(-e "$name"); done
  docker run --rm --user "$(id -u):$(id -g)" \
    -v "$BACKUP_DIR:/backups" -v "$MEDIA_DIR:/media:ro" \
    "${env_args[@]}" "$RCLONE_IMAGE" --config /dev/null --stats-one-line "$@"
}
