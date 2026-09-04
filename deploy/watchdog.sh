#!/bin/sh
set -eu

cd /opt/taste
if docker compose exec -T web wget -q --spider --timeout=8 http://127.0.0.1:3000/api/health; then
  exit 0
fi

docker compose up -d --remove-orphans --wait

