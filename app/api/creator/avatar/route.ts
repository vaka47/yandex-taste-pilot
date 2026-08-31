import { NextRequest, NextResponse } from "next/server";
import { audit } from "@/lib/server/audit";
import { db, ensureSchema } from "@/lib/server/db";
import { sameOrigin, inMemoryRateLimit } from "@/lib/server/security";
import { requireRole } from "@/lib/server/session";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function validSignature(bytes: Buffer, type: string) {
  if (type === "image/jpeg") return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  return bytes.length > 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

async function creatorTastemaker(userId: string, role: string) {
  const rows = role === "admin"
    ? await db()`select id, slug from tastemakers where status <> 'archived' order by (owner_user_id = ${userId}) desc, created_at desc limit 1`
    : await db()`select id, slug from tastemakers where owner_user_id = ${userId} and status <> 'archived' limit 1`;
  return rows[0] || null;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  let creator;
  try { creator = await requireRole("creator"); } catch { return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); }
  if (!inMemoryRateLimit(`avatar:${creator.id}`, 6, 10 * 60_000)) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  await ensureSchema();
  const maker = await creatorTastemaker(creator.id, creator.role);
  if (!maker) return NextResponse.json({ error: "TASTEMAKER_NOT_BOUND" }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size < 100 || file.size > 1_500_000) return NextResponse.json({ error: "INVALID_IMAGE" }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!validSignature(bytes, file.type)) return NextResponse.json({ error: "INVALID_IMAGE_SIGNATURE" }, { status: 400 });
  const version = Date.now();
  const avatarUrl = `/api/public/avatar/${maker.id}?v=${version}`;
  await db().begin(async sql => {
    await sql`insert into tastemaker_avatars (tastemaker_id, image_bytes, mime_type, updated_at) values (${maker.id}, ${bytes}, ${file.type}, now()) on conflict (tastemaker_id) do update set image_bytes = excluded.image_bytes, mime_type = excluded.mime_type, updated_at = now()`;
    await sql`update tastemakers set avatar_url = ${avatarUrl}, updated_at = now() where id = ${maker.id}`;
  });
  await audit(creator.id, "creator_avatar_updated", "tastemaker", String(maker.id));
  return NextResponse.json({ ok: true, avatarUrl, downloadUrl: `/api/public/avatar/${maker.id}?v=${version}&download=1` });
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  let creator;
  try { creator = await requireRole("creator"); } catch { return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); }
  await ensureSchema();
  const maker = await creatorTastemaker(creator.id, creator.role);
  if (!maker) return NextResponse.json({ error: "TASTEMAKER_NOT_BOUND" }, { status: 404 });
  await db().begin(async sql => {
    await sql`delete from tastemaker_avatars where tastemaker_id = ${maker.id}`;
    await sql`update tastemakers set avatar_url = null, updated_at = now() where id = ${maker.id}`;
  });
  await audit(creator.id, "creator_avatar_removed", "tastemaker", String(maker.id));
  return NextResponse.json({ ok: true });
}
