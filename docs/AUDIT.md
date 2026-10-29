# Auditoria técnica e de segurança — KeyLingo

Data: 2026-10-29 · Branch: `claude/quirky-johnson-r68juo` (commit base `1c5a87c`) · Referências: OWASP Top 10 (2021) e OWASP ASVS 4.0.

> Este documento registra **o que foi verificado e como**. Passar nos testes não significa que a aplicação está "segura": segurança exige revisão contínua. Nada aqui é parecer jurídico.

## 1. Inventário (verificado nos arquivos)

| Item | Estado encontrado |
|---|---|
| Framework | Next.js 16.4.3 (App Router, `proxy.ts`), React 19.3, TypeScript 5, Tailwind 4.3 |
| Banco | PostgreSQL (`pg` 8.23), migrações SQL em `db/migrations` (0001 init, 0002 e-mail Resend, 0003 trilha) com checksum |
| Auth | Própria: scrypt (`src/lib/server/password.ts`), sessões em cookie httpOnly com token aleatório guardado como HMAC (`session-store.ts`), recuperação/verificação de e-mail por token de uso único |
| Autorização | `requireUser`/`requireAdmin` (páginas) e `apiUser`/`apiAdmin` (API); `proxy.ts` só redireciona de forma otimista |
| Proteções de API | Wrapper `route()` (`http.ts`): verificação de `Origin` (CSRF), Zod, erros genéricos + log; rate limit em banco (`rate-limit.ts`) |
| Jogo | Sessões autoritativas no servidor (`game/sessions.ts`, `game/finish.ts`), idempotência por `unique(session_id, idx, attempt_no)` e `FOR UPDATE` |
| Trilha | `lessons.ts` (servidor) e `domain/lessons.ts` |
| Voz | Azure AI Speech (`speech/azure.ts`), mock só em `NODE_ENV=test`, fallback Web Speech no navegador |
| E-mail | SMTP (nodemailer), Resend (HTTP), `log` (dev) |
| Deploy | Node.js tradicional ou Cloudflare Workers (OpenNext 1.20.13, wrangler 4.152, Hyperdrive) |
| Demo | `demo/` → GitHub Pages (`.github/workflows/demo-pages.yml`) |
| Testes | Vitest (unit + integração com Postgres real), Playwright (E2E contra `next start`) |
| Rotas | 37 rotas de API; 16 administrativas, todas com `apiAdmin()`; todas as mutações passam por `route()` (verificado por script) |

## 2. Verificações executadas (linha de base, antes das correções)

| Verificação | Resultado |
|---|---|
| `npm ci` | ✅ instalação reproduzível |
| ESLint | ✅ 0 erros, 3 avisos (navegação com `window.location` intencional no logout) |
| `tsc --noEmit` | ✅ |
| Unitários | ✅ 52/52 |
| Integração (Postgres 16, banco descartável) | ✅ 32/32 |
| Build de produção | ✅ |
| E2E (Chromium desktop + Pixel 7) | ✅ 15/15 |
| `npm audit` | ⚠️ 7 vulnerabilidades (5 altas, 2 moderadas) — ver DEP-01 |
| Segredos versionados | ✅ nenhum arquivo de segredo rastreado; varredura do histórico (`git log -p`) por padrões de chaves/URLs sem achados |
| SQL dinâmico | ✅ interpolações são constantes ou nomes de coluna de mapa fixo; valores sempre parametrizados |
| HTML cru (`dangerouslySetInnerHTML`) | ✅ nenhum uso |
| Cobertura de autorização das rotas | ✅ (script: rotas mutáveis sem `route()`, admin sem `apiAdmin()`, privadas sem `apiUser()`, páginas admin sem `requireAdmin` → nenhuma) |
| Finalização concorrente (8 chamadas simultâneas) | ✅ 1 único lançamento de XP, resultados idênticos |
| Erros/avisos de hidratação no console (12 páginas, fuso Ásia/Tóquio) | ✅ nenhum |

## 3. Problemas confirmados

Gravidade considerando impacto e explorabilidade no contexto atual (aplicação ainda não lançada).

