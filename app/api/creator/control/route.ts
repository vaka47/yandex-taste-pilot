import { after, NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/server/db";
import { requireRole } from "@/lib/server/session";
import { sameOrigin } from "@/lib/server/security";
import { audit } from "@/lib/server/audit";
import { syncTastemakerFully, syncTastemakerPlaylist } from "@/lib/server/sync";
import { dispatchCreatorCommentNotifications } from "@/lib/server/telegram";

const allowed = new Set(["pause", "resume", "publish_enabled", "delay", "sync_interval", "hide_event", "restore_event", "hide_artist", "restore_artist", "comment_event", "delete_comment", "sync_now", "playlist_sync", "disconnect"]);

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  let creator;
  try { creator = await requireRole("creator"); } catch { return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); }
  const body = await request.json().catch(() => ({})) as { type?: string; value?: unknown };
  if (!body.type || !allowed.has(body.type)) return NextResponse.json({ error: "ACTION_NOT_ALLOWED" }, { status: 400 });
  await ensureSchema();
  const makers = creator.role === "admin"
    ? await db()`select id from tastemakers where status <> 'archived' order by (owner_user_id = ${creator.id}) desc, created_at desc limit 1`
    : await db()`select id from tastemakers where owner_user_id = ${creator.id} and status <> 'archived' limit 1`;
  const tastemakerId = makers[0]?.id as string | undefined;
  if (!tastemakerId) return NextResponse.json({ error: "TASTEMAKER_NOT_BOUND" }, { status: 404 });
  try {
    let operationResult: unknown;
    if (body.type === "pause" || body.type === "resume") {
      const paused = body.type === "pause";
      await db()`update tastemakers set status = ${paused ? "paused" : "active"}, publish_enabled = ${!paused}, updated_at = now() where id = ${tastemakerId}`;
    } else if (body.type === "publish_enabled") {
      await db()`update tastemakers set publish_enabled = ${Boolean(body.value)}, updated_at = now() where id = ${tastemakerId}`;
    } else if (body.type === "delay") {
      const requestedDelay = Number(body.value);
      if (![0, 3600, 21600, 86400].includes(requestedDelay)) return NextResponse.json({ error: "INVALID_PUBLICATION_DELAY" }, { status: 400 });
      const delay = requestedDelay;
      await db().begin(async sql => {
        await sql`update tastemakers set publication_delay_seconds = ${delay}, updated_at = now() where id = ${tastemakerId}`;
        if (delay === 0) {
          await sql`update listening_events set publish_at = now() where tastemaker_id = ${tastemakerId} and visibility = 'public' and publish_at > now()`;
        }
      });
    } else if (body.type === "sync_interval") {
      const interval = Number(body.value);
      if (![60, 300, 900, 3600].includes(interval)) return NextResponse.json({ error: "INVALID_SYNC_INTERVAL" }, { status: 400 });
      await db()`update tastemakers set sync_interval_seconds = ${interval}, updated_at = now() where id = ${tastemakerId}`;
    } else if ((body.type === "hide_event" || body.type === "restore_event") && typeof body.value === "string") {
      if (body.type === "hide_event") {
        await db()`update listening_events set visibility = 'hidden', hidden_reason = 'hidden_by_creator' where id::text = ${body.value} and tastemaker_id = ${tastemakerId}`;
      } else {
        const restored = await db()`
          update listening_events e set visibility = 'public', hidden_reason = null
          where e.id::text = ${body.value} and e.tastemaker_id = ${tastemakerId}
            and not exists (select 1 from blocked_tracks bt where bt.tastemaker_id = e.tastemaker_id and bt.provider_track_id = e.track_provider_id)
            and not exists (
              select 1 from blocked_artists ba
              where ba.tastemaker_id = e.tastemaker_id
                and exists (select 1 from jsonb_array_elements_text(e.artist_names) as artist(value) where lower(trim(value)) = ba.artist_name_normalized)
            )
          returning id
        `;
        if (!restored[0]) return NextResponse.json({ error: "BLOCK_RULE_ACTIVE" }, { status: 409 });
      }
    } else if (body.type === "hide_artist" && typeof body.value === "string") {
      const normalized = body.value.trim().toLowerCase();
      if (!normalized || normalized.length > 200) return NextResponse.json({ error: "INVALID_ARTIST" }, { status: 400 });
      await db()`insert into blocked_artists (tastemaker_id, artist_name_normalized) values (${tastemakerId}, ${normalized}) on conflict do nothing`;
      await db()`
        update listening_events set visibility = 'hidden', hidden_reason = 'blocked_artist'
        where tastemaker_id = ${tastemakerId}
          and hidden_reason is distinct from 'hidden_by_creator'
          and hidden_reason is distinct from 'blocked_track'
          and exists (select 1 from jsonb_array_elements_text(artist_names) as artist(value) where lower(trim(value)) = ${normalized})
      `;
    } else if (body.type === "restore_artist" && typeof body.value === "string") {
      const normalized = body.value.trim().toLowerCase();
      if (!normalized || normalized.length > 200) return NextResponse.json({ error: "INVALID_ARTIST" }, { status: 400 });
      await db().begin(async sql => {
        await sql`delete from blocked_artists where tastemaker_id = ${tastemakerId} and artist_name_normalized = ${normalized}`;
        await sql`
          update listening_events e set visibility = 'public', hidden_reason = null
          where e.tastemaker_id = ${tastemakerId} and e.hidden_reason = 'blocked_artist'
            and not exists (select 1 from blocked_tracks bt where bt.tastemaker_id = e.tastemaker_id and bt.provider_track_id = e.track_provider_id)
            and not exists (
              select 1 from blocked_artists ba
              where ba.tastemaker_id = e.tastemaker_id
                and exists (select 1 from jsonb_array_elements_text(e.artist_names) as artist(value) where lower(trim(value)) = ba.artist_name_normalized)
            )
        `;
      });
    } else if (body.type === "comment_event" && body.value && typeof body.value === "object") {
      const value = body.value as { eventId?: unknown; body?: unknown };
      const eventId = typeof value.eventId === "string" ? value.eventId : "";
      const commentBody = typeof value.body === "string" ? value.body.trim() : "";
      if (!eventId || !commentBody || commentBody.length > 600) return NextResponse.json({ error: "INVALID_COMMENT" }, { status: 400 });
      const comments = await db()`
        insert into event_comments (listening_event_id, tastemaker_id, author_user_id, body, is_public)
        select e.id, e.tastemaker_id, ${creator.id}, ${commentBody}, true
        from listening_events e where e.id::text = ${eventId} and e.tastemaker_id = ${tastemakerId}
        on conflict (listening_event_id) do update set body = excluded.body, is_public = true, author_user_id = excluded.author_user_id, updated_at = now()
        returning id, body, updated_at
      `;
      if (!comments[0]) return NextResponse.json({ error: "EVENT_NOT_FOUND" }, { status: 404 });
      operationResult = { comment: { id: String(comments[0].id), body: String(comments[0].body), updatedAt: comments[0].updated_at?.toISOString?.() || String(comments[0].updated_at) } };
      const commentId = String(comments[0].id);
      after(async () => { await dispatchCreatorCommentNotifications(commentId).catch(() => undefined); });
    } else if (body.type === "delete_comment" && typeof body.value === "string") {
      const deleted = await db()`
        delete from event_comments ec using listening_events e
        where ec.listening_event_id = e.id and ec.id::text = ${body.value} and e.tastemaker_id = ${tastemakerId}
        returning ec.id
      `;
      if (!deleted[0]) return NextResponse.json({ error: "COMMENT_NOT_FOUND" }, { status: 404 });
    } else if (body.type === "disconnect") {
      await db()`update music_connections set encrypted_access_token = null, encrypted_refresh_token = null, status = 'disconnected', updated_at = now() where tastemaker_id = ${tastemakerId}`;
      await db()`update tastemakers set status = 'disconnected', publish_enabled = false, updated_at = now() where id = ${tastemakerId}`;
    } else if (body.type === "sync_now" || body.type === "playlist_sync") {
      operationResult = body.type === "sync_now"
        ? await syncTastemakerFully(tastemakerId, true)
        : await syncTastemakerPlaylist(tastemakerId);
    } else return NextResponse.json({ error: "INVALID_ACTION_INPUT" }, { status: 400 });
    if (["hide_event", "restore_event", "hide_artist", "restore_artist", "publish_enabled", "delay"].includes(body.type)) operationResult = await syncTastemakerPlaylist(tastemakerId);
    await audit(creator.id, `creator_${body.type}`, "tastemaker", tastemakerId, { value: typeof body.value === "string" || typeof body.value === "number" || typeof body.value === "boolean" ? body.value : undefined });
    return NextResponse.json({ ok: true, result: operationResult });
  } catch {
    return NextResponse.json({ error: "CONTROL_UPDATE_FAILED" }, { status: 500 });
  }
}
