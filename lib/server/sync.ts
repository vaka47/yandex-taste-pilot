import "server-only";
import { createHash } from "node:crypto";
import { connectorRequest } from "@/lib/server/connector";
import { decryptSecret } from "@/lib/server/crypto";
import { db, ensureSchema } from "@/lib/server/db";

type NormalizedProviderEvent = {
  providerEventKey: string;
  trackProviderId: string;
  albumProviderId: string | null;
  trackTitle: string;
  artistNames: string[];
  artistProviderIds: string[];
  coverUrl: string | null;
  observedAt: string | null;
  observedDate: string | null;
  providerPosition: number;
  yandexUrl: string;
};

const errorCodes = new Set(["AUTH_EXPIRED", "AUTH_REVOKED", "DEVICE_FLOW_EXPIRED", "RATE_LIMITED", "HISTORY_FETCH_FAILED", "PLAYLIST_FETCH_FAILED", "PLAYLIST_MUTATION_CONFLICT", "PROVIDER_SCHEMA_CHANGED"]);

function normalizedError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return errorCodes.has(message) ? message : fallback;
}

function coverTone(trackId: string) {
  const tones = ["sunset", "sky", "acid", "violet", "ink", "ember"];
  const byte = createHash("sha256").update(trackId).digest()[0];
  return tones[byte % tones.length];
}

export async function syncTastemakerHistory(tastemakerId: string, force = false) {
  await ensureSchema();
  const lease = await db()`
    update music_connections mc set sync_locked_until = now() + interval '3 minutes', updated_at = now()
    from tastemakers t
    where mc.tastemaker_id = t.id and t.id = ${tastemakerId}
      and mc.status = 'connected' and mc.encrypted_access_token is not null
      and t.status = 'active' and t.publish_enabled = true
      and (mc.sync_locked_until is null or mc.sync_locked_until < now())
      and (${force} or mc.last_success_at is null or mc.last_success_at < now() - make_interval(secs => greatest(t.sync_interval_seconds - 30, 60)))
    returning mc.encrypted_access_token, t.publication_delay_seconds, t.sync_interval_seconds
  `;
  if (!lease[0]) return { ok: true, skipped: true, inserted: 0, fetched: 0 };
  const logRows = await db()`insert into sync_logs (tastemaker_id, job_type, status, stats) values (${tastemakerId}, 'sync_music_history', 'running', '{}'::jsonb) returning id`;
  const logId = logRows[0].id;
  try {
    const result = await connectorRequest<{ events: NormalizedProviderEvent[] }>("/internal/yandex-music/history/fetch", { token: decryptSecret(lease[0].encrypted_access_token), fullModelsCount: 250 });
    const blocked = await db()`select provider_track_id as track_id, null::text as artist from blocked_tracks where tastemaker_id = ${tastemakerId} union all select null::text, artist_name_normalized from blocked_artists where tastemaker_id = ${tastemakerId}`;
    const blockedTracks = new Set(blocked.map(row => row.track_id).filter(Boolean));
    const blockedArtists = new Set(blocked.map(row => row.artist).filter(Boolean));
    let inserted = 0;
    for (const event of result.events) {
      if (!event.trackProviderId || !event.trackTitle || !Array.isArray(event.artistNames)) continue;
      const privacyReason = blockedTracks.has(event.trackProviderId)
        ? "blocked_track"
        : event.artistNames.some(name => blockedArtists.has(name.trim().toLowerCase())) ? "blocked_artist" : null;
      const visibility = privacyReason ? "hidden" : "public";
      const publishAt = new Date(Date.now() + Number(lease[0].publication_delay_seconds || 0) * 1000);
      const rows = await db()`
        insert into listening_events (
          tastemaker_id, provider_event_key, track_provider_id, album_provider_id, track_title,
          artist_names, artist_provider_ids, cover_url, cover_tone, yandex_url, observed_at,
          fetched_at, publish_at, visibility, hidden_reason, raw_metadata
        ) values (
          ${tastemakerId}, ${event.providerEventKey}, ${event.trackProviderId}, ${event.albumProviderId}, ${event.trackTitle},
          ${db().json(event.artistNames)}, ${db().json(event.artistProviderIds || [])}, ${event.coverUrl}, ${coverTone(event.trackProviderId)}, ${event.yandexUrl},
          ${event.observedAt ? new Date(event.observedAt) : null}, now(), ${publishAt}, ${visibility}, ${privacyReason},
          ${db().json({ observedDate: event.observedDate, providerPosition: event.providerPosition })}
        ) on conflict (tastemaker_id, provider_event_key) do nothing returning id
      `;
      inserted += rows.length;
    }
    await db()`update music_connections set last_success_at = now(), last_error_at = null, last_error_code = null, sync_locked_until = null, updated_at = now() where tastemaker_id = ${tastemakerId}`;
    await db()`update sync_logs set status = 'success', finished_at = now(), stats = ${db().json({ fetched: result.events.length, inserted })} where id = ${logId}`;
    return { ok: true, skipped: false, fetched: result.events.length, inserted };
  } catch (error) {
    const code = normalizedError(error, "HISTORY_FETCH_FAILED");
    await db()`update music_connections set status = case when ${code} in ('AUTH_EXPIRED','AUTH_REVOKED') then 'error' else status end, last_error_at = now(), last_error_code = ${code}, sync_locked_until = null, updated_at = now() where tastemaker_id = ${tastemakerId}`;
    await db()`update sync_logs set status = 'failed', finished_at = now(), error_code = ${code}, error_message = ${code} where id = ${logId}`;
    return { ok: false, skipped: false, error: code, inserted: 0, fetched: 0 };
  }
}

