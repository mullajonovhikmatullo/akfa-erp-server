#!/usr/bin/env bash
set -Eeuo pipefail

# Usage: deploy.sh <backend|frontend> <image-ref>
# Called by each repo's CI; only the named service is pulled and restarted.

SERVICE=${1:?usage: deploy.sh <backend|frontend> <image-ref>}
IMAGE=${2:?usage: deploy.sh <backend|frontend> <image-ref>}
APP_DIR=${APP_DIR:-/srv/erp-pos/app}
cd "$APP_DIR"

# Backend and frontend pipelines can finish at the same moment.
exec 9>/tmp/erp-pos-deploy.lock
flock 9

case "$SERVICE" in
  backend) IMAGE_VAR=BACKEND_IMAGE; COMPOSE_SERVICE=backend ;;
  frontend) IMAGE_VAR=FRONTEND_IMAGE; COMPOSE_SERVICE=nginx ;;
  *) echo "Unknown service: $SERVICE" >&2; exit 2 ;;
esac

COMPOSE=(docker compose --env-file .env -f docker-compose.production.yml)

mkdir -p /srv/erp-pos/postgres /srv/erp-pos/media/products /srv/erp-pos/media/receipts /srv/erp-pos/media/temp /srv/erp-pos/backups

cp .env .env.rollback
sed -i "s|^${IMAGE_VAR}=.*|${IMAGE_VAR}=${IMAGE}|" .env

"${COMPOSE[@]}" pull "$COMPOSE_SERVICE"

if [[ $SERVICE == backend ]]; then
  "${COMPOSE[@]}" up -d --wait postgres
  ./deploy/backup.sh || true
  "${COMPOSE[@]}" run --rm --no-deps backend npx prisma migrate deploy
  "${COMPOSE[@]}" up -d --wait --no-deps backend
else
  "${COMPOSE[@]}" up -d --no-deps nginx
  ./deploy/health-check.sh
fi

docker image prune -f >/dev/null
echo "Deployed $SERVICE: $IMAGE"
