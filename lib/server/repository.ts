import "server-only";
import { fixtureProfile } from "@/lib/fixtures";
import { db, ensureSchema, isDatabaseConfigured } from "@/lib/server/db";
import { fixturesEnabled, telegramNotificationsConfigured } from "@/lib/server/config";
import type { HomeTastemaker, ListeningEvent, PublicActivity, TastemakerProfile } from "@/types/domain";

function rowToEvent(row: Record<string, any>): ListeningEvent {
  return {
    id: row.id,
    track: {
      id: row.track_provider_id,
      albumId: row.album_provider_id,
      title: row.track_title,
      artists: row.artist_names || [],
      coverTone: row.cover_tone || "sunset",
      coverUrl: row.cover_url,
      yandexUrl: row.yandex_url
    },
    observedAt: row.observed_at?.toISOString?.() || row.observed_at || null,
    observedDate: row.raw_metadata?.observedDate ? String(row.raw_metadata.observedDate) : null,
    fetchedAt: row.fetched_at?.toISOString?.() || row.fetched_at,
    publishAt: row.publish_at?.toISOString?.() || row.publish_at,
    visibility: row.visibility,
    hiddenReason: row.hidden_reason,
    playCount7d: Number(row.play_count_7d || 1),
    consecutiveCount: Number(row.consecutive_count || 1),
    firstSeenAt: row.first_seen_at?.toISOString?.() || row.first_seen_at || row.fetched_at?.toISOString?.() || row.fetched_at,
    comment: row.comment_id ? {
      id: String(row.comment_id),
      body: String(row.comment_body),
      updatedAt: row.comment_updated_at?.toISOString?.() || String(row.comment_updated_at)
    } : null
  };
}

function publicEventsFromRows(rows: Array<Record<string, any>>) {
  const maxStreakByTrack = new Map<string, number>();
  let start = 0;
  while (start < rows.length) {
    const trackId = String(rows[start].track_provider_id);
    const day = rows[start].raw_metadata?.observedDate || null;
    let end = start + 1;
    while (end < rows.length && String(rows[end].track_provider_id) === trackId && day && rows[end].raw_metadata?.observedDate === day) end += 1;
    maxStreakByTrack.set(trackId, Math.max(maxStreakByTrack.get(trackId) || 1, end - start));
    start = end;
  }
  return rows.map(row => rowToEvent({ ...row, consecutive_count: maxStreakByTrack.get(String(row.track_provider_id)) || 1 }));
}

