import "server-only";
import { db, ensureSchema } from "@/lib/server/db";
import { getAutomationState } from "@/lib/server/automation";
import { telegramNotificationsConfigured } from "@/lib/server/config";
import { connectorHealth } from "@/lib/server/connector";
import type { AnalyticsSummary, ListeningEvent, Role, TastemakerStatus } from "@/types/domain";

export type AdminTastemakerRow = {
  id: string;
  slug: string;
  name: string;
  avatarUrl: string | null;
  status: TastemakerStatus;
  registered: boolean;
  followerCount: number;
  profileViews7d: number;
  uniqueVisitors7d: number;
  historyUnlocks7d: number;
  authCompletions7d: number;
  followClicks7d: number;
  follows7d: number;
  trackOpens7d: number;
  playlistOpens7d: number;
  shares7d: number;
  telegramSubscribers: number;
  telegramClicks7d: number;
  returnVisitors7d: number;
  d1Retention: number;
  d7Retention: number;
  followerD7Retention: number;
  lastSyncAt: string | null;
  playlistUrl: string | null;
  playlistStatus: "healthy" | "paused" | "error" | "not_created";
  connectionStatus: "connected" | "pending" | "error" | "disconnected" | "not_connected";
};

export type AdminDashboardData = {
  tastemakers: AdminTastemakerRow[];
  metrics: AnalyticsSummary;
  syncErrors: number;
  recentAudits: Array<{ id: string; action: string; entityName: string | null; createdAt: string }>;
  serviceConnection: {
    status: "connected" | "pending" | "error" | "disconnected" | "not_connected";
    login: string | null;
    accountIdSuffix: string | null;
    errorCode: string | null;
  };
  automation: Awaited<ReturnType<typeof getAutomationState>>;
  connectorOnline: boolean;
  telegram: {
    configured: boolean;
    activeSubscriptions: number;
    sent7d: number;
    clicks7d: number;
  };
};

export type CreatorDashboardData = {
  id: string;
  slug: string;
  name: string;
  roleLine: string;
  bio: string;
  avatarUrl: string | null;
  status: TastemakerStatus;
  publishEnabled: boolean;
  publicationDelaySeconds: number;
  syncIntervalSeconds: number;
  followerCount: number;
  profileViews7d: number;
  uniqueVisitors7d: number;
  trackOpens7d: number;
  telegramSubscriberCount: number;
  connection: {
    status: "connected" | "pending" | "error" | "disconnected" | "not_connected";
    login: string | null;
    accountIdSuffix: string | null;
    lastSuccessAt: string | null;
    expiresAt: string | null;
    errorCode: string | null;
  };
  playlist: {
    url: string | null;
    trackCount: number;
    maxTracks: number;
    revision: number | null;
    lastSyncAt: string | null;
  };
  consentVersion: string | null;
  consentAt: string | null;
  hiddenArtistCount: number;
  blockedArtists: Array<{ id: string; name: string }>;
  events: ListeningEvent[];
};

function iso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function eventFromRow(row: Record<string, any>): ListeningEvent {
  return {
    id: String(row.id),
    track: {
      id: String(row.track_provider_id),
      albumId: row.album_provider_id ? String(row.album_provider_id) : null,
      title: String(row.track_title),
      artists: Array.isArray(row.artist_names) ? row.artist_names.map(String) : [],
      coverTone: String(row.cover_tone || "sunset"),
      coverUrl: row.cover_url ? String(row.cover_url) : null,
      yandexUrl: String(row.yandex_url)
    },
    observedAt: iso(row.observed_at),
    observedDate: row.raw_metadata?.observedDate ? String(row.raw_metadata.observedDate) : null,
    fetchedAt: iso(row.fetched_at) || new Date(0).toISOString(),
    publishAt: iso(row.publish_at) || new Date(0).toISOString(),
    visibility: row.visibility,
    hiddenReason: row.hidden_reason ? String(row.hidden_reason) : null,
    playCount7d: Number(row.play_count_7d || 1),
    consecutiveCount: Number(row.consecutive_count || 1),
    firstSeenAt: iso(row.first_seen_at) || iso(row.fetched_at) || new Date(0).toISOString(),
    comment: row.comment_id ? {
      id: String(row.comment_id),
      body: String(row.comment_body),
      updatedAt: iso(row.comment_updated_at) || new Date(0).toISOString()
    } : null
  };
}

