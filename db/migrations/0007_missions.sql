-- Missões de diálogo (modo texto) e suas tentativas.

create table missions (
  id                text primary key check (id ~ '^[a-z]{2,3}-[a-z0-9-]{2,40}$'),
  language_code     text not null references languages(code) on update cascade,
  region            text not null,
  level_code        text not null references levels(code),
  title             text not null,
  sort_order        int not null default 0,
  requires_mission  text references missions(id) on delete set null,
  requires_lessons  int not null default 0 check (requires_lessons >= 0),
  spec              jsonb not null,
  review_status     text not null default 'pending_review' check (review_status in ('draft','pending_review','approved','archived')),
  origin            text not null default 'human' check (origin in ('ai_assisted','human','imported')),
  source            text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index missions_lang_idx on missions (language_code, region, sort_order);

create table mission_attempts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  mission_id    text not null references missions(id) on delete cascade,
  status        text not null default 'in_progress' check (status in ('in_progress','completed','abandoned')),
  current_step  int not null default 0,
  -- Nível de dica usado em cada etapa (0–3)
  hints         int[] not null default '{}',
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  score         numeric(4,3),
  xp_awarded    int not null default 0,
  summary       jsonb
);
create index mission_attempts_user_idx on mission_attempts (user_id, mission_id, started_at desc);
-- No máximo uma tentativa em andamento por usuário e missão
create unique index mission_attempts_one_open on mission_attempts (user_id, mission_id) where status = 'in_progress';

create table mission_turns (
  id           bigserial primary key,
  attempt_id   uuid not null references mission_attempts(id) on delete cascade,
  step_idx     int not null,
  try_no       int not null check (try_no between 1 and 3),
  answer_text  text not null check (char_length(answer_text) <= 300),
  passed       boolean not null,
  evaluation   jsonb not null,
  created_at   timestamptz not null default now(),
  unique (attempt_id, step_idx, try_no)
);

alter table xp_events drop constraint if exists xp_events_source_check;
alter table xp_events add constraint xp_events_source_check
  check (source in ('session','challenge','achievement','weekly_goal','lesson','mission'));

do $$
declare t text;
begin
  foreach t in array array['missions','mission_attempts','mission_turns'] loop
    execute format('alter table public.%I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on table public.%I from authenticated', t);
    end if;
  end loop;
end $$;
