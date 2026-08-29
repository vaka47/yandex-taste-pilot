import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { toggleFollow } from "@/lib/server/repository";
import { recordAnalytics } from "@/lib/server/analytics";

async function mutate(request: NextRequest, context: { params: Promise<{ id: string }> }, following: boolean) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await context.params;
  try {
    const followerCount = await toggleFollow(user.id, id, following, request.cookies.get("taste_first_source")?.value || null);
    await recordAnalytics({ eventName: following ? "follow_completed" : "unfollow_completed", user, tastemakerId: id });
    return NextResponse.json({ following, followerCount });
  } catch {
    return NextResponse.json({ error: "FOLLOW_FAILED" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { return mutate(request, context, true); }
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) { return mutate(request, context, false); }

