import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/server/audit";
import { db, ensureSchema } from "@/lib/server/db";
import { sameOrigin } from "@/lib/server/security";
import { requireRole } from "@/lib/server/session";

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  let creator;
  try { creator = await requireRole("creator"); } catch { return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); }
  await ensureSchema();
  const rows = creator.role === "admin"
    ? await db()`update tastemakers set creator_onboarding_seen_at = coalesce(creator_onboarding_seen_at, now()), updated_at = now() where id = (select id from tastemakers where status <> 'archived' order by (owner_user_id = ${creator.id}) desc, created_at desc limit 1) returning id`
    : await db()`update tastemakers set creator_onboarding_seen_at = coalesce(creator_onboarding_seen_at, now()), updated_at = now() where id = (select id from tastemakers where owner_user_id = ${creator.id} and status <> 'archived' order by created_at desc limit 1) returning id`;
  if (!rows[0]) return NextResponse.json({ error: "TASTEMAKER_NOT_BOUND" }, { status: 404 });
  await audit(creator.id, "creator_onboarding_seen", "tastemaker", String(rows[0].id));
  return NextResponse.json({ ok: true });
}
