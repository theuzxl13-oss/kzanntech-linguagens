-- Onboarding (objetivo e meta diária) e procedência do conteúdo.

alter table profiles
  add column learning_goal  text check (learning_goal in ('travel','work','study','culture','other')),
  add column daily_goal_xp  int not null default 30 check (daily_goal_xp between 10 and 500),
  add column onboarded_at   timestamptz;

-- Contas existentes já usam o app: não são levadas de volta ao onboarding.
update profiles set onboarded_at = created_at where onboarded_at is null;

-- Procedência: conteúdo redigido com apoio de IA nunca é considerado validado automaticamente.
alter table content_items
  add column origin text not null default 'human' check (origin in ('ai_assisted','human','imported'));

-- O catálogo inicial (seed) foi redigido com apoio de IA.
update content_items set origin = 'ai_assisted' where source like 'Seed inicial KeyLingo%';

-- Aprovado exige revisor registrado.
update content_items set review_status = 'pending_review' where review_status = 'approved' and reviewed_by is null;
alter table content_items add constraint content_items_approved_reviewed check (review_status <> 'approved' or reviewed_by is not null);
