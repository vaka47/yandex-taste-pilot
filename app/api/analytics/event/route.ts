import { NextRequest, NextResponse } from "next/server";
import { ANALYTICS_EVENTS, recordAnalytics } from "@/lib/server/analytics";
import { getSessionUser } from "@/lib/server/session";

export async function POST(request: NextRequest) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 8192) return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const eventName = typeof body?.eventName === "string" ? body.eventName : "";
  if (!ANALYTICS_EVENTS.has(eventName)) return NextResponse.json({ error: "EVENT_NOT_ALLOWED" }, { status: 400 });
  const user = await getSessionUser();
  await recordAnalytics({
    eventName, user,
    tastemakerId: typeof body?.tastemakerId === "string" ? body.tastemakerId : null,
    trackProviderId: typeof body?.trackProviderId === "string" ? body.trackProviderId : null,
    properties: typeof body?.properties === "object" && body.properties ? body.properties as Record<string, unknown> : {}
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}