async function serviceMusicToken() {
  const rows = await db()`select encrypted_access_token from service_music_connections where singleton_id = 1 and status = 'connected' limit 1`;
  if (rows[0]?.encrypted_access_token) return decryptSecret(rows[0].encrypted_access_token);
  if (process.env.SERVICE_YANDEX_MUSIC_TOKEN_ENCRYPTED) return decryptSecret(process.env.SERVICE_YANDEX_MUSIC_TOKEN_ENCRYPTED);
  return process.env.SERVICE_YANDEX_MUSIC_TOKEN || null;
}

export async function syncTastemakerPlaylist(tastemakerId: string) {
  await ensureSchema();
  if (process.env.PLAYLIST_SYNC_ENABLED !== "true") return { ok: true, skipped: true, reason: "disabled" };
  const token = await serviceMusicToken();
  if (!token) return { ok: false, skipped: true, reason: "service_token_missing" };
  const makerRows = await db()`
    select t.name, t.status, t.publish_enabled, p.provider_uid, p.provider_kind, p.max_tracks
    from tastemakers t left join playlists p on p.tastemaker_id = t.id where t.id = ${tastemakerId} limit 1
  `;
  const maker = makerRows[0];
  if (!maker || maker.status !== "active" || !maker.publish_enabled) return { ok: true, skipped: true, reason: "paused" };
  const events = await db()`
    select track_provider_id, album_provider_id, coalesce(observed_at, fetched_at) as ordering_time, raw_metadata
    from listening_events
    where tastemaker_id = ${tastemakerId} and visibility = 'public' and publish_at <= now() and album_provider_id is not null
    order by coalesce(observed_at, fetched_at) desc, coalesce((raw_metadata->>'providerPosition')::int, 999999) asc
    limit 500
  `;
  const seen = new Set<string>();
  const desired: Array<{ trackId: string; albumId: string }> = [];
  for (const event of events) {
    if (seen.has(event.track_provider_id)) continue;
    seen.add(event.track_provider_id);
    desired.push({ trackId: event.track_provider_id, albumId: event.album_provider_id });
    if (desired.length >= Number(maker.max_tracks || 50)) break;
  }
  const logRows = await db()`insert into sync_logs (tastemaker_id, job_type, status, stats) values (${tastemakerId}, 'sync_live_playlist', 'running', ${db().json({ desired: desired.length })}) returning id`;
  try {
    const result = await connectorRequest<{ uid: string; kind: string; revision: number; trackCount: number; operations: number; publicUrl: string }>("/internal/yandex-music/playlist/sync", {
      token, uid: maker.provider_uid, kind: maker.provider_kind, title: `Вкус ${maker.name} — живой`, tracks: desired
    });
    await db()`
      insert into playlists (tastemaker_id, provider_uid, provider_kind, public_url, revision, max_tracks, last_sync_at, last_error)
      values (${tastemakerId}, ${result.uid}, ${result.kind}, ${result.publicUrl}, ${result.revision}, ${Number(maker.max_tracks || 50)}, now(), null)
      on conflict (tastemaker_id) do update set provider_uid = excluded.provider_uid, provider_kind = excluded.provider_kind, public_url = excluded.public_url, revision = excluded.revision, last_sync_at = now(), last_error = null, updated_at = now()
    `;
    await db()`update sync_logs set status = 'success', finished_at = now(), stats = ${db().json({ desired: desired.length, operations: result.operations, revision: result.revision })} where id = ${logRows[0].id}`;
    return { ok: true, skipped: false, ...result };
  } catch (error) {
    const code = normalizedError(error, "PLAYLIST_FETCH_FAILED");
    await db()`insert into playlists (tastemaker_id, last_error) values (${tastemakerId}, ${code}) on conflict (tastemaker_id) do update set last_error = excluded.last_error, updated_at = now()`;
    await db()`update sync_logs set status = 'failed', finished_at = now(), error_code = ${code}, error_message = ${code} where id = ${logRows[0].id}`;
    return { ok: false, skipped: false, error: code };
  }
}

export async function syncTastemakerFully(tastemakerId: string, force = false) {
  const history = await syncTastemakerHistory(tastemakerId, force);
  if (!history.ok || history.skipped) return { ok: history.ok, history, playlist: null };
  const playlist = await syncTastemakerPlaylist(tastemakerId);
  return { ok: history.ok && playlist.ok, history, playlist };
}

export async function connectedTastemakerIds() {
  await ensureSchema();
  const rows = await db()`select t.id from tastemakers t join music_connections mc on mc.tastemaker_id = t.id where t.status = 'active' and t.publish_enabled = true and mc.status = 'connected' order by t.id`;
  return rows.map(row => row.id as string);
}
