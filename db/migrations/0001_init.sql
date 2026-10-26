-- KeyLingo — esquema inicial
-- Compatível com PostgreSQL 14+ (inclusive Supabase). Toda a leitura/escrita é feita
-- pelo servidor da aplicação; o navegador nunca acessa o banco diretamente.

create extension if not exists citext;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Catálogo de conteúdo
-- ---------------------------------------------------------------------------

create table languages (
  code         text primary key check (code ~ '^[a-z]{2,3}$'),
  name_pt      text not null check (char_length(name_pt) between 2 and 40),
  native_name  text not null check (char_length(native_name) between 2 and 40),
  flag         text not null,                 -- emoji ou sigla exibida na interface
  locale       text not null check (locale ~ '^[a-z]{2,3}-[A-Z]{2}$'), -- BCP 47 usado em TTS/STT
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);

-- Níveis baseados no CEFR (Quadro Europeu Comum de Referência)
create table levels (
  code         text primary key check (code in ('A1','A2','B1','B2','C1','C2')),
  name_pt      text not null,
  description  text not null,
  sort_order   int not null unique,
  difficulty   numeric(4,2) not null check (difficulty between 0.5 and 3),
  rank_weight  numeric(4,2) not null check (rank_weight between 0.1 and 1)
);

create table categories (
  slug        text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  name_pt     text not null,
  icon        text not null default '📚',
  sort_order  int not null default 0
);

create table units (
  id             serial primary key,
  language_code  text not null references languages(code) on update cascade,
  level_code     text not null references levels(code),
  category_slug  text not null references categories(slug) on update cascade,
  title          text not null,
  description    text,
  sort_order     int not null default 0,
  unique (language_code, level_code, category_slug)
);

create table content_items (
  id              serial primary key,
  language_code   text not null references languages(code) on update cascade,
  unit_id         int references units(id) on delete set null,
  category_slug   text not null references categories(slug) on update cascade,
  level_code      text not null references levels(code),
  kind            text not null check (kind in ('word','phrase')),
  text            text not null check (char_length(text) between 1 and 200),
  translation_pt  text not null check (char_length(translation_pt) between 1 and 200),
  explanation     text check (char_length(explanation) <= 500),
  example_text    text check (char_length(example_text) <= 300),
  example_pt      text check (char_length(example_pt) <= 300),
  formats         text[] not null default array['translate','write','listen','speak'],
  review_status   text not null default 'pending_review'
                  check (review_status in ('draft','pending_review','approved','archived')),
  source          text not null,
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (formats <@ array['translate','write','listen','speak'] and cardinality(formats) > 0)
);
create unique index content_items_lang_text_uq on content_items (language_code, lower(text));
create index content_items_lookup_idx on content_items (language_code, review_status, level_code);

-- Respostas aceitas. to_pt = resposta em português (formato tradução);
-- to_target = resposta no idioma estudado (escrita, escuta e fala).
create table accepted_answers (
  id          serial primary key,
  item_id     int not null references content_items(id) on delete cascade,
  direction   text not null check (direction in ('to_pt','to_target')),
  answer      text not null check (char_length(answer) between 1 and 200),
  is_primary  boolean not null default false,
  unique (item_id, direction, answer)
);
create index accepted_answers_item_idx on accepted_answers (item_id);

create table audio_assets (
  id             serial primary key,
  item_id        int not null references content_items(id) on delete cascade,
  url            text not null check (char_length(url) <= 500),
  kind           text not null check (kind in ('recorded','synthetic')),
  locale         text not null,
  voice          text,
  license        text,
  source         text,
  review_status  text not null default 'pending_review'
                 check (review_status in ('pending_review','approved','archived')),
  created_at     timestamptz not null default now()
);
create index audio_assets_item_idx on audio_assets (item_id);

-- ---------------------------------------------------------------------------
-- Usuários, autenticação e perfis
-- ---------------------------------------------------------------------------