function analyticsFromRow(row: Record<string, any> | undefined, retention?: Record<string, any>): AnalyticsSummary {
  return {
    uniqueVisitors7d: Number(row?.unique_visitors_7d || 0),
    profileViews7d: Number(row?.profile_views_7d || 0),
    followClicks7d: Number(row?.follow_clicks_7d || 0),
    follows7d: Number(row?.follows_7d || 0),
    trackOpens7d: Number(row?.track_opens_7d || 0),
    playlistOpens7d: Number(row?.playlist_opens_7d || 0),
    returnVisitors7d: Number(row?.return_visitors_7d || 0),
    d1Retention: Number(retention?.d1_retention || 0),
    d7Retention: Number(retention?.d7_retention || 0)
  };
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  await ensureSchema();
  const [makers, analytics, failures, audits, serviceConnections, telegramRows, retentionRows, globalRetentionRows, followerRetentionRows, automation, connectorOnline] = await Promise.all([
    db()`
      select t.id, t.slug, t.name, t.avatar_url, t.status, (t.owner_user_id is not null) as registered,
        coalesce(f.follower_count, 0)::int as follower_count,
        coalesce(a.profile_views_7d, 0)::int as profile_views_7d,
        coalesce(a.unique_visitors_7d, 0)::int as unique_visitors_7d,
        coalesce(a.history_unlocks_7d, 0)::int as history_unlocks_7d,
        coalesce(a.auth_completions_7d, 0)::int as auth_completions_7d,
        coalesce(a.follow_clicks_7d, 0)::int as follow_clicks_7d,
        coalesce(a.follows_7d, 0)::int as follows_7d,
        coalesce(a.track_opens_7d, 0)::int as track_opens_7d,
        coalesce(a.playlist_opens_7d, 0)::int as playlist_opens_7d,
        coalesce(a.shares_7d, 0)::int as shares_7d,
        coalesce(a.telegram_clicks_7d, 0)::int as telegram_clicks_7d,
        coalesce(ts.telegram_subscribers, 0)::int as telegram_subscribers,
        (
          select count(*)::int from (
            select coalesce(rv.user_id::text, (
              select max(link.user_id::text) from analytics_events link
              where link.anonymous_id = rv.anonymous_id and link.user_id is not null
            ), rv.anonymous_id) as visitor
            from analytics_events rv
            where rv.tastemaker_id = t.id and rv.event_name = 'tastemaker_profile_view'
              and rv.created_at >= now() - interval '7 days'
              and coalesce(rv.user_id::text, rv.anonymous_id) is not null
            group by coalesce(rv.user_id::text, (
              select max(link.user_id::text) from analytics_events link
              where link.anonymous_id = rv.anonymous_id and link.user_id is not null
            ), rv.anonymous_id)
            having count(distinct (rv.created_at at time zone 'Europe/Moscow')::date) >= 2
          ) returning_visitors
        ) as return_visitors_7d,
        s.last_sync_at,
        mc.status as connection_status, p.public_url, p.last_error as playlist_error
      from tastemakers t
      left join music_connections mc on mc.tastemaker_id = t.id
      left join playlists p on p.tastemaker_id = t.id
      left join lateral (
        select count(*) filter (where unfollowed_at is null)::int as follower_count
        from follows where tastemaker_id = t.id
      ) f on true
      left join lateral (
        select
          count(*) filter (where event_name = 'tastemaker_profile_view')::int as profile_views_7d,
          count(distinct actor) filter (where event_name = 'tastemaker_profile_view')::int as unique_visitors_7d,
          count(distinct actor) filter (where event_name = 'history_unlock_click')::int as history_unlocks_7d,
          count(distinct actor) filter (where event_name = 'auth_completed' and properties->>'intent' = 'history_unlock')::int as auth_completions_7d,
          count(distinct actor) filter (where event_name = 'follow_click')::int as follow_clicks_7d,
          count(distinct actor) filter (where event_name = 'follow_completed')::int as follows_7d,
          count(distinct actor) filter (where event_name = 'track_open_click')::int as track_opens_7d,
          count(distinct actor) filter (where event_name = 'playlist_open_click')::int as playlist_opens_7d,
          count(distinct actor) filter (where event_name = 'share_click')::int as shares_7d,
          count(distinct actor) filter (where event_name = 'telegram_notification_click')::int as telegram_clicks_7d
        from (
          select ae.*, coalesce(ae.user_id::text, (
            select max(link.user_id::text) from analytics_events link
            where link.anonymous_id = ae.anonymous_id and link.user_id is not null
          ), ae.anonymous_id) as actor
          from analytics_events ae
          where ae.tastemaker_id = t.id and ae.created_at >= now() - interval '7 days'
        ) recent
      ) a on true
      left join lateral (
        select count(*)::int as telegram_subscribers from telegram_subscriptions
        where tastemaker_id = t.id and active = true
      ) ts on true
      left join lateral (
        select max(finished_at) filter (where status = 'success') as last_sync_at
        from sync_logs where tastemaker_id = t.id
      ) s on true
      where t.status <> 'archived'
      order by t.created_at desc
    `,
    db()`
      with identity_map as (
        select anonymous_id, max(user_id::text) as linked_user_id from analytics_events
        where anonymous_id is not null and user_id is not null group by anonymous_id
      ), recent as (
        select a.*, coalesce(a.user_id::text, im.linked_user_id, a.anonymous_id) as actor
        from analytics_events a left join identity_map im on im.anonymous_id = a.anonymous_id
        where a.created_at >= now() - interval '7 days'
      )
      select
        count(distinct actor) filter (where event_name = 'tastemaker_profile_view')::int as unique_visitors_7d,
        count(*) filter (where event_name = 'tastemaker_profile_view')::int as profile_views_7d,
        count(distinct actor) filter (where event_name = 'follow_click')::int as follow_clicks_7d,
        count(distinct actor) filter (where event_name = 'follow_completed')::int as follows_7d,
        count(distinct actor) filter (where event_name = 'track_open_click')::int as track_opens_7d,
        count(distinct actor) filter (where event_name = 'playlist_open_click')::int as playlist_opens_7d,
        (
          select count(*)::int from (
            select actor from recent where event_name = 'tastemaker_profile_view' and actor is not null
            group by actor
            having count(distinct (created_at at time zone 'Europe/Moscow')::date) >= 2
          ) returning_visitors
        ) as return_visitors_7d
      from recent
    `,
    db()`select count(*)::int as count from sync_logs where status = 'failed' and started_at >= now() - interval '24 hours'`,
    db()`
      select al.id, al.action, al.created_at, t.name as entity_name
      from audit_logs al left join tastemakers t on t.id::text = al.entity_id
      order by al.created_at desc limit 8
    `,
    db()`select status, provider_account_id, provider_login, last_error_code from service_music_connections where singleton_id = 1 limit 1`,
    db()`
      select
        (select count(*)::int from telegram_subscriptions where active = true) as active_subscriptions,
        (select count(*)::int from telegram_deliveries where status in ('sent','clicked') and sent_at >= now() - interval '7 days') as sent_7d,
        (select count(*)::int from telegram_deliveries where clicked_at >= now() - interval '7 days') as clicks_7d
    `,
    db()`
      with identity_map as (
        select anonymous_id, max(user_id::text) as linked_user_id from analytics_events
        where anonymous_id is not null and user_id is not null group by anonymous_id
      ), visits as (
        select a.tastemaker_id, coalesce(a.user_id::text, im.linked_user_id, a.anonymous_id) as actor,
          (a.created_at at time zone 'Europe/Moscow')::date as visit_day
        from analytics_events a left join identity_map im on im.anonymous_id = a.anonymous_id
        where a.event_name = 'tastemaker_profile_view' and a.created_at >= now() - interval '70 days'
          and a.tastemaker_id is not null and coalesce(a.user_id::text, im.linked_user_id, a.anonymous_id) is not null
        group by a.tastemaker_id, actor, visit_day
      ), cohorts as (
        select tastemaker_id, actor, min(visit_day) as first_day from visits group by tastemaker_id, actor
      ), today as (select (now() at time zone 'Europe/Moscow')::date as day)
      select c.tastemaker_id,
        coalesce(round(100.0 * count(*) filter (where c.first_day between today.day - 31 and today.day - 2 and exists (
          select 1 from visits v where v.tastemaker_id = c.tastemaker_id and v.actor = c.actor and v.visit_day = c.first_day + 1
        )) / nullif(count(*) filter (where c.first_day between today.day - 31 and today.day - 2), 0), 1), 0) as d1_retention,
        coalesce(round(100.0 * count(*) filter (where c.first_day between today.day - 60 and today.day - 8 and exists (
          select 1 from visits v where v.tastemaker_id = c.tastemaker_id and v.actor = c.actor and v.visit_day between c.first_day + 6 and c.first_day + 8
        )) / nullif(count(*) filter (where c.first_day between today.day - 60 and today.day - 8), 0), 1), 0) as d7_retention
      from cohorts c cross join today group by c.tastemaker_id
    `,
    db()`
      with identity_map as (
        select anonymous_id, max(user_id::text) as linked_user_id from analytics_events
        where anonymous_id is not null and user_id is not null group by anonymous_id
      ), visits as (
        select coalesce(a.user_id::text, im.linked_user_id, a.anonymous_id) as actor,
          (a.created_at at time zone 'Europe/Moscow')::date as visit_day
        from analytics_events a left join identity_map im on im.anonymous_id = a.anonymous_id
        where a.event_name = 'tastemaker_profile_view' and a.created_at >= now() - interval '70 days'
          and coalesce(a.user_id::text, im.linked_user_id, a.anonymous_id) is not null
        group by actor, visit_day
      ), cohorts as (
        select actor, min(visit_day) as first_day from visits group by actor
      ), today as (select (now() at time zone 'Europe/Moscow')::date as day)
      select
        coalesce(round(100.0 * count(*) filter (where c.first_day between today.day - 31 and today.day - 2 and exists (
          select 1 from visits v where v.actor = c.actor and v.visit_day = c.first_day + 1
        )) / nullif(count(*) filter (where c.first_day between today.day - 31 and today.day - 2), 0), 1), 0) as d1_retention,
        coalesce(round(100.0 * count(*) filter (where c.first_day between today.day - 60 and today.day - 8 and exists (
          select 1 from visits v where v.actor = c.actor and v.visit_day between c.first_day + 6 and c.first_day + 8
        )) / nullif(count(*) filter (where c.first_day between today.day - 60 and today.day - 8), 0), 1), 0) as d7_retention
      from cohorts c cross join today
    `,
    db()`
      with follower_cohorts as (
        select f.tastemaker_id, f.user_id,
          (f.followed_at at time zone 'Europe/Moscow')::date as first_day
        from follows f
        where f.followed_at >= now() - interval '70 days'
      ), today as (select (now() at time zone 'Europe/Moscow')::date as day)
      select fc.tastemaker_id,
        coalesce(round(100.0 * count(*) filter (
          where fc.first_day between today.day - 60 and today.day - 8 and exists (
            select 1 from analytics_events a
            where a.tastemaker_id = fc.tastemaker_id and a.user_id = fc.user_id
              and a.event_name in ('tastemaker_profile_view', 'history_unlocked_view', 'following_page_view')
              and (a.created_at at time zone 'Europe/Moscow')::date between fc.first_day + 6 and fc.first_day + 8
          )
        ) / nullif(count(*) filter (where fc.first_day between today.day - 60 and today.day - 8), 0), 1), 0) as follower_d7_retention
      from follower_cohorts fc cross join today
      group by fc.tastemaker_id
    `,
    getAutomationState(),
    connectorHealth()
  ]);
  const serviceConnection = serviceConnections[0];
  const serviceAccountId = serviceConnection?.provider_account_id ? String(serviceConnection.provider_account_id) : null;
  const retentionByTastemaker = new Map(retentionRows.map(row => [String(row.tastemaker_id), row]));
  const followerRetentionByTastemaker = new Map(followerRetentionRows.map(row => [String(row.tastemaker_id), row]));
  return {
    tastemakers: makers.map(row => {
      const retention = retentionByTastemaker.get(String(row.id));
      const followerRetention = followerRetentionByTastemaker.get(String(row.id));
      return {
        id: String(row.id), slug: String(row.slug), name: String(row.name), avatarUrl: row.avatar_url ? String(row.avatar_url) : null, status: row.status, registered: Boolean(row.registered),
        followerCount: Number(row.follower_count || 0), profileViews7d: Number(row.profile_views_7d || 0), uniqueVisitors7d: Number(row.unique_visitors_7d || 0),
        historyUnlocks7d: Number(row.history_unlocks_7d || 0), authCompletions7d: Number(row.auth_completions_7d || 0),
        followClicks7d: Number(row.follow_clicks_7d || 0), follows7d: Number(row.follows_7d || 0), trackOpens7d: Number(row.track_opens_7d || 0),
        playlistOpens7d: Number(row.playlist_opens_7d || 0), shares7d: Number(row.shares_7d || 0),
        telegramSubscribers: Number(row.telegram_subscribers || 0), telegramClicks7d: Number(row.telegram_clicks_7d || 0),
        returnVisitors7d: Number(row.return_visitors_7d || 0), d1Retention: Number(retention?.d1_retention || 0), d7Retention: Number(retention?.d7_retention || 0),
        followerD7Retention: Number(followerRetention?.follower_d7_retention || 0),
        lastSyncAt: iso(row.last_sync_at), playlistUrl: row.public_url ? String(row.public_url) : null,
        playlistStatus: row.status === "paused" ? "paused" : row.playlist_error ? "error" : row.public_url ? "healthy" : "not_created",
        connectionStatus: row.connection_status || "not_connected"
      };
    }),
    metrics: analyticsFromRow(analytics[0], globalRetentionRows[0]),
    syncErrors: Number(failures[0]?.count || 0),
    recentAudits: audits.map(row => ({ id: String(row.id), action: String(row.action), entityName: row.entity_name ? String(row.entity_name) : null, createdAt: iso(row.created_at)! })),
    serviceConnection: {
      status: serviceConnection?.status || "not_connected",
      login: serviceConnection?.provider_login ? String(serviceConnection.provider_login) : null,
      accountIdSuffix: serviceAccountId ? serviceAccountId.slice(-4) : null,
      errorCode: serviceConnection?.last_error_code ? String(serviceConnection.last_error_code) : null
    },
    automation,
    connectorOnline,
    telegram: {
      configured: telegramNotificationsConfigured(),
      activeSubscriptions: Number(telegramRows[0]?.active_subscriptions || 0),
      sent7d: Number(telegramRows[0]?.sent_7d || 0),
      clicks7d: Number(telegramRows[0]?.clicks_7d || 0)
    }
  };
}

