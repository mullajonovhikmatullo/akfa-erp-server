#!/usr/bin/env bash
set -Eeuo pipefail

# Hits the stack's loopback port so the check doesn't depend on DNS/TLS.
BASE_URL=${BASE_URL:-http://127.0.0.1:8080}

for _ in $(seq 1 30); do
  if curl -fsS "$BASE_URL/" >/dev/null \
    && curl -fsS "$BASE_URL/store/" >/dev/null \
    && curl -fsS "$BASE_URL/platform/" >/dev/null \
    && curl -fsS "$BASE_URL/api/health" | grep -q '"status":"ok"'; then
    echo "Health check passed"
    exit 0
  fi
  sleep 2
done

echo "Health check failed for $BASE_URL" >&2
exit 1