create table users (
  id                 uuid primary key default gen_random_uuid(),
  email              citext not null unique check (char_length(email) <= 254),
  password_hash      text not null,
  email_verified_at  timestamptz,
  role               text not null default 'user' check (role in ('user','admin')),
  status             text not null default 'active' check (status in ('active','suspended')),
  suspended_reason   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table content_items
  add constraint content_items_reviewed_by_fk foreign key (reviewed_by) references users(id) on delete set null;

create table profiles (
  user_id           uuid primary key references users(id) on delete cascade,
  nickname          citext not null unique check (nickname ~ '^[A-Za-z0-9_.-]{3,24}$'),
  avatar            text not null default 'fox',
  avatar_color      text not null default 'violet',
  current_language  text references languages(code) on update cascade,
  timezone          text not null default 'America/Sao_Paulo',
  tts_rate          numeric(3,2) not null default 1.00 check (tts_rate between 0.5 and 1.5),
  autoplay_audio    boolean not null default true,
  show_in_rankings  boolean not null default true,
  weekly_goal_xp    int not null default 300 check (weekly_goal_xp between 50 and 5000),
  voice_consent_at  timestamptz,
  terms_accepted_at timestamptz not null default now(),
  is_demo           boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table auth_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  last_seen_at  timestamptz not null default now(),
  ip            text,
  user_agent    text
);
create index auth_sessions_user_idx on auth_sessions (user_id);

create table auth_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  purpose     text not null check (purpose in ('reset_password','verify_email')),
  token_hash  text not null unique,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index auth_tokens_user_idx on auth_tokens (user_id, purpose);

create table email_outbox (
  id          bigserial primary key,
  to_email    text not null,
  subject     text not null,
  body_text   text,          -- somente no transporte "log" (desenvolvimento)
  transport   text not null check (transport in ('smtp','log','disabled')),
  status      text not null check (status in ('sent','logged','failed','skipped')),
  error       text,
  created_at  timestamptz not null default now()
);

create table rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  count         int not null default 0,
  primary key (key, window_start)
);

-- ---------------------------------------------------------------------------
-- Temporadas e sessões de jogo
-- ---------------------------------------------------------------------------

create table seasons (
  id         serial primary key,
  name       text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  status     text not null default 'scheduled' check (status in ('scheduled','active','closed')),
  closed_at  timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create unique index seasons_one_active_uq on seasons (status) where status = 'active';

create table game_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  language_code     text not null references languages(code) on update cascade,
  mode              text not null check (mode in ('typing','voice')),
  format            text not null check (format in ('translate','write','listen','mixed','speak')),
  kind              text not null check (kind in ('ranked','practice','placement')),
  preset            text not null,
  duration_seconds  int check (duration_seconds is null or duration_seconds between 30 and 1800),
  target_count      int not null check (target_count between 1 and 200),
  verification      text not null default 'server' check (verification in ('server','client')),
  focus             text,
  status            text not null default 'active' check (status in ('active','finished')),
  end_reason        text,
  started_at        timestamptz not null default now(),
  timer_started_at  timestamptz,              -- cronômetro inicia quando o 1º exercício é exibido
  expires_at        timestamptz not null,
  finished_at       timestamptz,
  season_id         int references seasons(id),
  rules_version     int not null,
  raw_score         int not null default 0,
  xp_awarded        int not null default 0,
  rank_points       int not null default 0,
  answered_count    int not null default 0,
  correct_count     int not null default 0,
  partial_count     int not null default 0,
  wrong_count       int not null default 0,
  max_streak        int not null default 0,
  accuracy          numeric(5,4) not null default 0,
  avg_speed         numeric(5,4) not null default 0,
  study_seconds     int not null default 0,
  result            jsonb,
  created_at        timestamptz not null default now()
);
create index game_sessions_user_idx on game_sessions (user_id, started_at desc);
create index game_sessions_active_idx on game_sessions (user_id) where status = 'active';
create index game_sessions_ranking_idx on game_sessions (mode, finished_at)
  where status = 'finished' and kind = 'ranked' and rank_points > 0;

create table session_items (
  session_id   uuid not null references game_sessions(id) on delete cascade,
  idx          int not null check (idx >= 0),
  item_id      int not null references content_items(id) on delete cascade,
  format       text not null check (format in ('translate','write','listen','speak')),
  is_review    boolean not null default false,
  audio_source text check (audio_source in ('asset','server_tts','browser_tts','none')),
  served_at    timestamptz,
  answered_at  timestamptz,
  attempts     int not null default 0,
  excluded     boolean not null default false, -- ex.: áudio indisponível (não conta como resposta)
  result       text check (result in ('correct','accent','typo','wrong','skipped')),
  score        numeric(5,2),       -- 0..100 (crédito da primeira tentativa / melhor tentativa na voz)
  points       int not null default 0,
  xp           int not null default 0,
  speed        numeric(5,4),
  primary key (session_id, idx)
);
create index session_items_item_idx on session_items (item_id);

