import "server-only";
import { db, ensureSchema } from "@/lib/server/db";
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
  followClicks7d: number;
  follows7d: number;
  trackOpens7d: number;
  playlistOpens7d: number;
  shares7d: number;
  returnVisitors7d: number;
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
    firstSeenAt: iso(row.first_seen_at) || iso(row.fetched_at) || new Date(0).toISOString()
  };
}

function analyticsFromRow(row: Record<string, any> | undefined): AnalyticsSummary {
  return {
    uniqueVisitors7d: Number(row?.unique_visitors_7d || 0),
    profileViews7d: Number(row?.profile_views_7d || 0),
    followClicks7d: Number(row?.follow_clicks_7d || 0),
    follows7d: Number(row?.follows_7d || 0),
    trackOpens7d: Number(row?.track_opens_7d || 0),
    playlistOpens7d: Number(row?.playlist_opens_7d || 0),
    returnVisitors7d: Number(row?.return_visitors_7d || 0),
    d1Retention: 0,
    d7Retention: 0
  };
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  await ensureSchema();
  const [makers, analytics, failures, audits, serviceConnections] = await Promise.all([
    db()`
      select t.id, t.slug, t.name, t.avatar_url, t.status, (t.owner_user_id is not null) as registered,
        count(distinct f.id) filter (where f.unfollowed_at is null)::int as follower_count,
        count(distinct a.id) filter (
          where a.event_name = 'tastemaker_profile_view' and a.created_at >= now() - interval '7 days'
        )::int as profile_views_7d,
        count(distinct coalesce(a.user_id::text, a.anonymous_id)) filter (
          where a.event_name = 'tastemaker_profile_view' and a.created_at >= now() - interval '7 days'
        )::int as unique_visitors_7d,
        count(distinct a.id) filter (
          where a.event_name = 'follow_click' and a.created_at >= now() - interval '7 days'
        )::int as follow_clicks_7d,
        count(distinct a.id) filter (
          where a.event_name = 'follow_completed' and a.created_at >= now() - interval '7 days'
        )::int as follows_7d,
        count(distinct a.id) filter (
          where a.event_name = 'track_open_click' and a.created_at >= now() - interval '7 days'
        )::int as track_opens_7d,
        count(distinct a.id) filter (
          where a.event_name = 'playlist_open_click' and a.created_at >= now() - interval '7 days'
        )::int as playlist_opens_7d,
        count(distinct a.id) filter (
          where a.event_name = 'share_click' and a.created_at >= now() - interval '7 days'
        )::int as shares_7d,
        (
          select count(*)::int from (
            select coalesce(rv.user_id::text, rv.anonymous_id) as visitor
            from analytics_events rv
            where rv.tastemaker_id = t.id and rv.event_name = 'tastemaker_profile_view'
              and rv.created_at >= now() - interval '7 days'
              and coalesce(rv.user_id::text, rv.anonymous_id) is not null
            group by coalesce(rv.user_id::text, rv.anonymous_id)
            having count(distinct (rv.created_at at time zone 'Europe/Moscow')::date) >= 2
          ) returning_visitors
        ) as return_visitors_7d,
        max(s.finished_at) filter (where s.status = 'success') as last_sync_at,
        mc.status as connection_status, p.public_url, p.last_error as playlist_error
      from tastemakers t
      left join follows f on f.tastemaker_id = t.id
      left join analytics_events a on a.tastemaker_id = t.id
      left join sync_logs s on s.tastemaker_id = t.id
      left join music_connections mc on mc.tastemaker_id = t.id
      left join playlists p on p.tastemaker_id = t.id
      where t.status <> 'archived'
      group by t.id, mc.status, p.public_url, p.last_error
      order by t.created_at desc
    `,
    db()`
      select
        count(distinct coalesce(user_id::text, anonymous_id)) filter (where event_name = 'tastemaker_profile_view')::int as unique_visitors_7d,
        count(*) filter (where event_name = 'tastemaker_profile_view')::int as profile_views_7d,
        count(*) filter (where event_name = 'follow_click')::int as follow_clicks_7d,
        count(*) filter (where event_name = 'follow_completed')::int as follows_7d,
        count(*) filter (where event_name = 'track_open_click')::int as track_opens_7d,
        count(*) filter (where event_name = 'playlist_open_click')::int as playlist_opens_7d,
        (
          select count(*)::int from (
            select coalesce(rv.user_id::text, rv.anonymous_id) as visitor
            from analytics_events rv
            where rv.event_name = 'tastemaker_profile_view' and rv.created_at >= now() - interval '7 days'
              and coalesce(rv.user_id::text, rv.anonymous_id) is not null
            group by coalesce(rv.user_id::text, rv.anonymous_id)
            having count(distinct (rv.created_at at time zone 'Europe/Moscow')::date) >= 2
          ) returning_visitors
        ) as return_visitors_7d
      from analytics_events where created_at >= now() - interval '7 days'
    `,
    db()`select count(*)::int as count from sync_logs where status = 'failed' and started_at >= now() - interval '24 hours'`,
    db()`
      select al.id, al.action, al.created_at, t.name as entity_name
      from audit_logs al left join tastemakers t on t.id::text = al.entity_id
      order by al.created_at desc limit 8
    `,
    db()`select status, provider_account_id, provider_login, last_error_code from service_music_connections where singleton_id = 1 limit 1`
  ]);
  const serviceConnection = serviceConnections[0];
  const serviceAccountId = serviceConnection?.provider_account_id ? String(serviceConnection.provider_account_id) : null;
  return {
    tastemakers: makers.map(row => ({
      id: String(row.id), slug: String(row.slug), name: String(row.name), avatarUrl: row.avatar_url ? String(row.avatar_url) : null, status: row.status, registered: Boolean(row.registered),
      followerCount: Number(row.follower_count || 0), profileViews7d: Number(row.profile_views_7d || 0), uniqueVisitors7d: Number(row.unique_visitors_7d || 0),
      followClicks7d: Number(row.follow_clicks_7d || 0), follows7d: Number(row.follows_7d || 0), trackOpens7d: Number(row.track_opens_7d || 0),
      playlistOpens7d: Number(row.playlist_opens_7d || 0), shares7d: Number(row.shares_7d || 0), returnVisitors7d: Number(row.return_visitors_7d || 0), lastSyncAt: iso(row.last_sync_at), playlistUrl: row.public_url ? String(row.public_url) : null,
      playlistStatus: row.status === "paused" ? "paused" : row.playlist_error ? "error" : row.public_url ? "healthy" : "not_created",
      connectionStatus: row.connection_status || "not_connected"
    })),
    metrics: analyticsFromRow(analytics[0]),
    syncErrors: Number(failures[0]?.count || 0),
    recentAudits: audits.map(row => ({ id: String(row.id), action: String(row.action), entityName: row.entity_name ? String(row.entity_name) : null, createdAt: iso(row.created_at)! })),
    serviceConnection: {
      status: serviceConnection?.status || "not_connected",
      login: serviceConnection?.provider_login ? String(serviceConnection.provider_login) : null,
      accountIdSuffix: serviceAccountId ? serviceAccountId.slice(-4) : null,
      errorCode: serviceConnection?.last_error_code ? String(serviceConnection.last_error_code) : null
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
      (select count(*)::int from blocked_artists ba where ba.tastemaker_id = t.id) as hidden_artist_count
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
  const [events, analytics] = await Promise.all([
    db()`
      select e.*, count(*) over (partition by e.track_provider_id)::int as play_count_7d,
        min(e.observed_at) over (partition by e.track_provider_id) as first_seen_at
      from listening_events e where e.tastemaker_id = ${maker.id}
      order by coalesce(e.observed_at, e.fetched_at) desc limit 80
    `,
    db()`
      select
        count(distinct coalesce(user_id::text, anonymous_id)) filter (where event_name = 'tastemaker_profile_view')::int as unique_visitors_7d,
        count(*) filter (where event_name = 'tastemaker_profile_view')::int as profile_views_7d,
        count(*) filter (where event_name = 'track_open_click')::int as track_opens_7d
      from analytics_events where tastemaker_id = ${maker.id} and created_at >= now() - interval '7 days'
    `
  ]);
  const accountId = maker.provider_account_id ? String(maker.provider_account_id) : null;
  return {
    id: String(maker.id), slug: String(maker.slug), name: String(maker.name), roleLine: String(maker.role_line), bio: String(maker.bio || ""),
    avatarUrl: maker.avatar_url ? String(maker.avatar_url) : null,
    status: maker.status, publishEnabled: Boolean(maker.publish_enabled),
    publicationDelaySeconds: Number(maker.publication_delay_seconds || 0), syncIntervalSeconds: Number(maker.sync_interval_seconds || 60), followerCount: Number(maker.follower_count || 0),
    profileViews7d: Number(analytics[0]?.profile_views_7d || 0), uniqueVisitors7d: Number(analytics[0]?.unique_visitors_7d || 0),
    trackOpens7d: Number(analytics[0]?.track_opens_7d || 0),
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
    hiddenArtistCount: Number(maker.hidden_artist_count || 0), events: events.map(eventFromRow)
  };
}
