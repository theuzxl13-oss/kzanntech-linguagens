-- Trilha de aprendizado: lições (unidades) concluídas pelo aluno e XP de lição.
create table user_lessons (
  user_id        uuid not null references users(id) on delete cascade,
  unit_id        int not null references units(id) on delete cascade,
  first_completed_at timestamptz not null default now(),
  last_completed_at  timestamptz not null default now(),
  best_accuracy  numeric(5,4) not null default 0 check (best_accuracy between 0 and 1),
  times_completed int not null default 1,
  primary key (user_id, unit_id)
);
alter table user_lessons enable row level security;

alter table xp_events drop constraint if exists xp_events_source_check;
alter table xp_events add constraint xp_events_source_check
  check (source in ('session','challenge','achievement','weekly_goal','lesson'));

-- Mesma política da migração inicial: nenhuma permissão para os papéis públicos do Supabase.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.user_lessons from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.user_lessons from authenticated';
  end if;
end $$;
