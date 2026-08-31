import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/server/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureSchema();
  const rows = await db()`select image_bytes, mime_type from tastemaker_avatars where tastemaker_id::text = ${id} limit 1`;
  if (!rows[0]) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const filename = `taste-${id.slice(0, 8)}-cover.${rows[0].mime_type === "image/png" ? "png" : rows[0].mime_type === "image/webp" ? "webp" : "jpg"}`;
  return new NextResponse(new Uint8Array(rows[0].image_bytes), {
    headers: {
      "content-type": String(rows[0].mime_type),
      "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      ...(request.nextUrl.searchParams.get("download") === "1" ? { "content-disposition": `attachment; filename="${filename}"` } : {})
    }
  });
}
