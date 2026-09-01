import { NextRequest, NextResponse } from "next/server";
import { recordAnalytics } from "@/lib/server/analytics";
import { resolveTelegramDelivery } from "@/lib/server/telegram";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return NextResponse.redirect(new URL("/", request.url));
  const delivery = await resolveTelegramDelivery(token);
  if (!delivery) return NextResponse.redirect(new URL("/?telegram=link_expired", request.url));
  const destination = new URL(delivery.publicUrl);
  if (!destination.hostname.endsWith("yandex.ru")) return NextResponse.json({ error: "DESTINATION_NOT_ALLOWED" }, { status: 400 });
  await recordAnalytics({
    eventName: "telegram_notification_click",
    user: { id: delivery.userId, role: "user", displayName: "Telegram", avatarUrl: null, yandexId: "", authContext: "yandex" },
    tastemakerId: delivery.tastemakerId,
    properties: { source: "telegram_daily" },
    utmSource: "telegram",
    utmMedium: "notification",
    utmCampaign: "daily_history"
  });
  return NextResponse.redirect(destination, 302);
}