export async function getPublicProfile(slug: string, viewerId: string | null): Promise<TastemakerProfile | null> {
  if (!isDatabaseConfigured()) {
    if (!fixturesEnabled() || slug !== fixtureProfile.slug) return null;
    return viewerId
      ? { ...fixtureProfile, historyAccess: "full" }
      : { ...fixtureProfile, historyAccess: "teaser", events: fixtureProfile.events.slice(0, 3), viewerFollows: false };
  }
  await ensureSchema();
  const profileRows = await db()`
    select t.*,
      count(f.id) filter (where f.unfollowed_at is null)::int as follower_count,
      p.public_url as playlist_url,
      (
        select least(count(distinct pe.track_provider_id)::int, coalesce(p.max_tracks, 50))
        from listening_events pe
        where pe.tastemaker_id = t.id and pe.visibility = 'public' and pe.publish_at <= now()
      ) as playlist_track_count,
      p.last_sync_at,
      exists(select 1 from follows vf where vf.tastemaker_id = t.id and vf.user_id = ${viewerId} and vf.unfollowed_at is null) as viewer_follows,
      exists(select 1 from telegram_accounts ta where ta.user_id = ${viewerId} and ta.status = 'active') as telegram_connected,
      exists(select 1 from telegram_subscriptions ts where ts.tastemaker_id = t.id and ts.user_id = ${viewerId} and ts.active = true) as telegram_subscribed,
      (
        select count(*)::int from listening_events te
        where te.tastemaker_id = t.id and te.visibility = 'public' and te.publish_at <= now()
          and coalesce(
            te.observed_at,
            case when coalesce(te.raw_metadata->>'observedDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (te.raw_metadata->>'observedDate')::date::timestamptz end,
            te.fetched_at
          ) > now() - interval '30 days'
      ) as total_event_count_30d
    from tastemakers t
    left join follows f on f.tastemaker_id = t.id
    left join playlists p on p.tastemaker_id = t.id
    where t.slug = ${slug} and t.is_public = true and t.status <> 'archived'
    group by t.id, p.public_url, p.max_tracks, p.last_sync_at
    limit 1
  `;
  const row = profileRows[0];
  if (!row) return null;
  const events = await db()`
    select e.*, ec.id as comment_id, ec.body as comment_body, ec.updated_at as comment_updated_at,
      count(*) filter (where coalesce(
        e.observed_at,
        case when coalesce(e.raw_metadata->>'observedDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (e.raw_metadata->>'observedDate')::date::timestamptz end,
        e.fetched_at
      ) >= now() - interval '7 days') over (partition by e.track_provider_id)::int as play_count_7d,
      (select min(coalesce(
        fe.observed_at,
        case when coalesce(fe.raw_metadata->>'observedDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (fe.raw_metadata->>'observedDate')::date::timestamptz end,
        fe.fetched_at
      )) from listening_events fe
        where fe.tastemaker_id = e.tastemaker_id and fe.track_provider_id = e.track_provider_id
          and fe.visibility = 'public' and fe.publish_at <= now()
      ) as first_seen_at
    from listening_events e
    left join event_comments ec on ec.listening_event_id = e.id and ec.is_public = true
    where e.tastemaker_id = ${row.id}
      and e.visibility = 'public'
      and e.publish_at <= now()
      and coalesce(
        e.observed_at,
        case when coalesce(e.raw_metadata->>'observedDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (e.raw_metadata->>'observedDate')::date::timestamptz end,
        e.fetched_at
      ) > now() - interval '30 days'
    order by
      coalesce(
        e.observed_at,
        case when coalesce(e.raw_metadata->>'observedDate', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (e.raw_metadata->>'observedDate')::date::timestamptz end,
        e.fetched_at
      ) desc,
      case when coalesce(e.raw_metadata->>'providerPosition', '') ~ '^[0-9]+$' then (e.raw_metadata->>'providerPosition')::int end asc nulls last
    limit ${viewerId ? 80 : 3}
  `;
  return {
    id: row.id, slug: row.slug, name: row.name, bio: row.bio, roleLine: row.role_line,
    avatarUrl: row.avatar_url, verified: row.verified, status: row.status, isPublic: row.is_public,
    publishEnabled: row.publish_enabled, publicationDelaySeconds: row.publication_delay_seconds,
    followerCount: Number(row.follower_count), playlistUrl: row.playlist_url,
    playlistTrackCount: Number(row.playlist_track_count || 0),
    lastSyncAt: row.last_sync_at?.toISOString?.() || row.last_sync_at || null,
    viewerFollows: Boolean(row.viewer_follows), fixture: Boolean(row.fixture), events: publicEventsFromRows(events),
    historyAccess: viewerId ? "full" : "teaser",
    totalEventCount30d: Number(row.total_event_count_30d || 0),
    telegram: {
      available: telegramNotificationsConfigured(),
      connected: Boolean(row.telegram_connected),
      subscribed: Boolean(row.telegram_subscribed)
    }
  } as TastemakerProfile;
}

export async function getFeaturedPublicProfile(viewerId: string | null): Promise<TastemakerProfile | null> {
  if (!isDatabaseConfigured()) return fixturesEnabled() ? getPublicProfile(fixtureProfile.slug, viewerId) : null;
  await ensureSchema();
  const rows = await db()`
    select slug from tastemakers
    where is_public = true and status <> 'archived'
    order by (status = 'active') desc, verified desc, updated_at desc
    limit 1
  `;
  return rows[0]?.slug ? getPublicProfile(String(rows[0].slug), viewerId) : null;
}

