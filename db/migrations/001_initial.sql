create extension if not exists pgcrypto;
create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now());

create table if not exists users (
  id uuid primary key default gen_random_uuid(), role text not null default 'user' check (role in ('user','creator','admin')),
  display_name text not null, avatar_url text, email text, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), last_login_at timestamptz, is_active boolean not null default true
);
create table if not exists auth_identities (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('yandex_id','telegram')), provider_user_id text not null,
  provider_username text, created_at timestamptz not null default now(), unique(provider, provider_user_id)
);
create table if not exists sessions (
  token_hash text primary key, user_id uuid not null references users(id) on delete cascade,
  auth_context text not null default 'yandex' check (auth_context in ('yandex','owner_password')),
  expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions(user_id, expires_at desc);

create table if not exists tastemakers (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid references users(id) on delete set null,
  name text not null, slug text not null unique, bio text not null default '', role_line text not null default 'автор вкуса',
  avatar_url text, verified boolean not null default false,
  status text not null default 'draft' check (status in ('draft','invited','connected','active','paused','disconnected','archived')),
  is_public boolean not null default false, publish_enabled boolean not null default false,
  publication_delay_seconds integer not null default 0,
  sync_interval_seconds integer not null default 60 check (sync_interval_seconds in (60, 300, 900, 3600)), fixture boolean not null default false,
  consent_version text, consent_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists tastemaker_avatars (
  tastemaker_id uuid primary key references tastemakers(id) on delete cascade,
  image_bytes bytea not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  updated_at timestamptz not null default now()
);
create table if not exists creator_invites (
  id uuid primary key default gen_random_uuid(), tastemaker_id uuid not null references tastemakers(id) on delete cascade,
  token_hash text not null unique, expires_at timestamptz not null, used_at timestamptz,
  created_by uuid references users(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists music_connections (
  id uuid primary key default gen_random_uuid(), tastemaker_id uuid not null unique references tastemakers(id) on delete cascade,
  provider text not null default 'yandex_music_unofficial', provider_account_id text, provider_login text,
  encrypted_access_token text, encrypted_refresh_token text, token_expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending','connected','error','disconnected')),
  connected_at timestamptz, last_success_at timestamptz, last_error_at timestamptz, last_error_code text,
  sync_locked_until timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists connection_challenges (
  id uuid primary key default gen_random_uuid(), tastemaker_id uuid not null references tastemakers(id) on delete cascade,
  encrypted_device_code text not null, user_code text not null, verification_url text not null,
  poll_interval_seconds integer not null default 5, expires_at timestamptz not null,
  completed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists service_music_connections (
  singleton_id smallint primary key default 1 check (singleton_id = 1),
  provider text not null default 'yandex_music_unofficial', provider_account_id text, provider_login text,
  encrypted_access_token text, encrypted_refresh_token text, token_expires_at timestamptz,
  status text not null default 'pending' check (status in ('pending','connected','error','disconnected')),
  connected_at timestamptz, last_error_at timestamptz, last_error_code text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists service_connection_challenges (
  id uuid primary key default gen_random_uuid(), encrypted_device_code text not null, user_code text not null,
  verification_url text not null, poll_interval_seconds integer not null default 5,
  expires_at timestamptz not null, completed_at timestamptz,
  created_by uuid references users(id) on delete set null, created_at timestamptz not null default now()
);

create table if not exists listening_events (
  id uuid primary key default gen_random_uuid(), tastemaker_id uuid not null references tastemakers(id) on delete cascade,
  provider text not null default 'yandex_music_unofficial', provider_event_key text not null,
  track_provider_id text not null, album_provider_id text, track_title text not null,
  artist_names jsonb not null default '[]'::jsonb, artist_provider_ids jsonb not null default '[]'::jsonb,
  cover_url text, cover_tone text not null default 'sunset', yandex_url text not null,
  observed_at timestamptz, fetched_at timestamptz not null default now(), publish_at timestamptz not null,
  visibility text not null default 'pending' check (visibility in ('public','hidden','pending')),
  hidden_reason text, raw_metadata jsonb, created_at timestamptz not null default now(),
  unique(tastemaker_id, provider_event_key)
);
create index if not exists listening_public_idx on listening_events(tastemaker_id, publish_at desc) where visibility = 'public';
create index if not exists listening_track_idx on listening_events(tastemaker_id, track_provider_id, observed_at desc);
create table if not exists blocked_artists (
  id uuid primary key default gen_random_uuid(), tastemaker_id uuid not null references tastemakers(id) on delete cascade,
  provider_artist_id text, artist_name_normalized text not null, created_at timestamptz not null default now(), unique(tastemaker_id, artist_name_normalized)
);
create table if not exists blocked_tracks (
  id uuid primary key default gen_random_uuid(), tastemaker_id uuid not null references tastemakers(id) on delete cascade,
  provider_track_id text not null, created_at timestamptz not null default now(), unique(tastemaker_id, provider_track_id)
);
create table if not exists follows (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade,
  tastemaker_id uuid not null references tastemakers(id) on delete cascade, followed_at timestamptz not null default now(),
  unfollowed_at timestamptz, acquisition_source text, unique(user_id, tastemaker_id)
);
create index if not exists follows_tastemaker_active_idx on follows(tastemaker_id, followed_at desc) where unfollowed_at is null;
create table if not exists playlists (
  id uuid primary key default gen_random_uuid(), tastemaker_id uuid not null unique references tastemakers(id) on delete cascade,
  provider text not null default 'yandex_music', provider_uid text, provider_kind text, public_url text,
  revision integer, max_tracks integer not null default 50, last_sync_at timestamptz, last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(), event_name text not null, user_id uuid references users(id) on delete set null,
  anonymous_id text, session_id text not null, tastemaker_id uuid references tastemakers(id) on delete set null,
  track_provider_id text, properties jsonb not null default '{}'::jsonb, utm_source text, utm_medium text,
  utm_campaign text, referrer text, created_at timestamptz not null default now()
);
create index if not exists analytics_tastemaker_idx on analytics_events(tastemaker_id, created_at desc);
create index if not exists analytics_event_idx on analytics_events(event_name, created_at desc);
create index if not exists analytics_user_idx on analytics_events(user_id, created_at desc);
create index if not exists analytics_anon_idx on analytics_events(anonymous_id, created_at desc);
create table if not exists sync_logs (
  id uuid primary key default gen_random_uuid(), tastemaker_id uuid references tastemakers(id) on delete cascade,
  job_type text not null, status text not null, started_at timestamptz not null default now(), finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb, error_code text, error_message text
);
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(), actor_user_id uuid references users(id) on delete set null,
  action text not null, entity_type text not null, entity_id text not null, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists feature_flags (
  key text primary key, enabled boolean not null, updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists admin_login_attempts (
  id uuid primary key default gen_random_uuid(), client_key text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists admin_login_attempts_key_idx on admin_login_attempts(client_key, attempted_at desc);
insert into schema_migrations(version) values ('001_initial') on conflict do nothing;
