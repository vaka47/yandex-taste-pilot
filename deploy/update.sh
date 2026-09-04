#!/bin/sh
set -eu

cd /opt/taste
git fetch --quiet origin main
current_revision=$(git rev-parse HEAD)
remote_revision=$(git rev-parse origin/main)

if [ "$current_revision" = "$remote_revision" ]; then
  exit 0
fi

git merge --ff-only origin/main
docker compose build --pull
docker compose up -d --remove-orphans --wait
docker image prune -f --filter "until=168h"

