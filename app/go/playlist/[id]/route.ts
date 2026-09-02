import { NextRequest, NextResponse } from "next/server";
import { getPlaylistDestination } from "@/lib/server/repository";
import { getSessionUser } from "@/lib/server/session";
import { recordAnalytics } from "@/lib/server/analytics";
import { yandexMusicDestination } from "@/lib/server/security";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user || user.authContext !== "yandex") return NextResponse.redirect(new URL("/following", request.url));
  const destinationValue = await getPlaylistDestination(id, user.id);
  if (!destinationValue) return NextResponse.redirect(new URL("/?playlist=not_ready", request.url));
  const destination = yandexMusicDestination(destinationValue);
  if (!destination) return NextResponse.json({ error: "DESTINATION_NOT_ALLOWED" }, { status: 400 });
  await recordAnalytics({ eventName: "playlist_open_click", user, tastemakerId: id });
  return NextResponse.redirect(destination, 302);
}
