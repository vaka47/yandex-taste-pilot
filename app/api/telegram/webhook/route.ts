import { NextRequest, NextResponse } from "next/server";
import { claimTelegramUpdate, handleTelegramUpdate, notifyTelegramUpdateError, type TelegramUpdate } from "@/lib/server/telegram";

export async function POST(request: NextRequest) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const supplied = request.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || supplied !== expected) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  const update = await request.json().catch(() => null) as TelegramUpdate | null;
  if (!update || typeof update.update_id !== "number") return NextResponse.json({ error: "INVALID_UPDATE" }, { status: 400 });
  if (!(await claimTelegramUpdate(update.update_id))) return NextResponse.json({ ok: true, duplicate: true });
  try {
    await handleTelegramUpdate(update);
  } catch (error) {
    await notifyTelegramUpdateError(update, error);
  }
  return NextResponse.json({ ok: true });
}
