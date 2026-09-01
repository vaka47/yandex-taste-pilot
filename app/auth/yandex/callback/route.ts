import { NextRequest, NextResponse } from "next/server";
import { appUrl } from "@/lib/server/config";
import { decryptSecret, hashToken } from "@/lib/server/crypto";
import { createSession } from "@/lib/server/session";
import { exchangeYandexCode, fetchYandexProfile, upsertYandexUser } from "@/lib/server/yandex-id";
import { db, ensureSchema } from "@/lib/server/db";
import { toggleFollow } from "@/lib/server/repository";
import { recordAnalytics } from "@/lib/server/analytics";
import { audit } from "@/lib/server/audit";

type OAuthState = { state: string; verifier: string; returnTo: string; follow?: string | null; invite?: string | null; tastemaker?: string | null; createdAt: number };

export async function GET(request: NextRequest) {
  const cookieValue = request.cookies.get("taste_oauth")?.value;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  let target = "/following";
  try {
    if (!cookieValue || !code || !state) throw new Error("OAUTH_RESPONSE_INCOMPLETE");
    const saved = JSON.parse(decryptSecret(cookieValue)) as OAuthState;
    target = saved.returnTo.startsWith("/") && !saved.returnTo.startsWith("//") ? saved.returnTo : "/following";
    if (saved.state !== state || Date.now() - saved.createdAt > 600_000) throw new Error("OAUTH_STATE_INVALID");
    const accessToken = await exchangeYandexCode(code, saved.verifier);
    const yandexProfile = await fetchYandexProfile(accessToken);
    const user = await upsertYandexUser(yandexProfile);
    const analyticsUser = { id: user.id, role: user.role as "user" | "creator" | "admin", displayName: user.displayName, avatarUrl: null, yandexId: user.yandexId, authContext: "yandex" as const };

    if (saved.invite) {
      await ensureSchema();
      const claimed = await db().begin(async sql => {
        const invites = await sql`
          select ci.id, ci.tastemaker_id from creator_invites ci
          join tastemakers t on t.id = ci.tastemaker_id and t.owner_user_id is null and t.status in ('draft', 'invited')
          where ci.token_hash = ${hashToken(saved.invite!)} and ci.used_at is null and ci.expires_at > now()
          for update
        `;
        if (!invites[0]) throw new Error("INVITE_INVALID");
        await sql`update creator_invites set used_at = now() where tastemaker_id = ${invites[0].tastemaker_id} and used_at is null`;
        const bound = await sql`update tastemakers set owner_user_id = ${user.id}, status = 'draft', updated_at = now() where id = ${invites[0].tastemaker_id} and owner_user_id is null returning id`;
        if (!bound[0]) throw new Error("INVITE_ALREADY_CLAIMED");
        await sql`update users set role = case when role = 'admin' then 'admin' else 'creator' end where id = ${user.id}`;
        return invites[0].tastemaker_id as string;
      });
      await audit(user.id, "creator_invite_claimed", "tastemaker", claimed);
      target = "/creator";
    }

    if (saved.follow) {
      await toggleFollow(user.id, saved.follow, true, "oauth_continuation");
      await recordAnalytics({ eventName: "follow_completed", user: analyticsUser, tastemakerId: saved.follow, properties: { continuation: true } });
      const separator = target.includes("?") ? "&" : "?";
      target = `${target}${separator}follow=completed`;
    }
    await recordAnalytics({ eventName: "auth_completed", user: analyticsUser, tastemakerId: saved.follow || saved.tastemaker || null, properties: { intent: saved.invite ? "creator_invite" : saved.follow ? "follow" : saved.tastemaker ? "history_unlock" : "login" } });
    await createSession(user.id);
    const response = NextResponse.redirect(new URL(target, appUrl()));
    response.cookies.delete("taste_oauth");
    return response;
  } catch (error) {
    const url = new URL(target, appUrl());
    url.searchParams.set("auth", error instanceof Error ? error.message.toLowerCase() : "failed");
    const response = NextResponse.redirect(url);
    response.cookies.delete("taste_oauth");
    return response;
  }
}
