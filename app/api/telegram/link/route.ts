import { NextRequest, NextResponse } from "next/server";
import { createTelegramLink, disableTelegramSubscription, getTelegramSubscriptionStatus } from "@/lib/server/telegram";
import { requireUser } from "@/lib/server/session";
import { sameOrigin } from "@/lib/server/security";
import { recordAnalytics } from "@/lib/server/analytics";

async function userOrResponse() {
  try {
    const user = await requireUser();
    return user;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const user = await userOrResponse();
  if (!user) return NextResponse.json({ error: "YANDEX_ID_REQUIRED" }, { status: 401 });
  const tastemakerId = request.nextUrl.searchParams.get("tastemakerId");
  if (!tastemakerId) return NextResponse.json({ error: "TASTEMAKER_REQUIRED" }, { status: 400 });
  return NextResponse.json(await getTelegramSubscriptionStatus(user.id, tastemakerId));
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const user = await userOrResponse();
  if (!user) return NextResponse.json({ error: "YANDEX_ID_REQUIRED" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { tastemakerId?: string };
  if (!body.tastemakerId) return NextResponse.json({ error: "TASTEMAKER_REQUIRED" }, { status: 400 });
  try {
    const result = await createTelegramLink(user.id, body.tastemakerId);
    if (result.subscribed) {
      await recordAnalytics({
        eventName: "telegram_connected",
        user,
        tastemakerId: body.tastemakerId,
        properties: { existingAccount: true }
      });
    }
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "TELEGRAM_LINK_FAILED";
    return NextResponse.json({ error: code }, { status: code === "FOLLOW_REQUIRED" ? 409 : code === "TELEGRAM_NOT_CONFIGURED" ? 503 : 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "INVALID_ORIGIN" }, { status: 403 });
  const user = await userOrResponse();
  if (!user) return NextResponse.json({ error: "YANDEX_ID_REQUIRED" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { tastemakerId?: string };
  if (!body.tastemakerId) return NextResponse.json({ error: "TASTEMAKER_REQUIRED" }, { status: 400 });
  const changed = await disableTelegramSubscription(user.id, body.tastemakerId);
  return NextResponse.json({ subscribed: false, changed });
}
