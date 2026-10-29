-- Planos, assinaturas e cobrança.
-- Nenhum dado de cartão é armazenado: o provedor de pagamento guarda o meio de pagamento,
-- aqui ficam apenas identificadores do provedor, status e valores.

create table plans (
  code             text primary key check (code ~ '^[a-z0-9_]{2,40}$'),
  tier             text not null check (tier in ('free','premium')),
  name             text not null,
  description      text not null default '',
  price_cents      int not null default 0 check (price_cents >= 0),
  currency         text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  billing_interval text check (billing_interval in ('month','year')),
  provider_price_id text,
  is_active        boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);

-- Sessões de checkout criadas pelo servidor: amarram o pagamento ao usuário e ao plano.
create table checkout_sessions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users(id) on delete cascade,
  plan_code            text not null references plans(code),
  provider             text not null,
  provider_checkout_id text not null,
  status               text not null default 'open' check (status in ('open','completed','expired','canceled')),
  created_at           timestamptz not null default now(),
  expires_at           timestamptz not null,
  completed_at         timestamptz,
  unique (provider, provider_checkout_id)
);
create index checkout_sessions_user_idx on checkout_sessions (user_id, created_at desc);

create table subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references users(id) on delete cascade,
  plan_code                text not null references plans(code),
  provider                 text not null,
  provider_customer_id     text,
  provider_subscription_id text not null,
  status                   text not null check (status in ('trialing','active','past_due','canceled','expired','incomplete')),
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  canceled_at              timestamptz,
  last_event_at            timestamptz not null default now(), -- ordenação de eventos fora de ordem
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
create index subscriptions_user_idx on subscriptions (user_id, created_at desc);

-- Eventos de webhook: unicidade por (provider, event_id) garante idempotência.
create table payment_events (
  id           bigserial primary key,
  provider     text not null,
  event_id     text not null,
  type         text not null,
  occurred_at  timestamptz not null,
  subscription_ref text,
  payload      jsonb not null, -- evento normalizado (sem dados de cartão)
  status       text not null default 'received' check (status in ('received','processed','ignored','deferred','failed')),
  error        text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);
create index payment_events_deferred_idx on payment_events (provider, subscription_ref) where status = 'deferred';

create table invoices (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references users(id) on delete cascade,
  subscription_id     uuid references subscriptions(id) on delete set null,
  provider            text not null,
  provider_invoice_id text not null,
  amount_cents        int not null check (amount_cents >= 0),
  currency            text not null,
  status              text not null check (status in ('paid','failed','refunded','open')),
  period_start        timestamptz,
  period_end          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider, provider_invoice_id)
);
create index invoices_user_idx on invoices (user_id, created_at desc);

-- Contadores de uso diário de recursos com custo (voz no servidor, TTS).
create table usage_counters (
  user_id  uuid not null references users(id) on delete cascade,
  feature  text not null check (feature in ('voice_assessment','tts')),
  day      date not null,
  count    int not null default 0,
  primary key (user_id, feature, day)
);

insert into plans (code, tier, name, description, price_cents, currency, billing_interval, sort_order) values
  ('free', 'free', 'Grátis', 'Trilha A1–A2, jogos, revisão espaçada, metas e conquistas.', 0, 'BRL', null, 0),
  ('premium_monthly', 'premium', 'Premium mensal', 'Todas as lições, estatísticas detalhadas e mais recursos de voz.', 2990, 'BRL', 'month', 1),
  ('premium_yearly', 'premium', 'Premium anual', 'Tudo do Premium com desconto no plano anual.', 23990, 'BRL', 'year', 2);

do $$
declare t text;
begin
  foreach t in array array['plans','checkout_sessions','subscriptions','payment_events','invoices','usage_counters'] loop
    execute format('alter table public.%I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table public.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on table public.%I from authenticated', t);
    end if;
  end loop;
end $$;
