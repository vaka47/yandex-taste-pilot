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
);

create table if not exists telegram_link_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references users(id) on delete cascade,
  tastemaker_id uuid not null references tastemakers(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists telegram_link_tokens_user_idx on telegram_link_tokens(user_id, created_at desc);

create table if not exists telegram_webhook_updates (
  update_id bigint primary key,
  received_at timestamptz not null default now()
);

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
);
alter table telegram_subscriptions add column if not exists notification_locked_until timestamptz;
create index if not exists telegram_subscriptions_due_idx on telegram_subscriptions(tastemaker_id, last_notified_at) where active = true;

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
);
create index if not exists telegram_deliveries_tastemaker_idx on telegram_deliveries(tastemaker_id, created_at desc);

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
);
create index if not exists automation_runs_started_idx on automation_runs(started_at desc);
