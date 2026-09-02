import "server-only";
import postgres, { type Sql } from "postgres";
import { isDatabaseConfigured } from "@/lib/server/config";

declare global {
  // eslint-disable-next-line no-var
  var yandexTasteSql: Sql | undefined;
  // eslint-disable-next-line no-var
  var yandexTasteSchema: Promise<void> | undefined;
}

export { isDatabaseConfigured };

export function db() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  if (!global.yandexTasteSql) {
    global.yandexTasteSql = postgres(connectionString, {
      max: 8,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
      ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? false : "require",
      transform: { undefined: null }
    });
  }
  return global.yandexTasteSql;
}

async function createSchema() {
  const sql = db();
  await sql`create extension if not exists pgcrypto`;
  await sql`
    create table if not exists users (
      id uuid primary key default gen_random_uuid(),
      role text not null default 'user' check (role in ('user','creator','admin')),
      display_name text not null,
      avatar_url text,
      email text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      last_login_at timestamptz,
      is_active boolean not null default true
    )
  `;
  await sql`
    create table if not exists auth_identities (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      provider text not null check (provider in ('yandex_id','telegram')),
      provider_user_id text not null,
      provider_username text,
      created_at timestamptz not null default now(),
      unique(provider, provider_user_id)
    )
  `;
  await sql`
    create table if not exists sessions (
      token_hash text primary key,
      user_id uuid not null references users(id) on delete cascade,
      auth_context text not null default 'yandex' check (auth_context in ('yandex','owner_password')),
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists sessions_user_idx on sessions(user_id, expires_at desc)`;
  await sql`
    create table if not exists tastemakers (
      id uuid primary key default gen_random_uuid(),
      owner_user_id uuid references users(id) on delete set null,
      name text not null,
      slug text not null unique,
      bio text not null default '',
      role_line text not null default 'автор вкуса',
      avatar_url text,
      verified boolean not null default false,
      status text not null default 'draft' check (status in ('draft','invited','connected','active','paused','disconnected','archived')),
      is_public boolean not null default false,
      publish_enabled boolean not null default false,
      publication_delay_seconds integer not null default 0,
      sync_interval_seconds integer not null default 60 check (sync_interval_seconds in (60, 300, 900, 3600)),
      fixture boolean not null default false,
      consent_version text,
      consent_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists tastemaker_avatars (
      tastemaker_id uuid primary key references tastemakers(id) on delete cascade,
      image_bytes bytea not null,
      mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists creator_invites (
      id uuid primary key default gen_random_uuid(),
      tastemaker_id uuid not null references tastemakers(id) on delete cascade,
      token_hash text not null unique,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_by uuid references users(id) on delete set null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists music_connections (
      id uuid primary key default gen_random_uuid(),
      tastemaker_id uuid not null unique references tastemakers(id) on delete cascade,
      provider text not null default 'yandex_music_unofficial',
      provider_account_id text,
      provider_login text,
      encrypted_access_token text,
      encrypted_refresh_token text,
      token_expires_at timestamptz,
      status text not null default 'pending' check (status in ('pending','connected','error','disconnected')),
      connected_at timestamptz,
      last_success_at timestamptz,
      last_error_at timestamptz,
      last_error_code text,
      sync_locked_until timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists connection_challenges (
      id uuid primary key default gen_random_uuid(),
      tastemaker_id uuid not null references tastemakers(id) on delete cascade,
      encrypted_device_code text not null,
      user_code text not null,
      verification_url text not null,
      poll_interval_seconds integer not null default 5,
      expires_at timestamptz not null,
      completed_at timestamptz,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists service_music_connections (
      singleton_id smallint primary key default 1 check (singleton_id = 1),
      provider text not null default 'yandex_music_unofficial',
      provider_account_id text,
      provider_login text,
      encrypted_access_token text,
      encrypted_refresh_token text,
      token_expires_at timestamptz,
      status text not null default 'pending' check (status in ('pending','connected','error','disconnected')),
      connected_at timestamptz,
      last_error_at timestamptz,
      last_error_code text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists service_connection_challenges (
      id uuid primary key default gen_random_uuid(),
      encrypted_device_code text not null,
      user_code text not null,
      verification_url text not null,
      poll_interval_seconds integer not null default 5,
      expires_at timestamptz not null,
      completed_at timestamptz,
      created_by uuid references users(id) on delete set null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists listening_events (
      id uuid primary key default gen_random_uuid(),
      tastemaker_id uuid not null references tastemakers(id) on delete cascade,
      provider text not null default 'yandex_music_unofficial',
      provider_event_key text not null,
      track_provider_id text not null,
      album_provider_id text,
      track_title text not null,
      artist_names jsonb not null default '[]'::jsonb,
      artist_provider_ids jsonb not null default '[]'::jsonb,
      cover_url text,
      cover_tone text not null default 'sunset',
      yandex_url text not null,
      observed_at timestamptz,
      fetched_at timestamptz not null default now(),
      publish_at timestamptz not null,
      visibility text not null default 'pending' check (visibility in ('public','hidden','pending')),
      hidden_reason text,
      raw_metadata jsonb,
      created_at timestamptz not null default now(),
      unique(tastemaker_id, provider_event_key)
    )
  `;
  await sql`create index if not exists listening_public_idx on listening_events(tastemaker_id, publish_at desc) where visibility = 'public'`;
  await sql`create index if not exists listening_track_idx on listening_events(tastemaker_id, track_provider_id, observed_at desc)`;
  await sql`
    create table if not exists blocked_artists (
      id uuid primary key default gen_random_uuid(),
      tastemaker_id uuid not null references tastemakers(id) on delete cascade,
      provider_artist_id text,
      artist_name_normalized text not null,
      created_at timestamptz not null default now(),
      unique(tastemaker_id, artist_name_normalized)
    )
  `;
  await sql`
    create table if not exists blocked_tracks (
      id uuid primary key default gen_random_uuid(),
      tastemaker_id uuid not null references tastemakers(id) on delete cascade,
      provider_track_id text not null,
      created_at timestamptz not null default now(),
      unique(tastemaker_id, provider_track_id)
    )
  `;
  await sql`
    create table if not exists follows (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      tastemaker_id uuid not null references tastemakers(id) on delete cascade,
      followed_at timestamptz not null default now(),
      unfollowed_at timestamptz,
      acquisition_source text,
      unique(user_id, tastemaker_id)
    )
  `;
  await sql`create index if not exists follows_tastemaker_active_idx on follows(tastemaker_id, followed_at desc) where unfollowed_at is null`;
  await sql`
    create table if not exists telegram_accounts (
      user_id uuid primary key references users(id) on delete cascade,
      telegram_user_id text not null unique,
      chat_id text not null unique,
      username text,
      first_name text,
      status text not null default 'active' check (status in ('active','blocked','disconnected')),
      linked_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists telegram_link_tokens (
      id uuid primary key default gen_random_uuid(),
      token_hash text not null unique,
      user_id uuid not null references users(id) on delete cascade,
      tastemaker_id uuid not null references tastemakers(id) on delete cascade,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists telegram_link_tokens_user_idx on telegram_link_tokens(user_id, created_at desc)`;
  await sql`
    create table if not exists telegram_webhook_updates (
      update_id bigint primary key,
      received_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists telegram_subscriptions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      tastemaker_id uuid not null references tastemakers(id) on delete cascade,
      active boolean not null default true,
      subscribed_at timestamptz not null default now(),
      unsubscribed_at timestamptz,
      last_notified_at timestamptz,
      last_notified_event_id uuid references listening_events(id) on delete set null,
      notification_locked_until timestamptz,
      updated_at timestamptz not null default now(),
      unique(user_id, tastemaker_id)
    )
  `;
  await sql`alter table telegram_subscriptions add column if not exists notification_locked_until timestamptz`;
  await sql`create index if not exists telegram_subscriptions_due_idx on telegram_subscriptions(tastemaker_id, last_notified_at) where active = true`;
  await sql`
    create table if not exists telegram_deliveries (
      id uuid primary key default gen_random_uuid(),
      subscription_id uuid not null references telegram_subscriptions(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      tastemaker_id uuid not null references tastemakers(id) on delete cascade,
      click_token_hash text not null unique,
      event_count integer not null default 0,
      status text not null default 'queued' check (status in ('queued','sent','failed','clicked')),
      telegram_message_id text,
      error_code text,
      sent_at timestamptz,
      clicked_at timestamptz,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists telegram_deliveries_tastemaker_idx on telegram_deliveries(tastemaker_id, created_at desc)`;
  await sql`
    create table if not exists event_comments (
      id uuid primary key default gen_random_uuid(),
      listening_event_id uuid not null unique references listening_events(id) on delete cascade,
      tastemaker_id uuid not null references tastemakers(id) on delete cascade,
      author_user_id uuid not null references users(id) on delete cascade,
      body text not null check (char_length(body) between 1 and 600),
      is_public boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists event_comments_tastemaker_idx on event_comments(tastemaker_id, updated_at desc) where is_public = true`;
  await sql`alter table telegram_deliveries add column if not exists delivery_type text not null default 'history_digest'`;
  await sql`alter table telegram_deliveries add column if not exists listening_event_id uuid references listening_events(id) on delete set null`;
  await sql`alter table telegram_deliveries add column if not exists comment_id uuid references event_comments(id) on delete set null`;
  await sql`create unique index if not exists telegram_deliveries_comment_once_idx on telegram_deliveries(subscription_id, comment_id, delivery_type) where comment_id is not null`;
  await sql`
    create table if not exists playlists (
      id uuid primary key default gen_random_uuid(),
      tastemaker_id uuid not null unique references tastemakers(id) on delete cascade,
      provider text not null default 'yandex_music',
      provider_uid text,
      provider_kind text,
      public_url text,
      revision integer,
      max_tracks integer not null default 50,
      last_sync_at timestamptz,
      last_error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists analytics_events (
      id uuid primary key default gen_random_uuid(),
      event_name text not null,
      user_id uuid references users(id) on delete set null,
      anonymous_id text,
      session_id text not null,
      tastemaker_id uuid references tastemakers(id) on delete set null,
      track_provider_id text,
      properties jsonb not null default '{}'::jsonb,
      utm_source text,
      utm_medium text,
      utm_campaign text,
      referrer text,
      created_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists analytics_tastemaker_idx on analytics_events(tastemaker_id, created_at desc)`;
  await sql`create index if not exists analytics_event_idx on analytics_events(event_name, created_at desc)`;
  await sql`create index if not exists analytics_user_idx on analytics_events(user_id, created_at desc)`;
  await sql`create index if not exists analytics_anon_idx on analytics_events(anonymous_id, created_at desc)`;
  await sql`
    create table if not exists sync_logs (
      id uuid primary key default gen_random_uuid(),
      tastemaker_id uuid references tastemakers(id) on delete cascade,
      job_type text not null,
      status text not null,
      started_at timestamptz not null default now(),
      finished_at timestamptz,
      stats jsonb not null default '{}'::jsonb,
      error_code text,
      error_message text
    )
  `;
  await sql`
    create table if not exists automation_runs (
      id uuid primary key default gen_random_uuid(),
      source text not null,
      status text not null default 'running' check (status in ('running','success','partial','failed')),
      tastemakers_total integer not null default 0,
      tastemakers_succeeded integer not null default 0,
      tastemakers_failed integer not null default 0,
      telegram_sent integer not null default 0,
      summary jsonb not null default '{}'::jsonb,
      started_at timestamptz not null default now(),
      finished_at timestamptz
    )
  `;
  await sql`create index if not exists automation_runs_started_idx on automation_runs(started_at desc)`;
  await sql`
    create table if not exists audit_logs (
      id uuid primary key default gen_random_uuid(),
      actor_user_id uuid references users(id) on delete set null,
      action text not null,
      entity_type text not null,
      entity_id text not null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    create table if not exists feature_flags (
      key text primary key,
      enabled boolean not null,
      updated_by uuid references users(id) on delete set null,
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table sessions add column if not exists auth_context text not null default 'yandex'`;
  await sql`alter table tastemakers add column if not exists sync_interval_seconds integer not null default 60`;
  await sql`alter table tastemakers alter column publication_delay_seconds set default 0`;
  await sql`create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())`;
  await sql.begin(async transaction => {
    const applied = await transaction`insert into schema_migrations(version) values ('002_fast_sync') on conflict do nothing returning version`;
    if (!applied[0]) return;
    await transaction`alter table tastemakers drop constraint if exists tastemakers_sync_interval_seconds_check`;
    await transaction`alter table tastemakers alter column sync_interval_seconds set default 60`;
    await transaction`update tastemakers set sync_interval_seconds = 60 where sync_interval_seconds = 300`;
    await transaction`alter table tastemakers add constraint tastemakers_sync_interval_seconds_check check (sync_interval_seconds in (60, 300, 900, 3600))`;
  });
  await sql`
    create table if not exists admin_login_attempts (
      id uuid primary key default gen_random_uuid(),
      client_key text not null,
      attempted_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists admin_login_attempts_key_idx on admin_login_attempts(client_key, attempted_at desc)`;
  await sql`update tastemakers set name = 'Сафонов Иван', updated_at = now() where name = 'Пилотный автор'`;
  await sql`
    update tastemakers t set slug = 'safonov-ivan', updated_at = now()
    where t.slug = 'pilot-author'
      and not exists (select 1 from tastemakers existing where existing.slug = 'safonov-ivan' and existing.id <> t.id)
  `;
}

export async function ensureSchema() {
  if (!isDatabaseConfigured()) return;
  if (!global.yandexTasteSchema) {
    global.yandexTasteSchema = createSchema().catch(error => {
      global.yandexTasteSchema = undefined;
      throw error;
    });
  }
  return global.yandexTasteSchema;
}
