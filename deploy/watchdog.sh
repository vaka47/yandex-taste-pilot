#!/bin/sh
set -eu

cd /opt/taste
if docker compose --env-file .env.production exec -T web wget -q --spider --timeout=8 http://127.0.0.1:3000/api/health; then
  exit 0
fi

docker compose --env-file .env.production up -d --remove-orphans --wait
