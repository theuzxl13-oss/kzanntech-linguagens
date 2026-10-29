# Relatório final — KeyLingo como SaaS

Branch: `claude/quirky-johnson-r68juo` · commits desta missão: `653d1bc` (P0/P1), `bd7b71e` (P2), `39381ac` (P3), `44f56ad` (P4).
Detalhes técnicos de cada achado: [AUDIT.md](AUDIT.md).

## 1. Resumo executivo

O KeyLingo foi auditado e evoluído sobre o código existente, sem projeto paralelo e sem remover funcionalidades. Foram confirmadas e corrigidas 10 falhas de segurança, integridade, privacidade e operação, cada uma reproduzida antes da correção e coberta por teste de regressão. Foram adicionados planos (Grátis e Premium) com assinaturas seguras, mas **só com um provedor de pagamento simulado (sandbox)**, porque nenhum provedor real foi escolhido nem há credenciais. Também foram incluídos onboarding com objetivo e meta diária, procedência e revisão do conteúdo e um CI completo com permissões mínimas.

O produto **ainda não está pronto para cobrar de usuários reais**. Faltam: integração com um provedor real, revisão humana do conteúdo, revisão jurídica dos documentos, deploy e configuração de produção. Testes passando não provam que a aplicação está segura. Eles provam que os cenários testados se comportam como esperado.

## 2. Inventário

Next.js 16.4 (App Router) + React 19 + TypeScript + Tailwind 4; PostgreSQL via `pg` com migrações SQL versionadas (0001–0006); autenticação própria (scrypt, sessão em cookie httpOnly com hash HMAC); Zod; Vitest e Playwright; deploy previsto no Cloudflare Workers (OpenNext + Hyperdrive) ou em Node.js; demo estática no GitHub Pages. Inventário completo na seção 1 do AUDIT.md.

## 3. Vulnerabilidades confirmadas (todas corrigidas)

| ID | Gravidade | Problema |
|---|---|---|
| SEC-01 | Média | rate limit por IP burlável com `X-Forwarded-For` forjado |
| SEC-02 | Média | redirecionamento aberto após login (`/\evil.example`) |
| SEC-03 | Média | corpo de requisição sem limite (30 MB lidos) |
| SEC-04 | Média | parâmetros do scrypt abaixo da recomendação OWASP |
| INT-01 | Baixa/Média | XP de lições obtido sem estudar (450 XP em segundos) |
| PRIV-01 | Média (LGPD) | e-mails do titular retidos após a exclusão da conta |
| CFG-01 | Baixa | transporte de e-mail `log` aceito em produção |
| SEC-05 | Baixa | HSTS e COOP ausentes |
| DEP-01 | Alta (npm audit) / impacto real baixo | 7 vulnerabilidades em ferramentas de build/deploy |
| CI-01 | Baixa/Média | sem verificações no CI e permissões amplas no workflow |

Nenhum segredo real foi encontrado no histórico do git nem nos arquivos versionados.

## 4. Riscos não confirmados

R-01 sem MFA para administradores · R-04 CSP com `'unsafe-inline'` (sem nonce) · rate limit em janela fixa no banco · avaliação de pronúncia Azure nunca testada contra a API real · detecção de fraude avançada (bots, multicontas) inexistente · Workers free plan incompatível com o custo do scrypt. Lista completa (R-01 a R-10) na seção 4 do AUDIT.md.

## 5. Bugs corrigidos

BUG-01 (datas sempre no fuso de São Paulo), OPS-01 (sem rotina de limpeza), afirmação desatualizada na política de privacidade ("não coletamos dados de pagamento") e uma condição de corrida no helper E2E do onboarding. As correções de etapas anteriores (loop infinito de nova tentativa na lição, rejeição não tratada no Workers) já estavam no histórico.

## 6. Arquivos alterados (principais)