### SEC-01 — Rate limit por IP burlável com `X-Forwarded-For` · **Média**
- **Arquivo:** `src/lib/server/auth.ts` (`requestMeta`) — usa o **primeiro** valor de `X-Forwarded-For`, que o cliente controla.
- **Evidência:** 12 cadastros com `X-Forwarded-For` variando → 12×`201`; controle sem o cabeçalho → `429` a partir do 11º.
- **Impacto:** anula os limites por IP de cadastro, login, recuperação e redefinição (criação massiva de contas, força bruta distribuída). O limite por e-mail no login continua valendo.
- **Correção:** resolver o IP do cliente conforme a infraestrutura confiável (`TRUST_PROXY`: `cloudflare` usa `CF-Connecting-IP`; `xff` usa o valor mais à direita, adicionado pelo proxy; `none` ignora cabeçalhos).
- **Regressão:** teste unitário da resolução de IP + teste E2E repetindo a sondagem.

### SEC-02 — Redirecionamento aberto após login · **Média**
- **Arquivo:** `src/components/auth-forms.tsx` (`safeNext`).
- **Evidência:** `/entrar?next=%2F%5Cevil.example%2Froubar` → após login real o navegador foi para `http://evil.example/roubar` (Chromium). `//` e `https://` já eram bloqueados.
- **Impacto:** phishing convincente logo após um login legítimo (OWASP A01).
- **Correção:** validar o destino resolvendo-o como URL e exigindo mesma origem; rejeitar `\`, caracteres de controle e esquemas.
- **Regressão:** teste unitário com vetores conhecidos + E2E.

### SEC-03 — Corpo de requisição sem limite · **Média**
- **Arquivo:** `src/lib/server/http.ts` (`parseJson` usa `req.json()`), rota de voz depende de `Content-Length`.
- **Evidência:** POST de 30 MB em `/api/auth/login` foi lido por completo (`400` após o upload inteiro; nenhum `413`).
- **Impacto:** consumo de memória e banda por requisições não autenticadas (DoS).
- **Correção:** leitura do corpo em streaming com limite (64 KB para JSON; 2 MB para áudio) e resposta `413`.
- **Regressão:** teste unitário do leitor limitado + E2E.

### SEC-04 — Parâmetros do scrypt abaixo da recomendação OWASP · **Média**
- **Arquivo:** `src/lib/server/password.ts` (N=2¹⁴, r=8, p=1).
- **Evidência:** OWASP Password Storage Cheat Sheet recomenda N=2¹⁷/r=8/p=1 ou configurações equivalentes (ex.: N=2¹⁴, r=8, **p=5**).
- **Correção:** novos hashes com N=2¹⁴, r=8, p=5 (16 MiB de memória — compatível com o limite de 128 MB do Workers) e **rehash transparente no login** de hashes antigos (o hash guarda os parâmetros).
- **Regressão:** teste de que login com hash antigo funciona e atualiza o hash.

### INT-01 — XP de lições obtido sem estudar · **Baixa/Média**
- **Arquivo:** `src/lib/server/lessons.ts`.
- **Evidência:** conta nova declarou nível C1 e chamou `POST /api/lessons/:id/complete` para as 18 lições → **450 XP imediatos** (nível 3) sem abrir nenhuma lição; repetível com +5 XP/lição/dia.
- **Impacto:** distorce XP, nível, metas e conquistas. **Não** afeta rankings (que usam apenas sessões competitivas calculadas no servidor).
- **Correção:** o servidor registra o início da lição ao entregá-la; a conclusão exige início prévio e tempo mínimo proporcional ao tamanho da lição; teto diário de XP de lições.
- **Regressão:** testes de integração.

### PRIV-01 — Dados pessoais retidos após exclusão de conta · **Média (LGPD)**
- **Arquivos:** `accounts.ts` (`deleteAccount`), `email.ts`, `rate-limit.ts`.
- **Evidência:** após `DELETE /api/account`, `email_outbox` manteve 1 linha com o e-mail do titular. Chaves de rate limit de login guardam o e-mail em texto (`login:email:…`).
- **Correção:** apagar registros de e-mail do titular na exclusão; usar HMAC do e-mail nas chaves de rate limit; rotina de retenção.
- **Regressão:** teste de integração da exclusão.

### CFG-01 — Transporte de e-mail `log` aceito em produção · **Baixa**
- **Arquivo:** `src/lib/server/config.ts`. Com `EMAIL_TRANSPORT=log` em produção, links de redefinição de senha (tokens) iriam para os logs e para `email_outbox.body_text`.
- **Correção:** em produção, `log` é tratado como `disabled` e gera alerta.

### SEC-05 — Cabeçalhos HSTS e COOP ausentes · **Baixa**
- **Evidência:** `curl -I` sem `Strict-Transport-Security` e `Cross-Origin-Opener-Policy`.
- **Correção:** adicionar em produção.

### BUG-01 — Datas exibidas sempre no fuso de São Paulo · **Baixa**
- **Arquivo:** `src/components/ui.tsx` (`formatDate`) ignora o fuso do perfil (histórico, conquistas, admin).
- **Correção:** aceitar o fuso como parâmetro e usar o do usuário.

### OPS-01 — Sem rotina de limpeza · **Baixa**
- Tokens expirados, sessões vencidas, `rate_limits`, `app_events` e `email_outbox` só são limpos de forma oportunista (rate limit) ou nunca.
- **Correção:** script de manutenção (`npm run db:maintenance`) com política de retenção documentada.

### CI-01 — Pipeline sem verificações e com permissões amplas · **Baixa/Média**
- `demo-pages.yml` concede `pages: write` e `id-token: write` também ao job de build; actions referenciadas por tag (não por SHA); não há workflow de CI rodando lint/testes/auditoria.
- **Correção:** permissões por job, workflow de CI com lint, typecheck, testes, build, E2E, auditoria e varredura de segredos.

### DEP-01 — Vulnerabilidades em dependências de build/deploy · **Alta (npm audit) / impacto real baixo**
- `undici` < 7.30.1 (via `wrangler`/`miniflare`), `glob` CLI (via `@opennextjs/aws`). São ferramentas de desenvolvimento e empacotamento; não rodam no caminho das requisições da aplicação. `glob` só é explorável usando a CLI com `-c`.
- **Correção:** atualizar `wrangler`; avaliar `@opennextjs/cloudflare` (o "fix" sugerido pelo npm é um *downgrade*, não aplicado sem análise).

### CONT-01 — Conteúdo pedagógico insuficiente e não revisado · **Média (produto)**
- 355 itens, **0 aprovados** (todos pendentes de revisão — correto, pois foram gerados com apoio de IA); 0 áudios gravados; 0 frases de exemplo; 346 sem explicação.
- 8 de 18 lições por idioma têm menos de 3 itens; distribuição desequilibrada (en: A1 43, A2 19, B1 7, B2 2).
- Nenhuma duplicata de tradução encontrada. **Não** classifiquei traduções como incorretas sem revisão de falante nativo.
- **Correção:** fluxo editorial com revisor qualificado e evidência de aprovação; ampliação de conteúdo antes do lançamento.

## 4. Riscos potenciais (não confirmados ou dependentes de decisão)

| ID | Risco | Situação |
|---|---|---|
| R-01 | Administradores sem segundo fator (MFA) | Recomendo TOTP para admins antes do lançamento (decisão de produto) |
| R-02 | Enumeração de e-mail no cadastro (`409 email_taken`) | Inerente ao fluxo; mitigado por rate limit. Alternativa: confirmar por e-mail sem revelar |
| R-03 | Bloqueio de login de terceiros por tentativas (8/15 min por e-mail) | Compromisso conhecido entre força bruta e DoS |
| R-04 | `'unsafe-inline'` em `script-src` | Exige CSP com nonce; avaliar impacto em todas as páginas |
| R-05 | URLs de áudio cadastradas por admin são buscadas pelo servidor (SSRF limitado a admin) | Restringir a caminhos locais ou domínios permitidos |
| R-06 | Sessão sem tempo máximo absoluto (renovação deslizante de 30 dias) | Definir política |
| R-07 | Integração Azure nunca testada contra a API real | Testar em sandbox com chave antes de lançar |
| R-08 | Plano gratuito do Cloudflare Workers (10 ms CPU) incompatível com scrypt | Usar Workers Paid |
| R-09 | Troca de fuso horário permitiria reivindicar desafios de outra data uma vez | Impacto baixo |
| R-10 | Custo da voz no servidor sem cota diária por usuário (há limite por minuto) | Implementar cota por plano (P2) |

## 5. Correções aplicadas — P0/P1

| ID | Status | O que mudou | Regressão |
|---|---|---|---|
| SEC-01 | ✅ corrigido | `client-ip.ts`: IP vem só do cabeçalho do proxy confiável (`TRUST_PROXY=cloudflare\|xff\|none`); `xff` usa o valor mais à direita. `wrangler.jsonc` define `cloudflare`. Alerta no painel admin se `none` em produção | unit `security.test.ts`; E2E "X-Forwarded-For forjado não burla o limite" |
| SEC-02 | ✅ corrigido | `safe-redirect.ts` resolve o destino como URL e exige mesma origem; recusa `\`, controles e esquemas | unit (7 vetores); E2E "login não redireciona para fora" |
| SEC-03 | ✅ corrigido | `body.ts`: leitura em streaming com limite (JSON 64 KiB; áudio ~2 MiB) → `413` | unit (com e sem Content-Length); E2E 413 |
| SEC-04 | ✅ corrigido | scrypt N=2¹⁴, r=8, **p=5**; rehash transparente no login | unit + integração (hash legado → atualizado) |
| INT-01 | ✅ corrigido | `lesson_attempts` (migração 0004): início registrado pela API, tempo mínimo (~2 s/exercício, piso 10 s) e teto de 150 XP de lições por 24 h. Reproduzindo a sondagem: 450 XP → 150 XP, e somente após o tempo mínimo | integração INT-01; E2E da lição |
| PRIV-01 | ✅ corrigido | exclusão de conta apaga `email_outbox` do titular; chaves de rate limit gravadas como HMAC | integração `privacy-auth.test.ts` |
| CFG-01 | ✅ corrigido | `EMAIL_TRANSPORT=log` vira `disabled` em produção (exceção explícita `ALLOW_LOG_EMAIL_IN_PRODUCTION=true` só para E2E) | E2E de recuperação de senha |
| SEC-05 | ✅ corrigido | HSTS (produção) e COOP `same-origin` | E2E de cabeçalhos; verificado também no runtime `workerd` |
| BUG-01 | ✅ corrigido | `formatDate` aceita o fuso; histórico, conquistas e rankings usam o fuso do perfil | — (visual) |
| OPS-01 | ✅ corrigido | `src/lib/server/maintenance.ts` + `npm run db:maintenance` (retenção documentada) | executado no banco de desenvolvimento |
| R-05 | ✅ mitigado | servidor só busca áudio em `/audio/...` ou hosts de `AUDIO_ALLOWED_HOSTS`, sem seguir redirecionamentos | unit |
| DEP-01 | ✅ corrigido | `wrangler` 4.155.0, `@opennextjs/cloudflare` 1.20.14, override `glob@^10.5.0` em `@node-minify/core` → `npm audit`: **0 vulnerabilidades**. Build OpenNext e preview `workerd` verificados | `npm audit`, `cf:build`, `wrangler dev` |
| CI-01 | ⏳ P4 | — | — |
| CONT-01 | ⏳ P3 (exige revisores humanos) | — | — |

## 6. P2 — Planos, assinaturas e controle de acesso

Implementado com provedor **sandbox** apenas (detalhes e regras em [BILLING.md](BILLING.md)).

| Requisito | Como foi atendido | Verificação |
|---|---|---|
| Assinatura só por pagamento confirmado no servidor | checkout criado no servidor; Premium só após webhook `checkout.completed` autenticado | integração "criar checkout ou voltar da página de pagamento não concede nada"; E2E (retorno sem pagar continua Grátis) |
| Webhook autenticado, sem replay | HMAC-SHA256 do corpo bruto + janela de 5 min, comparação em tempo constante | unit (6 casos); integração; E2E (forjado/antigo/provedor desconhecido → 400) |
| Idempotência e concorrência | `unique (provider, event_id)`; advisory lock por assinatura | integração: 6 entregas paralelas → 1 processada, 5 duplicadas |
| Eventos fora de ordem | `last_event_at` + eventos `deferred` reaplicados | integração "eventos fora de ordem" |
| Falha de pagamento, tolerância, renovação, cancelamento | estados `past_due`/`canceled`, acesso até o fim do período | integração (2 testes) e E2E |
| Controle de acesso centralizado | `getEntitlements()`; lições acima do nível do plano → `402 plan_required`; cotas diárias atômicas de voz/TTS → `429 plan_limit`; estatísticas detalhadas | integração (cota sob concorrência: 10 pedidos, limite 3 → 3 aceitos) |
| Sem dados de cartão | só IDs do provedor, status e valores | revisão do esquema |
| Concessão manual auditada | `/admin/assinaturas` + `audit_logs` | integração |
| Sandbox nunca em produção | `getPaymentProvider()` exige flag explícita de teste | unit |

Multi-tenancy (escolas/empresas com várias contas): **não implementado de propósito**. Não há demanda demonstrada; o modelo atual (assinatura individual) não impede adicionar depois uma tabela `organizations` com assentos. Recomendação: decidir após validar o produto com usuários individuais.

Pendente (exige decisão/credenciais): provedor real, preços finais, impostos, reembolso e política de arrependimento — ver BILLING.md.