export async function getPublicEvent(eventId: string) {
  if (!isDatabaseConfigured()) {
    if (!fixturesEnabled()) return null;
    const event = fixtureProfile.events.find(value => value.id === eventId);
    return event ? { event, tastemakerId: fixtureProfile.id } : null;
  }
  await ensureSchema();
  const rows = await db()`
    select e.*, t.id as tastemaker_id from listening_events e
    join tastemakers t on t.id = e.tastemaker_id and t.is_public = true
    where e.id::text = ${eventId} and e.visibility = 'public' and e.publish_at <= now()
    limit 1
  `;
  return rows[0] ? { event: rowToEvent(rows[0]), tastemakerId: rows[0].tastemaker_id as string } : null;
}

export async function getPlaylistDestination(tastemakerId: string, viewerId: string) {
  if (!isDatabaseConfigured()) return fixturesEnabled() && tastemakerId === fixtureProfile.id ? fixtureProfile.playlistUrl : null;
  await ensureSchema();
  const rows = await db()`
    select p.public_url from playlists p
    join tastemakers t on t.id = p.tastemaker_id and t.is_public = true
    join follows f on f.tastemaker_id = t.id and f.user_id = ${viewerId} and f.unfollowed_at is null
    where p.tastemaker_id = ${tastemakerId}
    limit 1
  `;
  return (rows[0]?.public_url as string | undefined) || null;
}

export async function toggleFollow(userId: string, tastemakerId: string, following: boolean, acquisitionSource?: string | null) {
  await ensureSchema();
  if (following) {
    await db().begin(async sql => {
      const makers = await sql`
        select id from tastemakers
        where id = ${tastemakerId} and is_public = true and status in ('active', 'paused')
        for share
      `;
      if (!makers[0]) throw new Error("TASTEMAKER_UNAVAILABLE");
      await sql`
        insert into follows (user_id, tastemaker_id, followed_at, unfollowed_at, acquisition_source)
        values (${userId}, ${tastemakerId}, now(), null, ${acquisitionSource || null})
        on conflict (user_id, tastemaker_id) do update set followed_at = now(), unfollowed_at = null, acquisition_source = coalesce(excluded.acquisition_source, follows.acquisition_source)
      `;
    });
  } else {
    await db().begin(async sql => {
      await sql`update follows set unfollowed_at = now() where user_id = ${userId} and tastemaker_id = ${tastemakerId} and unfollowed_at is null`;
      await sql`update telegram_subscriptions set active = false, unsubscribed_at = now(), updated_at = now() where user_id = ${userId} and tastemaker_id = ${tastemakerId} and active = true`;
    });
  }
  const rows = await db()`select count(*)::int as count from follows where tastemaker_id = ${tastemakerId} and unfollowed_at is null`;
  return Number(rows[0]?.count || 0);
}

export async function getFollowingProfiles(userId: string) {
  if (!isDatabaseConfigured()) return [];
  await ensureSchema();
  const rows = await db()`
    select
      t.id, t.slug, t.name, t.role_line, t.avatar_url,
      e.id as event_id, e.track_provider_id, e.album_provider_id, e.track_title,
      e.artist_names, e.cover_tone, e.cover_url, e.yandex_url, e.observed_at,
      e.fetched_at, e.publish_at, e.visibility, e.hidden_reason
    from follows f
    join tastemakers t on t.id = f.tastemaker_id
      and t.is_public = true and t.status <> 'archived'
    left join lateral (
      select listening_events.*
      from listening_events
      where listening_events.tastemaker_id = t.id
        and listening_events.visibility = 'public'
        and listening_events.publish_at <= now()
      order by coalesce(listening_events.observed_at, listening_events.fetched_at) desc
      limit 1
    ) e on true
    where f.user_id = ${userId} and f.unfollowed_at is null
    order by coalesce(e.observed_at, e.fetched_at, f.followed_at) desc
  `;
  return rows.map(row => ({
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    roleLine: row.role_line as string,
    avatarUrl: (row.avatar_url as string | null) || null,
    latestEvent: row.event_id ? rowToEvent({ ...row, id: row.event_id, play_count_7d: 1 }) : null
  }));
}

