alter table analytics_events
  add column if not exists is_internal boolean not null default false;

update analytics_events ae
set is_internal = true
from users u
where ae.user_id = u.id
  and u.role in ('creator', 'admin')
  and ae.is_internal = false;

create index if not exists analytics_external_event_idx
  on analytics_events(event_name, created_at desc)
  where is_internal = false;

insert into schema_migrations(version) values ('005_analytics_integrity') on conflict do nothing;
