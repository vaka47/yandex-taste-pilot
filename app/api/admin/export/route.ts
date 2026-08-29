import { NextRequest, NextResponse } from "next/server";
import { db, ensureSchema } from "@/lib/server/db";
import { requireRole } from "@/lib/server/session";

function csvCell(value: unknown) {
  const string = String(value ?? "");
  return `"${string.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  try { await requireRole("admin"); } catch { return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }); }
  await ensureSchema();
  const kind = request.nextUrl.searchParams.get("kind") || "daily";
  const rows = kind === "followers"
    ? await db()`select tastemaker_id, user_id, followed_at, unfollowed_at, acquisition_source from follows order by followed_at desc limit 50000`
    : await db()`select date_trunc('day', created_at)::date as day, tastemaker_id, event_name, count(*)::int as events, count(distinct coalesce(user_id::text, anonymous_id))::int as unique_people from analytics_events group by 1,2,3 order by 1 desc limit 50000`;
  const headers = rows.length ? Object.keys(rows[0]) : ["result"];
  const csv = [headers.map(csvCell).join(","), ...rows.map(row => headers.map(key => csvCell(row[key])).join(","))].join("\n");
  return new NextResponse(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename=taste-${kind}-${new Date().toISOString().slice(0, 10)}.csv` } });
}