export async function getHomeDiscoveryData(): Promise<{ profiles: HomeTastemaker[]; activity: PublicActivity[] }> {
  if (!isDatabaseConfigured()) {
    if (!fixturesEnabled()) return { profiles: [], activity: [] };
    const event = fixtureProfile.events[0];
    return {
      profiles: [{
        id: fixtureProfile.id,
        slug: fixtureProfile.slug,
        name: fixtureProfile.name,
        roleLine: fixtureProfile.roleLine,
        avatarUrl: fixtureProfile.avatarUrl,
        latestTrack: event ? { title: event.track.title, artists: event.track.artists } : null,
        updatedAt: event?.observedAt || event?.fetchedAt || null
      }],
      activity: event ? [{
        id: event.id,
        kind: "listen",
        tastemakerName: fixtureProfile.name,
        tastemakerSlug: fixtureProfile.slug,
        trackTitle: event.track.title,
        artists: event.track.artists,
        comment: event.comment?.body || null,
        eventId: event.id,
        occurredAt: event.observedAt || event.fetchedAt
      }] : []
    };
  }
  await ensureSchema();
  const [profileRows, listenRows, commentRows] = await Promise.all([
    db()`
      select t.id, t.slug, t.name, t.role_line, t.avatar_url,
        e.track_title, e.artist_names,
        coalesce(e.observed_at, e.fetched_at) as latest_at
      from tastemakers t
      left join lateral (
        select track_title, artist_names, observed_at, fetched_at
        from listening_events
        where tastemaker_id = t.id and visibility = 'public' and publish_at <= now()
        order by coalesce(observed_at, fetched_at) desc
        limit 1
      ) e on true
      where t.is_public = true and t.status = 'active'
      order by verified desc, coalesce(e.observed_at, e.fetched_at, t.updated_at) desc
    `,
    db()`
      select e.id, e.track_title, e.artist_names, t.name, t.slug,
        coalesce(e.observed_at, e.fetched_at) as occurred_at
      from listening_events e
      join tastemakers t on t.id = e.tastemaker_id and t.is_public = true and t.status = 'active'
      where e.visibility = 'public' and e.publish_at <= now()
      order by coalesce(e.observed_at, e.fetched_at) desc
      limit 12
    `,
    db()`
      select ec.id, ec.body, ec.updated_at as occurred_at, e.id as event_id,
        e.track_title, e.artist_names, t.name, t.slug
      from event_comments ec
      join listening_events e on e.id = ec.listening_event_id and e.visibility = 'public' and e.publish_at <= now()
      join tastemakers t on t.id = ec.tastemaker_id and t.is_public = true and t.status = 'active'
      where ec.is_public = true
      order by ec.updated_at desc
      limit 12
    `
  ]);
  const profiles = profileRows.map(row => ({
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    roleLine: String(row.role_line),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    latestTrack: row.track_title ? { title: String(row.track_title), artists: Array.isArray(row.artist_names) ? row.artist_names.map(String) : [] } : null,
    updatedAt: row.latest_at?.toISOString?.() || (row.latest_at ? String(row.latest_at) : null)
  }));
  const activity: PublicActivity[] = [
    ...listenRows.map(row => ({
      id: `listen-${String(row.id)}`,
      kind: "listen" as const,
      tastemakerName: String(row.name),
      tastemakerSlug: String(row.slug),
      trackTitle: String(row.track_title),
      artists: Array.isArray(row.artist_names) ? row.artist_names.map(String) : [],
      comment: null,
      eventId: String(row.id),
      occurredAt: row.occurred_at?.toISOString?.() || String(row.occurred_at)
    })),
    ...commentRows.map(row => ({
      id: `comment-${String(row.id)}`,
      kind: "comment" as const,
      tastemakerName: String(row.name),
      tastemakerSlug: String(row.slug),
      trackTitle: String(row.track_title),
      artists: Array.isArray(row.artist_names) ? row.artist_names.map(String) : [],
      comment: String(row.body),
      eventId: String(row.event_id),
      occurredAt: row.occurred_at?.toISOString?.() || String(row.occurred_at)
    }))
  ].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).slice(0, 12);
  return { profiles, activity };
}
