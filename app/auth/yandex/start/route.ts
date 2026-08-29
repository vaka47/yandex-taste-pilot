import { NextRequest, NextResponse } from "next/server";
import { appUrl, isDatabaseConfigured, isYandexIdConfigured, yandexRedirectUri } from "@/lib/server/config";
import { encryptSecret, pkceChallenge, randomToken } from "@/lib/server/crypto";
import { recordAnalytics } from "@/lib/server/analytics";

function safeReturnTo(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/following";
}

export async function GET(request: NextRequest) {
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  if (!isDatabaseConfigured() || !isYandexIdConfigured()) {
    const url = new URL(returnTo, appUrl());
    url.searchParams.set("auth", "not_configured");
    return NextResponse.redirect(url);
  }
  const state = randomToken(24);
  const verifier = randomToken(48);
  const follow = request.nextUrl.searchParams.get("follow");
  const invite = request.nextUrl.searchParams.get("invite");
  const payload = encryptSecret(JSON.stringify({ state, verifier, returnTo, follow, invite, createdAt: Date.now() }));
  const authorize = new URL("https://oauth.yandex.ru/authorize");
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", process.env.YANDEX_ID_CLIENT_ID || "");
  authorize.searchParams.set("redirect_uri", yandexRedirectUri());
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("scope", "login:info login:avatar");
  authorize.searchParams.set("code_challenge", pkceChallenge(verifier));
  authorize.searchParams.set("code_challenge_method", "S256");
  const response = NextResponse.redirect(authorize);
  response.cookies.set("taste_oauth", payload, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/auth/yandex", maxAge: 600 });
  await recordAnalytics({ eventName: "auth_started", tastemakerId: follow || null, properties: { returnTo, intent: invite ? "creator_invite" : follow ? "follow" : "login" } }).catch(() => undefined);
  return response;
}

