-- Início de lição registrado no servidor: a conclusão só vale se a lição foi iniciada e
-- se passou um tempo mínimo compatível com o número de exercícios (antifraude de XP).
create table lesson_attempts (
  user_id     uuid not null references users(id) on delete cascade,
  unit_id     int not null references units(id) on delete cascade,
  started_at  timestamptz not null default now(),
  primary key (user_id, unit_id)
);
alter table lesson_attempts enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.lesson_attempts from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.lesson_attempts from authenticated';
  end if;
end $$;
