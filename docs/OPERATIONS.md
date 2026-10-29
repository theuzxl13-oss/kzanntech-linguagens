# Operação, monitoramento e manutenção

## Verificações contínuas (CI)

`.github/workflows/ci.yml` roda a cada push e pull request, sem segredos e sem deploy:

| Job | O que verifica |
|---|---|
| Lint, tipos, unitários, auditoria e segredos | ESLint, `tsc`, Vitest unitário, `npm audit --audit-level=high`, `scripts/check-secrets.mjs`, build da demo |
| Integração, build e E2E | PostgreSQL 16 descartável (service container), testes de integração, `next build`, Playwright (desktop + celular) |
| CodeQL | análise estática de JavaScript/TypeScript (resultados em Security → Code scanning) |

Permissões: `contents: read` por padrão; só o CodeQL recebe `security-events: write` e só o job de publicação da demo recebe `pages: write`/`id-token: write`.

Recomendado ativar no GitHub (exige ação do dono do repositório): **Secret scanning + push protection**, **Dependabot alerts**, regra de proteção de branch exigindo o CI verde, e fixar as actions por SHA de commit.

## Monitoramento

| Sinal | Como observar | Alerta sugerido |
|---|---|---|
| Disponibilidade e banco | `GET /api/health` → `200 {"ok":true}` / `503` | monitor externo a cada 1–5 min |
| Erros do servidor | `app_events` (nível `error`), tela Admin → Registros, contador "Erros técnicos (24h)" no painel | > 10 erros/h |
| Webhooks de pagamento | Admin → Planos e assinaturas → "Eventos com falha/adiados"; eventos `deferred` que não saem desse estado | qualquer evento `deferred` com mais de 1 h |
| Uso de voz/TTS | `usage_counters` e custo no painel do provedor de voz | gasto diário acima do orçamento |
| Logs da plataforma | Cloudflare: Workers → Logs / `wrangler tail` | — |

Os registros não incluem senhas, tokens, áudio nem dados de cartão.

## Manutenção agendada

Execute `npm run db:maintenance` uma vez por dia com `DATABASE_URL` de produção. Opções:

- servidor/VM: `cron` (`17 4 * * * cd /app && npm run db:maintenance`);
- GitHub Actions agendado com `DATABASE_URL` em *secrets* do repositório (exige autorização do dono — não foi criado);
- Cloudflare: Cron Trigger em um Worker separado que chame a mesma rotina.

## Backups e recuperação

Use os backups automáticos do provedor do PostgreSQL (Supabase/Neon/RDS) com restauração ponto-a-ponto, e teste uma restauração antes do lançamento. Migrações são apenas aditivas e versionadas (`npm run db:migrate` recusa migrações já aplicadas que tenham sido editadas).

## Resposta a incidentes (resumo)

1. Credencial vazada: revogar/rotacionar no provedor, atualizar o secret (`wrangler secret put`), invalidar sessões se for o `AUTH_SECRET` (todas as sessões caem).
2. Webhooks falhando: o provedor reenvia; o processamento é idempotente. Corrigir a causa e reenviar pelo painel do provedor.
3. Abuso de cota de voz: reduzir limites em Admin → Planos e assinaturas → Limites por plano (efeito em até 30 s).