create table answers (
  id            bigserial primary key,
  session_id    uuid not null,
  idx           int not null,
  user_id       uuid not null references users(id) on delete cascade,
  attempt_no    int not null check (attempt_no between 1 and 3),
  answer_text   text check (char_length(answer_text) <= 500),
  result        text not null check (result in ('correct','accent','typo','wrong','skipped')),
  score         numeric(5,2) not null default 0,
  response_ms   int,
  assessment    jsonb,
  created_at    timestamptz not null default now(),
  foreign key (session_id, idx) references session_items(session_id, idx) on delete cascade,
  unique (session_id, idx, attempt_no)
);
create index answers_user_created_idx on answers (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Progresso, XP, conquistas e revisão espaçada
-- ---------------------------------------------------------------------------

create table user_stats (
  user_id          uuid primary key references users(id) on delete cascade,
  xp_total         int not null default 0 check (xp_total >= 0),
  level            int not null default 1,
  current_streak   int not null default 0,
  longest_streak   int not null default 0,
  last_study_date  date,
  study_seconds    bigint not null default 0,
  sessions_count   int not null default 0,
  answered_total   int not null default 0,
  correct_total    int not null default 0,
  best_answer_streak int not null default 0,
  updated_at       timestamptz not null default now()
);

create table user_languages (
  user_id          uuid not null references users(id) on delete cascade,
  language_code    text not null references languages(code) on update cascade,
  level_code       text not null references levels(code),
  placement_level  text references levels(code),
  started_at       timestamptz not null default now(),
  last_studied_at  timestamptz,
  primary key (user_id, language_code)
);

create table user_item_progress (
  user_id        uuid not null references users(id) on delete cascade,
  item_id        int not null references content_items(id) on delete cascade,
  ease           numeric(4,2) not null default 2.50,
  interval_days  numeric(8,3) not null default 0,
  reps           int not null default 0,
  lapses         int not null default 0,
  correct_count  int not null default 0,
  wrong_count    int not null default 0,
  last_result    text,
  last_seen_at   timestamptz,
  due_at         timestamptz not null default now(),
  primary key (user_id, item_id)
);
create index user_item_progress_due_idx on user_item_progress (user_id, due_at);

-- Livro-razão de XP. A unicidade (user_id, source, ref) garante idempotência.
create table xp_events (
  id          bigserial primary key,
  user_id     uuid not null references users(id) on delete cascade,
  source      text not null check (source in ('session','challenge','achievement','weekly_goal')),
  ref         text not null,
  amount      int not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  unique (user_id, source, ref)
);
create index xp_events_user_created_idx on xp_events (user_id, created_at);

create table achievements (
  code            text primary key,
  name_pt         text not null,
  description_pt  text not null,
  icon            text not null,
  xp_reward       int not null default 0,
  sort_order      int not null default 0
);

create table user_achievements (
  user_id           uuid not null references users(id) on delete cascade,
  achievement_code  text not null references achievements(code) on delete cascade,
  unlocked_at       timestamptz not null default now(),
  session_id        uuid references game_sessions(id) on delete set null,
  primary key (user_id, achievement_code)
);

create table challenge_completions (
  user_id         uuid not null references users(id) on delete cascade,
  challenge_date  date not null,
  code            text not null,
  xp              int not null,
  completed_at    timestamptz not null default now(),
  primary key (user_id, challenge_date, code)
);

-- Resultado final congelado de cada temporada (histórico preservado após o reinício)
create table season_results (
  season_id      int not null references seasons(id) on delete cascade,
  user_id        uuid not null references users(id) on delete cascade,
  board          text not null check (board in ('typing','voice','general')),
  language_code  text not null default '*',
  points         int not null,
  position       int not null,
  league         text not null,
  primary key (season_id, user_id, board, language_code)
);

-- ---------------------------------------------------------------------------
-- Administração, configuração e auditoria
-- ---------------------------------------------------------------------------

create table app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

create table audit_logs (
  id           bigserial primary key,
  actor_id     uuid references users(id) on delete set null,
  action       text not null,
  target_type  text,
  target_id    text,
  details      jsonb,
  ip           text,
  created_at   timestamptz not null default now()
);
create index audit_logs_created_idx on audit_logs (created_at desc);

create table app_events (
  id          bigserial primary key,
  level       text not null check (level in ('info','warn','error')),
  source      text not null,
  message     text not null,
  context     jsonb,
  user_id     uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index app_events_created_idx on app_events (created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- A aplicação acessa o banco pelo servidor com o papel dono das tabelas.
-- RLS habilitado sem políticas = negação total para os papéis "anon" e
-- "authenticated" da API pública do Supabase (PostgREST), impedindo que alguém
-- leia ou altere dados (inclusive pontuações) com a chave pública.
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
    execute 'revoke all on all sequences in schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
  end if;
end $$;