- **Segurança:** `client-ip.ts`, `safe-redirect.ts`, `body.ts`, `password.ts`, `rate-limit.ts`, `config.ts`, `http.ts`, `next.config.ts`, `accounts.ts`
- **Cobrança:** `src/lib/server/billing/*`, `entitlements.ts` (domínio e servidor), `api/billing/*`, `api/admin/billing/*`, `/planos`, `/planos/retorno`, `/assinatura/sandbox`, `/estatisticas`, `/admin/assinaturas`, `components/billing.tsx`
- **Aprendizado:** `lessons.ts` (domínio e servidor), `learning-path.tsx`, `lesson-player.tsx`, `/comecar`, `components/onboarding.tsx`, `dashboard.ts`, `painel`, `perfil`, `admin.ts`, `admin-client.tsx`
- **Operação:** `maintenance.ts`, `scripts/check-secrets.mjs`, `.github/workflows/ci.yml`, `demo-pages.yml`
- **Documentação:** `AUDIT.md`, `BILLING.md`, `OPERATIONS.md`, `PRIVACY.md`, este relatório, `README.md`, `.env.example`

## 7. Migrações

| Migração | Conteúdo | Observação |
|---|---|---|
| 0004_lesson_attempts | início de lição registrado no servidor | aditiva |
| 0005_billing | planos, checkouts, assinaturas, eventos de pagamento, faturas, contadores de uso; RLS | preços semeados são exemplos |
| 0006_onboarding_content_origin | objetivo/meta diária/onboarding; `content_items.origin`; restrição "aprovado exige revisor" | marca contas existentes como já onboardadas; rebaixa para "pendente" itens aprovados sem revisor |

Todas foram aplicadas nos bancos de desenvolvimento e E2E, e recriadas do zero pelos testes de integração e E2E.

## 8. Testes e resultados

| Suíte | Resultado (local, PostgreSQL 16) |
|---|---|
| ESLint | 0 erros, 3 avisos preexistentes |
| TypeScript | sem erros |
| Unitários (Vitest) | **80/80** |
| Integração (Vitest + PostgreSQL real) | **52/52** |
| E2E (Playwright, build de produção, desktop + celular) | **22/22** |
| `npm audit` | 0 vulnerabilidades |
| Varredura de segredos | limpa (e detecta um segredo plantado) |
| Build da demo | ok |

Não executados nesta etapa: E2E no runtime do Cloudflare (`wrangler dev`, que passou em etapa anterior antes de P2/P3), testes contra provedor de pagamento real, Azure Speech real e deploy real. O CI do GitHub foi disparado pelo último push; o resultado está na seção 15 e no próprio GitHub Actions.

## 9. Dependências atualizadas

`wrangler` 4.155.0, `@opennextjs/cloudflare` 1.20.14 e override `glob@^10.5.0` em `@node-minify/core` (de 7 vulnerabilidades para 0). Nenhuma dependência nova foi adicionada em P2–P4. A verificação de assinatura usa `node:crypto` e a varredura de segredos é um script próprio.

## 10. Recursos SaaS implementados

- Planos Grátis/Premium com limites configuráveis pelo admin (níveis de lição, cotas diárias de voz/TTS no servidor, estatísticas detalhadas, tolerância de pagamento).
- Checkout criado no servidor; Premium **só** depois de webhook autenticado (HMAC + janela anti-replay), idempotente, seguro sob concorrência e tolerante a eventos fora de ordem.
- Cancelamento ao fim do período, reativação, tolerância após falha de pagamento, histórico de cobranças, página de retorno que apenas consulta o status.
- Concessão/revogação manual de Premium com auditoria; painel de assinaturas e eventos de webhook.
- Exclusão de conta interrompe cobranças; exportação inclui assinaturas e faturas.
- Onboarding (objetivo + meta diária), meta do dia no painel, procedência e progresso editorial do conteúdo.
- Multi-tenancy avaliado e **não** implementado (sem demanda demonstrada; justificativa no AUDIT.md §6).

## 11. Recursos que dependem de credenciais ou decisão

