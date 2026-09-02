create table if not exists event_comments (
  id uuid primary key default gen_random_uuid(),
  listening_event_id uuid not null unique references listening_events(id) on delete cascade,
  tastemaker_id uuid not null references tastemakers(id) on delete cascade,
  author_user_id uuid not null references users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 600),
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_comments_tastemaker_idx
  on event_comments(tastemaker_id, updated_at desc)
  where is_public = true;

alter table telegram_deliveries
  add column if not exists delivery_type text not null default 'history_digest';
alter table telegram_deliveries
  add column if not exists listening_event_id uuid references listening_events(id) on delete set null;
alter table telegram_deliveries
  add column if not exists comment_id uuid references event_comments(id) on delete set null;

create unique index if not exists telegram_deliveries_comment_once_idx
  on telegram_deliveries(subscription_id, comment_id, delivery_type)
  where comment_id is not null;
