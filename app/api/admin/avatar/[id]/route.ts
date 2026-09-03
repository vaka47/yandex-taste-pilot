import { NextResponse } from "next/server";
import sharp from "sharp";
import { db, ensureSchema } from "@/lib/server/db";
import { requireRole } from "@/lib/server/session";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "INVALID_ID" }, { status: 400 });
  }

  await ensureSchema();
  const rows = await db()`
    select a.image_bytes, t.slug
    from tastemaker_avatars a
    join tastemakers t on t.id = a.tastemaker_id
    where a.tastemaker_id = ${id}
    limit 1
  `;
  if (!rows[0]) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const jpeg = await sharp(rows[0].image_bytes)
      .rotate()
      .flatten({ background: "#f4f1e8" })
      .jpeg({ quality: 92, progressive: true, mozjpeg: true })
      .toBuffer();
    const safeSlug = String(rows[0].slug || "soundmaker").replace(/[^a-z0-9-]/gi, "-");

    return new NextResponse(new Uint8Array(jpeg), {
      headers: {
        "content-type": "image/jpeg",
        "content-disposition": `attachment; filename="${safeSlug}-avatar.jpg"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff"
      }
    });
  } catch {
    return NextResponse.json({ error: "IMAGE_CONVERSION_FAILED" }, { status: 500 });
  }
}
