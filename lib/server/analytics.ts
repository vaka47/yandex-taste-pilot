import "server-only";
import { cookies, headers } from "next/headers";
import { db, ensureSchema, isDatabaseConfigured } from "@/lib/server/db";
import { randomToken } from "@/lib/server/crypto";
import type { SessionUser } from "@/types/domain";

export const ANALYTICS_EVENTS = new Set([
  "tastemaker_profile_view", "share_click", "follow_click", "auth_started", "auth_completed",
  "follow_completed", "unfollow_completed", "track_open_click", "playlist_open_click", "following_page_view",
  "history_unlock_click", "history_unlocked_view", "telegram_connect_click", "telegram_connected",
  "telegram_disconnected", "telegram_notification_click"
]);

const ANON_COOKIE = "taste_anon";
const SESSION_COOKIE = "taste_analytics_session";
const FIRST_SOURCE_COOKIE = "taste_first_source";

function campaignValue(value: string | null) {
  const normalized = value?.trim().slice(0, 120);
  return normalized || null;
}

function attributionFromReferrer(referrer: string | null) {
  if (!referrer) return { source: null, medium: null, campaign: null };
  try {
    const url = new URL(referrer);
    return {
      source: campaignValue(url.searchParams.get("utm_source")),
      medium: campaignValue(url.searchParams.get("utm_medium")),
      campaign: campaignValue(url.searchParams.get("utm_campaign"))
    };
  } catch {
    return { source: null, medium: null, campaign: null };
  }
}

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
  const requestReferrer = input.referrer || requestHeaders.get("referer") || null;
  const attribution = attributionFromReferrer(requestReferrer);
  const utmSource = campaignValue(input.utmSource || attribution.source);
  const utmMedium = campaignValue(input.utmMedium || attribution.medium);
  const utmCampaign = campaignValue(input.utmCampaign || attribution.campaign);
  const cookieStore = await cookies();
  if (utmSource && !cookieStore.get(FIRST_SOURCE_COOKIE)) {
    try {
      cookieStore.set(FIRST_SOURCE_COOKIE, utmSource, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 90 * 24 * 60 * 60
      });
    } catch {
      // Attribution is useful but must never block the product flow.
    }
  }
  await db()`
    insert into analytics_events (
      event_name, user_id, anonymous_id, session_id, tastemaker_id, track_provider_id,
      properties, utm_source, utm_medium, utm_campaign, referrer
    ) values (
      ${input.eventName}, ${input.user?.id || null}, ${identity.anonymousId}, ${identity.sessionId},
      ${input.tastemakerId || null}, ${input.trackProviderId || null}, ${db().json(JSON.parse(JSON.stringify(input.properties || {})))},
      ${utmSource}, ${utmMedium}, ${utmCampaign}, ${requestReferrer}
    )
  `;
  return true;
}
