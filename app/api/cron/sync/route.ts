import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/db";
import { connectedTastemakerIds, syncTastemakerFully } from "@/lib/server/sync";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: true, skipped: true, reason: "database_not_configured" });
  const ids = await connectedTastemakerIds();
  const results = [];
  for (const id of ids) results.push({ id, ...(await syncTastemakerFully(id)) });
  return NextResponse.json({ ok: results.every(result => result.ok), tastemakers: results.length, results });
}
