import { NextRequest, NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/server/db";
import { runAutomationCycle } from "@/lib/server/automation";

export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!isDatabaseConfigured()) return NextResponse.json({ ok: true, skipped: true, reason: "database_not_configured" });
  const source = request.nextUrl.searchParams.get("source") || (request.headers.get("user-agent")?.includes("vercel-cron") ? "vercel_daily" : "github_schedule");
  try {
    const result = await runAutomationCycle(source);
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "AUTOMATION_FAILED" }, { status: 503 });
  }
}
