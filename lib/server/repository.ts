import "server-only";
import { fixtureProfile } from "@/lib/fixtures";
import { db, ensureSchema, isDatabaseConfigured } from "@/lib/server/db";
import type { ListeningEvent, TastemakerProfile } from "@/types/domain";

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
    fetchedAt: row.fetched_at?.toISOString?.() || row.fetched_at,
    publishAt: row.publish_at?.toISOString?.() || row.publish_at,
    visibility: row.visibility,
    hiddenReason: row.hidden_reason,
    playCount7d: Number(row.play_count_7d || 1),
    firstSeenAt: row.first_seen_at?.toISOString?.() || row.first_seen_at || row.fetched_at?.toISOString?.() || row.fetched_at
  };
}

export async function getPublicProfile(slug: string, viewerId: string | null): Promise<TastemakerProfile | null> {
  if (!isDatabaseConfigured()) return [fixtureProfile.slug, "demo", "lera"].includes(slug) ? { ...fixtureProfile } : null;
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
      exists(select 1 from follows vf where vf.tastemaker_id = t.id and vf.user_id = ${viewerId} and vf.unfollowed_at is null) as viewer_follows
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
    select e.*,
      count(*) over (partition by e.track_provider_id)::int as play_count_7d,
      min(e.observed_at) over (partition by e.track_provider_id) as first_seen_at
    from listening_events e
    where e.tastemaker_id = ${row.id}
      and e.visibility = 'public'
      and e.publish_at <= now()
      and (e.observed_at is null or e.observed_at > now() - interval '30 days')
    order by coalesce(e.observed_at, e.fetched_at) desc
    limit 80
  `;
  return {
    id: row.id, slug: row.slug, name: row.name, bio: row.bio, roleLine: row.role_line,
    avatarUrl: row.avatar_url, verified: row.verified, status: row.status, isPublic: row.is_public,
    publishEnabled: row.publish_enabled, publicationDelaySeconds: row.publication_delay_seconds,
    followerCount: Number(row.follower_count), playlistUrl: row.playlist_url,
    playlistTrackCount: Number(row.playlist_track_count || 0),
    lastSyncAt: row.last_sync_at?.toISOString?.() || row.last_sync_at || null,
    viewerFollows: Boolean(row.viewer_follows), fixture: Boolean(row.fixture), events: events.map(rowToEvent)
  } as TastemakerProfile;
}

export async function getFeaturedPublicProfile(viewerId: string | null): Promise<TastemakerProfile | null> {
  if (!isDatabaseConfigured()) return { ...fixtureProfile };
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

export async function getPlaylistDestination(tastemakerId: string) {
  if (!isDatabaseConfigured()) return tastemakerId === fixtureProfile.id ? fixtureProfile.playlistUrl : null;
  await ensureSchema();
  const rows = await db()`select p.public_url from playlists p join tastemakers t on t.id = p.tastemaker_id where p.tastemaker_id = ${tastemakerId} and t.is_public = true limit 1`;
  return (rows[0]?.public_url as string | undefined) || null;
}

export async function toggleFollow(userId: string, tastemakerId: string, following: boolean, acquisitionSource?: string | null) {
  await ensureSchema();
  if (following) {
    await db()`
      insert into follows (user_id, tastemaker_id, followed_at, unfollowed_at, acquisition_source)
      values (${userId}, ${tastemakerId}, now(), null, ${acquisitionSource || null})
      on conflict (user_id, tastemaker_id) do update set followed_at = now(), unfollowed_at = null, acquisition_source = coalesce(excluded.acquisition_source, follows.acquisition_source)
    `;
  } else {
    await db()`update follows set unfollowed_at = now() where user_id = ${userId} and tastemaker_id = ${tastemakerId} and unfollowed_at is null`;
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
