import { after, NextRequest, NextResponse } from "next/server";
import { recordAnalytics } from "@/lib/server/analytics";
import { resolveTelegramDelivery } from "@/lib/server/telegram";
import { yandexMusicDestination } from "@/lib/server/security";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return NextResponse.redirect(new URL("/", request.url));
  const delivery = await resolveTelegramDelivery(token);
  if (!delivery) return NextResponse.redirect(new URL("/?telegram=link_expired", request.url));
  const destination = yandexMusicDestination(delivery.destinationUrl);
  if (!destination) return NextResponse.json({ error: "DESTINATION_NOT_ALLOWED" }, { status: 400 });
  after(async () => {
    await recordAnalytics({
      eventName: "telegram_notification_click",
      user: { id: delivery.userId, role: "user", displayName: "Telegram", avatarUrl: null, yandexId: "", authContext: "yandex" },
      tastemakerId: delivery.tastemakerId,
      properties: { source: delivery.deliveryType === "creator_comment" ? "telegram_comment" : "telegram_daily" },
      utmSource: "telegram",
      utmMedium: "notification",
      utmCampaign: delivery.deliveryType === "creator_comment" ? "creator_comment" : "daily_history"
    });
  });
  const response = NextResponse.redirect(destination, 302);
  response.headers.set("cache-control", "private, no-store");
  return response;
}