| Recurso | Bloqueio |
|---|---|
| Pagamentos reais | escolher o provedor, credenciais, preços, impostos/nota fiscal, reembolso e arrependimento (ver BILLING.md) |
| Avaliação de pronúncia/TTS no servidor | chave Azure Speech (adaptador pronto, nunca testado ao vivo) |
| E-mail em produção | chave Resend ou SMTP |
| Deploy no Cloudflare | conta, Workers Paid, Hyperdrive e secrets |
| Manutenção agendada | escolher onde agendar com acesso ao banco de produção |
| Secret scanning/Dependabot/proteção de branch no GitHub | ação do dono do repositório |
| Conteúdo validado | professores ou falantes nativos |
| Política de privacidade e termos | revisão jurídica e dados do controlador |

## 12. Riscos residuais

Conteúdo inicial redigido com IA e não revisado; sem MFA para admin; CSP com `unsafe-inline`; antifraude limitado; a avaliação de voz no navegador é aproximada; a integração com o provedor real pode introduzir diferenças de mapeamento de eventos (precisa de testes no modo de teste do provedor); registros financeiros sem prazo de guarda definido; actions do GitHub fixadas por tag (não por SHA).

## 13. Configuração e execução

```bash
npm ci
cp .env.example .env.local          # DATABASE_URL, AUTH_SECRET (openssl rand -hex 32); BILLING_PROVIDER=sandbox para testar assinaturas
npm run db:setup                     # migrações + catálogo
npm run dev
npm run lint && npm run typecheck && npm run test:unit
npm run test:integration             # TEST_DATABASE_URL (padrão keylingo_test)
npm run build && npm run test:e2e    # E2E_DATABASE_URL (padrão keylingo_e2e)
npm run db:maintenance               # limpeza/retenção (agendar diariamente)
```

Deploy: docs/DEPLOY.md. Cobrança: docs/BILLING.md. Operação: docs/OPERATIONS.md.

## 14. Checklist de produção

- [ ] Provedor de pagamento real integrado e testado (aprovado, recusado, 3DS, renovação, falha, cancelamento, reembolso, reenvio de webhook)
- [ ] `BILLING_PROVIDER` real, `BILLING_WEBHOOK_SECRET` como secret, **sem** `ALLOW_SANDBOX_BILLING_IN_PRODUCTION`/`ALLOW_LOG_EMAIL_IN_PRODUCTION`
- [ ] `AUTH_SECRET` forte, `APP_URL` em https, `TRUST_PROXY` correto (`cloudflare` no Workers)
- [ ] E-mail transacional configurado e testado (verificação e recuperação)
- [ ] Banco gerenciado com backups e restauração testada; `npm run db:migrate` no deploy
- [ ] Manutenção diária agendada; monitor externo em `/api/health`; alertas de erros e de webhooks adiados
- [ ] Conteúdo revisado por professores/nativos (ao menos A1–A2) antes de vender
- [ ] Política de privacidade e termos revisados juridicamente, com controlador e encarregado
- [ ] Secret scanning + push protection, Dependabot e proteção de branch exigindo o CI verde
- [ ] MFA para administradores (recomendado antes do lançamento)
- [ ] Workers Paid (scrypt excede o limite de CPU do plano gratuito)
- [ ] Teste de carga leve e verificação de custos de voz/TTS

## 15. Próximas ações recomendadas

1. Decidir o provedor de pagamento e as regras comerciais; implementar o adaptador seguindo BILLING.md.
2. Iniciar a revisão editorial do catálogo A1–A2 com professores, usando o painel de progresso editorial.
3. Ativar as proteções do GitHub e acompanhar a primeira execução do CI (`ci.yml`, execução nº 1, disparada no push `44f56ad`).
4. Adicionar MFA (TOTP) para administradores e CSP com nonce.
5. Fazer o deploy em um ambiente de staging no Cloudflare e rodar o E2E contra ele (`E2E_BASE_URL`).
