import { NextRequest, NextResponse } from "next/server";
import { getPublicEvent } from "@/lib/server/repository";
import { getSessionUser } from "@/lib/server/session";
import { recordAnalytics } from "@/lib/server/analytics";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user || user.authContext !== "yandex") {
    const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    return NextResponse.redirect(new URL(`/auth/yandex/start?returnTo=${encodeURIComponent(returnTo)}`, request.url));
  }
  const result = await getPublicEvent(id);
  if (!result) return NextResponse.redirect(new URL("/?track=not_found", request.url));
  const destination = new URL(result.event.track.yandexUrl);
  if (!destination.hostname.endsWith("yandex.ru")) return NextResponse.json({ error: "DESTINATION_NOT_ALLOWED" }, { status: 400 });
  await recordAnalytics({ eventName: "track_open_click", user, tastemakerId: result.tastemakerId, trackProviderId: result.event.track.id, properties: { source: request.nextUrl.searchParams.get("source") || "recent", position: request.nextUrl.searchParams.get("position") || null } });
  return NextResponse.redirect(destination, 302);
}
