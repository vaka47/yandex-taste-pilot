import "server-only";
import { cookies, headers } from "next/headers";
import { db, ensureSchema, isDatabaseConfigured } from "@/lib/server/db";
import { randomToken } from "@/lib/server/crypto";
import type { SessionUser } from "@/types/domain";

export const ANALYTICS_EVENTS = new Set([
  "tastemaker_profile_view", "share_click", "follow_click", "auth_started", "auth_completed",
  "follow_completed", "unfollow_completed", "track_open_click", "playlist_open_click", "following_page_view"
]);

const ANON_COOKIE = "taste_anon";
const SESSION_COOKIE = "taste_analytics_session";

export async function analyticsIdentity() {
  const store = await cookies();
  let anonymousId = store.get(ANON_COOKIE)?.value;
  let sessionId = store.get(SESSION_COOKIE)?.value;
  const secure = process.env.NODE_ENV === "production";
  if (!anonymousId) {
    anonymousId = randomToken(18);
    store.set(ANON_COOKIE, anonymousId, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 31536000 });
  }
  if (!sessionId) {
    sessionId = randomToken(18);
    store.set(SESSION_COOKIE, sessionId, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 1800 });
  }
  return { anonymousId, sessionId };
}

export async function recordAnalytics(input: {
  eventName: string;
  user?: SessionUser | null;
  tastemakerId?: string | null;
  trackProviderId?: string | null;
  properties?: Record<string, unknown>;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  referrer?: string | null;
}) {
  if (!ANALYTICS_EVENTS.has(input.eventName)) return false;
  const identity = await analyticsIdentity();
  if (!isDatabaseConfigured()) return true;
  await ensureSchema();
  const requestHeaders = await headers();
  await db()`
    insert into analytics_events (
      event_name, user_id, anonymous_id, session_id, tastemaker_id, track_provider_id,
      properties, utm_source, utm_medium, utm_campaign, referrer
    ) values (
      ${input.eventName}, ${input.user?.id || null}, ${identity.anonymousId}, ${identity.sessionId},
      ${input.tastemakerId || null}, ${input.trackProviderId || null}, ${db().json(JSON.parse(JSON.stringify(input.properties || {})))},
      ${input.utmSource || null}, ${input.utmMedium || null}, ${input.utmCampaign || null},
      ${input.referrer || requestHeaders.get("referer") || null}
    )
  `;
  return true;
}
