import { NextRequest, NextResponse } from "next/server";
import { ANALYTICS_EVENTS, recordAnalytics } from "@/lib/server/analytics";
import { getSessionUser } from "@/lib/server/session";
import { hashToken } from "@/lib/server/crypto";
import { inMemoryRateLimit, sameOrigin } from "@/lib/server/security";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "ORIGIN_NOT_ALLOWED" }, { status: 403 });
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 8192) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  const actor = request.cookies.get("taste_anon")?.value || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!inMemoryRateLimit(`analytics:${hashToken(actor)}`, 240, 5 * 60_000)) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const eventName = typeof body?.eventName === "string" ? body.eventName : "";
  if (!ANALYTICS_EVENTS.has(eventName)) return NextResponse.json({ error: "EVENT_NOT_ALLOWED" }, { status: 400 });
  const tastemakerId = typeof body?.tastemakerId === "string" && UUID.test(body.tastemakerId) ? body.tastemakerId : null;
  const trackProviderId = typeof body?.trackProviderId === "string" ? body.trackProviderId.slice(0, 160) : null;
  const user = await getSessionUser();
  await recordAnalytics({
    eventName, user,
    tastemakerId,
    trackProviderId,
    properties: typeof body?.properties === "object" && body.properties ? body.properties as Record<string, unknown> : {}
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
