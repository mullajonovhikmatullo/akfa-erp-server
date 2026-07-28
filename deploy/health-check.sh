#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL=${BASE_URL:-https://mavion.uz}

curl -fsS "$BASE_URL/" >/dev/null
curl -fsS "$BASE_URL/store/" >/dev/null
curl -fsS "$BASE_URL/platform/" >/dev/null
curl -fsS "$BASE_URL/api/health" | grep -q '"status":"ok"'
