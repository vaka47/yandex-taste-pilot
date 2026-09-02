alter table tastemakers
  add column if not exists gender text not null default 'neutral';

alter table tastemakers
  drop constraint if exists tastemakers_gender_check;

alter table tastemakers
  add constraint tastemakers_gender_check check (gender in ('male', 'female', 'neutral'));

update tastemakers
set name = 'Иван Сафонов', gender = 'male', updated_at = now()
where slug = 'safonov-ivan';

insert into schema_migrations(version) values ('004_soundmaker_gender') on conflict do nothing;
