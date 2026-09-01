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

## Automation recovery

1. Check **Админка → Автоматическая публикация** for the last source, status and age.
2. Run the protected cron route manually or dispatch `sync-watchdog.yml`; every run is persisted in `automation_runs`.
3. A `partial` run means at least one creator sync or Telegram send failed. Successful creators are not rolled back and failed work is retryable.
4. A public or creator page never waits for Yandex: it serves stored data first, then schedules a best-effort sync after the response.
5. Do not promise one-minute unattended publication while using only Vercel Hobby and GitHub Actions. Move the protected route to a one-minute production scheduler before a large test.

## Telegram notifications

1. Set the four Telegram environment variables, redeploy, then call **Обновить Telegram-вебхук** from the owner admin.
2. Test with a real fan flow: Yandex ID login → explicit follow → Telegram button → `Start` in the private bot chat.
3. A digest is eligible only after a new public event and after the live playlist's `last_sync_at` reaches that event.
4. A subscriber receives at most one digest per tastemaker per Moscow day. Different tastemakers may each send one digest.
5. HTTP 403 from Telegram marks the account blocked. `/stop` disables all subscriptions; unfollow disables only that tastemaker.
6. Export delivery diagnostics from `/api/admin/export?kind=telegram`.

## Playback boundary

Do not proxy, download or expose Yandex audio. The pilot measures tracked intent through official Yandex Music links. Add in-page playback only if Yandex provides a documented embeddable player with acceptable terms; do not treat a click or preview start as a completed listen.

## Secret incident

Rotate the internal connector secret, session secret and affected Yandex token. Invalidate active sessions and reconnect the affected music account. Audit logs and analytics must never contain secret material.
