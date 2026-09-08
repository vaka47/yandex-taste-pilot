#!/bin/sh
set -eu

backup_dir=/backups
metadata_url=http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token

mkdir -p "$backup_dir"
find "$backup_dir" -type f -name '*.dump.tmp' -delete
find "$backup_dir" -type f -name '*.dump.enc' -mtime +1 -delete

upload_backup() {
  backup_file=$1

  if [ "${OBJECT_STORAGE_ENABLED:-false}" != "true" ]; then
    return 0
  fi
  if [ -z "${OBJECT_STORAGE_BUCKET:-}" ]; then
    echo "OBJECT_STORAGE_BUCKET is required when remote backups are enabled" >&2
    return 1
  fi
  if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    echo "BACKUP_ENCRYPTION_KEY is required when remote backups are enabled" >&2
    return 1
  fi

  encrypted_file="${backup_file}.enc"
  object_name=$(basename "$encrypted_file")
  rm -f "$encrypted_file"
  openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -salt \
    -pass env:BACKUP_ENCRYPTION_KEY -in "$backup_file" -out "$encrypted_file"

  token_json=$(curl --fail --silent --show-error --connect-timeout 5 \
    --header 'Metadata-Flavor: Google' "$metadata_url")
  iam_token=$(printf '%s' "$token_json" | jq -r '.access_token // empty')
  if [ -z "$iam_token" ]; then
    echo "VM metadata did not return an IAM token" >&2
    return 1
  fi

  curl --fail --silent --show-error --retry 3 --retry-all-errors \
    --request PUT \
    --header "Authorization: Bearer $iam_token" \
    --header 'Content-Type: application/octet-stream' \
    --upload-file "$encrypted_file" \
    "https://storage.yandexcloud.net/${OBJECT_STORAGE_BUCKET}/database/${object_name}"
  rm -f "$encrypted_file"
  touch "$backup_dir/.last-remote-upload"
}

while true; do
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  temporary="$backup_dir/taste-${stamp}.dump.tmp"
  final="$backup_dir/taste-${stamp}.dump"

  if pg_dump --format=custom --compress=6 --file="$temporary" && \
    pg_restore --list "$temporary" >/dev/null; then
    mv "$temporary" "$final"
    if ! upload_backup "$final"; then
      echo "Remote backup upload failed; the verified local dump was retained" >&2
    fi
  else
    rm -f "$temporary"
    echo "Database backup or verification failed" >&2
  fi

  find "$backup_dir" -type f -name 'taste-*.dump' -mtime +7 -delete
  sleep 86400
done
