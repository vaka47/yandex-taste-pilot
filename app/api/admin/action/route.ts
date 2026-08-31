import { NextRequest, NextResponse } from "next/server";
import { randomToken, hashToken } from "@/lib/server/crypto";
import { appUrl } from "@/lib/server/config";
import { db, ensureSchema } from "@/lib/server/db";
import { requireRole } from "@/lib/server/session";
import { sameOrigin } from "@/lib/server/security";
import { audit } from "@/lib/server/audit";
import { syncTastemakerHistory, syncTastemakerPlaylist } from "@/lib/server/sync";

const allowed = new Set(["pause", "sync", "playlist_rebuild", "create_tastemaker", "create_invite", "archive"]);

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  let admin;
  try { admin = await requireRole("admin"); } catch { return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); }
  const body = await request.json().catch(() => ({})) as { type?: string; tastemakerId?: string; name?: string; slug?: string; roleLine?: string };
  if (!body.type || !allowed.has(body.type)) return NextResponse.json({ error: "ACTION_NOT_ALLOWED" }, { status: 400 });
  await ensureSchema();
  try {
    if (body.type === "pause" && body.tastemakerId) {
      const rows = await db()`update tastemakers set status = case when status = 'paused' then 'active' else 'paused' end, publish_enabled = case when status = 'paused' then true else false end, updated_at = now() where id = ${body.tastemakerId} returning status`;
      if (!rows[0]) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      await audit(admin.id, rows[0].status === "paused" ? "admin_paused_tastemaker" : "admin_resumed_tastemaker", "tastemaker", body.tastemakerId);
      return NextResponse.json({ ok: true, status: rows[0].status });
    }
    if (body.type === "create_tastemaker") {
      if (!body.name || !body.slug) return NextResponse.json({ error: "NAME_AND_SLUG_REQUIRED" }, { status: 400 });
      const created = await db()`insert into tastemakers (name, slug, role_line, status) values (${body.name.slice(0, 100)}, ${body.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60)}, ${body.roleLine?.slice(0, 120) || "автор вкуса"}, 'draft') returning id`;
      const rawToken = randomToken(32);
      await db()`insert into creator_invites (tastemaker_id, token_hash, expires_at, created_by) values (${created[0].id}, ${hashToken(rawToken)}, now() + interval '7 days', ${admin.id})`;
      await db()`update tastemakers set status = 'invited', updated_at = now() where id = ${created[0].id}`;
      await audit(admin.id, "tastemaker_created", "tastemaker", created[0].id);
      return NextResponse.json({ ok: true, id: created[0].id, inviteUrl: `${appUrl()}/invite/${rawToken}` }, { status: 201 });
    }
    if (body.type === "create_invite" && body.tastemakerId) {
      const tastemakerId = body.tastemakerId;
      const rawToken = randomToken(32);
      const issued = await db().begin(async sql => {
        const makers = await sql`select id from tastemakers where id = ${tastemakerId} and status <> 'archived' for update`;
        if (!makers[0]) return false;
        await sql`update creator_invites set used_at = now() where tastemaker_id = ${tastemakerId} and used_at is null`;
        await sql`insert into creator_invites (tastemaker_id, token_hash, expires_at, created_by) values (${tastemakerId}, ${hashToken(rawToken)}, now() + interval '7 days', ${admin.id})`;
        await sql`update tastemakers set status = 'invited', updated_at = now() where id = ${tastemakerId}`;
        return true;
      });
      if (!issued) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      await audit(admin.id, "creator_invite_created", "tastemaker", body.tastemakerId);
      return NextResponse.json({ ok: true, inviteUrl: `${appUrl()}/invite/${rawToken}` }, { status: 201 });
    }
    if ((body.type === "sync" || body.type === "playlist_rebuild") && body.tastemakerId) {
      const jobType = body.type === "sync" ? "manual_history_sync" : "manual_playlist_rebuild";
      const result = body.type === "sync"
        ? await syncTastemakerHistory(body.tastemakerId, true)
        : await syncTastemakerPlaylist(body.tastemakerId);
      await audit(admin.id, jobType, "tastemaker", body.tastemakerId, { result });
      return NextResponse.json({ ok: result.ok, result }, { status: result.ok ? 200 : 502 });
    }
    if (body.type === "archive" && body.tastemakerId) {
      await db()`update tastemakers set status = 'archived', is_public = false, publish_enabled = false, updated_at = now() where id = ${body.tastemakerId}`;
      await audit(admin.id, "tastemaker_archived", "tastemaker", body.tastemakerId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "INVALID_ACTION_INPUT" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "ACTION_FAILED", detail: error instanceof Error ? error.message.slice(0, 120) : "unknown" }, { status: 500 });
  }
}