export async function getCreatorDashboardData(userId: string, role: Role): Promise<CreatorDashboardData | null> {
  await ensureSchema();
  const makers = await db()`
    select t.*,
      count(distinct f.id) filter (where f.unfollowed_at is null)::int as follower_count,
      mc.status as connection_status, mc.provider_account_id, mc.provider_login, mc.last_success_at,
      mc.token_expires_at, mc.last_error_code,
      p.public_url, p.max_tracks, p.revision, p.last_sync_at as playlist_last_sync_at,
      (select count(distinct e.track_provider_id)::int from listening_events e where e.tastemaker_id = t.id and e.visibility = 'public') as playlist_track_count,
      (select count(*)::int from blocked_artists ba where ba.tastemaker_id = t.id) as hidden_artist_count,
      (select count(*)::int from telegram_subscriptions ts where ts.tastemaker_id = t.id and ts.active = true) as telegram_subscriber_count
    from tastemakers t
    left join follows f on f.tastemaker_id = t.id
    left join music_connections mc on mc.tastemaker_id = t.id
    left join playlists p on p.tastemaker_id = t.id
    where t.status <> 'archived' and (${role === "admin"} or t.owner_user_id = ${userId})
    group by t.id, mc.status, mc.provider_account_id, mc.provider_login, mc.last_success_at,
      mc.token_expires_at, mc.last_error_code, p.public_url, p.max_tracks, p.revision, p.last_sync_at
    order by (t.owner_user_id = ${userId}) desc, t.created_at desc
    limit 1
  `;
  const maker = makers[0];
  if (!maker) return null;
  const [events, analytics, blockedArtists] = await Promise.all([
    db()`
      select e.*, ec.id as comment_id, ec.body as comment_body, ec.updated_at as comment_updated_at,
        count(*) over (partition by e.track_provider_id)::int as play_count_7d,
        min(e.observed_at) over (partition by e.track_provider_id) as first_seen_at
      from listening_events e
      left join event_comments ec on ec.listening_event_id = e.id and ec.is_public = true
      where e.tastemaker_id = ${maker.id}
      order by coalesce(e.observed_at, e.fetched_at) desc limit 80
    `,
    db()`
      select
        count(distinct coalesce(user_id::text, anonymous_id)) filter (where event_name = 'tastemaker_profile_view')::int as unique_visitors_7d,
        count(*) filter (where event_name = 'tastemaker_profile_view')::int as profile_views_7d,
        count(*) filter (where event_name = 'track_open_click')::int as track_opens_7d
      from analytics_events where tastemaker_id = ${maker.id} and created_at >= now() - interval '7 days'
    `,
    db()`select id, artist_name_normalized from blocked_artists where tastemaker_id = ${maker.id} order by artist_name_normalized`
  ]);
  const accountId = maker.provider_account_id ? String(maker.provider_account_id) : null;
  const eventModels = events.map(eventFromRow);
  return {
    id: String(maker.id), slug: String(maker.slug), name: String(maker.name), roleLine: String(maker.role_line), bio: String(maker.bio || ""),
    avatarUrl: maker.avatar_url ? String(maker.avatar_url) : null,
    status: maker.status, publishEnabled: Boolean(maker.publish_enabled),
    publicationDelaySeconds: Number(maker.publication_delay_seconds || 0), syncIntervalSeconds: Number(maker.sync_interval_seconds || 60), followerCount: Number(maker.follower_count || 0),
    profileViews7d: Number(analytics[0]?.profile_views_7d || 0), uniqueVisitors7d: Number(analytics[0]?.unique_visitors_7d || 0),
    trackOpens7d: Number(analytics[0]?.track_opens_7d || 0),
    telegramSubscriberCount: Number(maker.telegram_subscriber_count || 0),
    connection: {
      status: maker.connection_status || "not_connected", login: maker.provider_login ? String(maker.provider_login) : null,
      accountIdSuffix: accountId ? accountId.slice(-4) : null, lastSuccessAt: iso(maker.last_success_at),
      expiresAt: iso(maker.token_expires_at), errorCode: maker.last_error_code ? String(maker.last_error_code) : null
    },
    playlist: {
      url: maker.public_url ? String(maker.public_url) : null, trackCount: Number(maker.playlist_track_count || 0),
      maxTracks: Number(maker.max_tracks || 50), revision: maker.revision === null || maker.revision === undefined ? null : Number(maker.revision),
      lastSyncAt: iso(maker.playlist_last_sync_at)
    },
    consentVersion: maker.consent_version ? String(maker.consent_version) : null, consentAt: iso(maker.consent_at),
    hiddenArtistCount: Number(maker.hidden_artist_count || 0),
    blockedArtists: blockedArtists.map(row => {
      const normalized = String(row.artist_name_normalized);
      const displayName = eventModels.flatMap(event => event.track.artists).find(name => name.trim().toLowerCase() === normalized) || normalized;
      return { id: String(row.id), name: displayName };
    }),
    events: eventModels
  };
}
