import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/server/db";
import { requireRole } from "@/lib/server/session";
import { sameOrigin } from "@/lib/server/security";
import { audit } from "@/lib/server/audit";

const allowed = new Set(["pause", "resume", "publish_enabled", "delay", "hide_event", "restore_event", "hide_artist", "sync_now", "playlist_sync", "disconnect", "delete_request"]);

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  let creator;
  try { creator = await requireRole("creator"); } catch { return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); }
  const body = await request.json().catch(() => ({})) as { type?: string; value?: unknown };
  if (!body.type || !allowed.has(body.type)) return NextResponse.json({ error: "ACTION_NOT_ALLOWED" }, { status: 400 });
  await ensureSchema();
  const makers = creator.role === "admin"
    ? await db()`select id from tastemakers where status <> 'archived' order by created_at limit 1`
    : await db()`select id from tastemakers where owner_user_id = ${creator.id} and status <> 'archived' limit 1`;
  const tastemakerId = makers[0]?.id as string | undefined;
  if (!tastemakerId) return NextResponse.json({ error: "TASTEMAKER_NOT_BOUND" }, { status: 404 });
  try {
    if (body.type === "pause" || body.type === "resume") {
      const paused = body.type === "pause";
      await db()`update tastemakers set status = ${paused ? "paused" : "active"}, publish_enabled = ${!paused}, updated_at = now() where id = ${tastemakerId}`;
    } else if (body.type === "publish_enabled") {
      await db()`update tastemakers set publish_enabled = ${Boolean(body.value)}, updated_at = now() where id = ${tastemakerId}`;
    } else if (body.type === "delay") {
      const delay = body.value === 86400 ? 86400 : 0;
      await db()`update tastemakers set publication_delay_seconds = ${delay}, updated_at = now() where id = ${tastemakerId}`;
    } else if ((body.type === "hide_event" || body.type === "restore_event") && typeof body.value === "string") {
      await db()`update listening_events set visibility = ${body.type === "hide_event" ? "hidden" : "public"}, hidden_reason = ${body.type === "hide_event" ? "hidden_by_creator" : null} where id::text = ${body.value} and tastemaker_id = ${tastemakerId}`;
    } else if (body.type === "hide_artist" && typeof body.value === "string") {
      const normalized = body.value.trim().toLowerCase();
      await db()`insert into blocked_artists (tastemaker_id, artist_name_normalized) values (${tastemakerId}, ${normalized}) on conflict do nothing`;
      await db()`update listening_events set visibility = 'hidden', hidden_reason = 'blocked_artist' where tastemaker_id = ${tastemakerId} and exists (select 1 from jsonb_array_elements_text(artist_names) artist where lower(artist) = ${normalized})`;
    } else if (body.type === "disconnect") {
      await db()`update music_connections set encrypted_access_token = null, encrypted_refresh_token = null, status = 'disconnected', updated_at = now() where tastemaker_id = ${tastemakerId}`;
      await db()`update tastemakers set status = 'disconnected', publish_enabled = false, updated_at = now() where id = ${tastemakerId}`;
    } else if (body.type === "sync_now" || body.type === "playlist_sync") {
      await db()`insert into sync_logs (tastemaker_id, job_type, status, stats) values (${tastemakerId}, ${body.type}, 'queued', '{}'::jsonb)`;
    } else if (body.type === "delete_request") {
      await db()`insert into audit_logs (actor_user_id, action, entity_type, entity_id, metadata) values (${creator.id}, 'data_deletion_requested', 'tastemaker', ${tastemakerId}, ${db().json({ requestedAt: new Date().toISOString() })})`;
    } else return NextResponse.json({ error: "INVALID_ACTION_INPUT" }, { status: 400 });
    await audit(creator.id, `creator_${body.type}`, "tastemaker", tastemakerId, { value: typeof body.value === "string" || typeof body.value === "number" || typeof body.value === "boolean" ? body.value : undefined });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "CONTROL_UPDATE_FAILED" }, { status: 500 });
  }
}

