# Pilot runbook

## Connection failure

1. Inspect `/admin` connection status and `sync_logs`.
2. Use the normalized code: `AUTH_EXPIRED`, `AUTH_REVOKED`, `DEVICE_FLOW_EXPIRED`, `RATE_LIMITED`, `HISTORY_FETCH_FAILED`, `PLAYLIST_FETCH_FAILED`, `PLAYLIST_MUTATION_CONFLICT`, `PROVIDER_SCHEMA_CHANGED`.
3. For auth errors, ask the test account owner to reconnect through Device Flow. Never request a password or raw token.
4. For playlist revision conflict, refetch state before retrying. Do not loop mutations indefinitely.

## Emergency privacy stop

Use creator Pause or admin Pause. This immediately sets `publish_enabled=false`, stops new import/publication and prevents playlist mutation while preserving the last public state. To remove the profile too, set `is_public=false` in the admin control path.

## Playlist rebuild

Rebuild only the existing playlist object. Desired state is the latest 50 unique public tracks, newest first. A hidden track/artist must be absent. Never create a new playlist as part of routine recovery.

## Secret incident

Rotate the internal connector secret, session secret and affected Yandex token. Invalidate active sessions and reconnect the affected music account. Audit logs and analytics must never contain secret material.

