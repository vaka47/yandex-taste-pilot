import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/db";
import { connectedTastemakerIds, syncTastemakerPlaylist } from "@/lib/server/sync";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: true, skipped: true, reason: "database_not_configured" });
  const connectedIds = await connectedTastemakerIds();
  const requestedId = request.nextUrl.searchParams.get("tastemakerId");
  if (requestedId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedId)) {
    return NextResponse.json({ error: "INVALID_TASTEMAKER_ID" }, { status: 400 });
  }
  if (requestedId && !connectedIds.includes(requestedId)) {
    return NextResponse.json({ error: "TASTEMAKER_NOT_CONNECTED" }, { status: 404 });
  }
  const ids = requestedId ? [requestedId] : connectedIds;
  const results = [];
  for (const id of ids) results.push({ id, ...(await syncTastemakerPlaylist(id)) });
  return NextResponse.json({ ok: results.every(result => result.ok), tastemakers: results.length, results });
}
