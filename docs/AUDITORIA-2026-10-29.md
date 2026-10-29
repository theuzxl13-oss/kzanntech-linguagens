# Auditoria completa do KeyLingo — 2026-10-29

Commit de partida: `01b79be` (árvore limpa, sincronizada com o remoto; nenhuma alteração local do desenvolvedor a preservar). Ambiente: local, PostgreSQL 16, build de produção (`next start`), bancos de teste com dados fictícios. Nenhum serviço externo, banco remoto ou produção foi acessado.

## A. Resumo executivo

O núcleo do produto está sólido nos pontos de maior risco. Autenticação, autorização, isolamento entre usuários, CSRF, idempotência de recompensas, webhooks de cobrança e consistência do XP foram verificados com provas reais contra o build de produção, e **não há falha crítica nem alta conhecida**.

A auditoria encontrou e corrigiu **6 problemas confirmados**:
- **Layout:** a navegação quebrava em tablets e três telas transbordavam no celular estreito.
- **Privacidade:** perfis ocultos e contas suspensas apareciam no placar de temporadas encerradas.
- **Regra de jogo:** o bônus da meta semanal só valia para sessões de jogo.
- **Integração de voz:** uma resposta inválida do provedor virava erro interno.
- **Upload:** o tipo do áudio enviado era aceito sem conferir o conteúdo.

Principais riscos restantes, que dependem de terceiros ou de decisão de produto:
- integrações reais (Azure, e-mail, pagamento) nunca validadas com credenciais;
- conteúdo pedagógico ainda sem revisão humana;
- falta de auditoria automatizada de contraste e de teste com leitor de tela.

## B. Tabela de problemas

| ID | Gravidade | Categoria | Arquivo / local | Evidência | Como reproduzir | Impacto | Correção | Teste de validação | Resultado |
|---|---|---|---|---|---|---|---|---|---|
| AUD-01a | **Média** | UI / responsividade | `src/components/app-nav.tsx` (`md:flex`), `src/app/(app)/layout.tsx` | varredura em 768 px: rolagem horizontal de **212 px** em todas as 14 páginas logadas; o menu do usuário ficava fora da tela (sobrava de 768 a ~1000 px) | abrir qualquer página logada com 768–1000 px de largura | em tablets, o menu da conta (perfil, sair) ficava inacessível sem rolar de lado | navegação completa só a partir de `lg` (1024 px); abaixo disso, barra inferior | `tests/e2e/responsive.spec.ts` (320/375/768/900/1024 px × 9 páginas) | ✅ corrigido |
| AUD-01b | Baixa | UI / responsividade | `src/components/session-setup.tsx` (grade "Atividades por tema") | **37 px** de rolagem em 375 px e **92 px** em 320 px | `/jogar/digitar` num celular estreito | cartões e botões "Praticar" cortados | `grid-cols-1` (`minmax(0,1fr)`) | mesmo E2E | ✅ |
| AUD-01c | Baixa | UI / responsividade | `src/components/learning-path.tsx` (grade de lições) | **14 px** em 320 px | `/aprender` em 320 px | cartões de lição cortados | `grid-cols-1` | mesmo E2E | ✅ |
| AUD-01d | Baixa | UI / responsividade | `src/components/profile-forms.tsx` | **56 px** em 320 px; o e-mail longo, sem quebra de linha, empurrava todos os cartões, inclusive "Excluir conta" | `/perfil` em 320 px | formulários do perfil cortados | `grid-cols-1`, `min-w-0` e `break-all` no e-mail | mesmo E2E | ✅ |
| AUD-02 | **Média** | Privacidade (LGPD) | `src/lib/server/rankings.ts` (`frozenRanking`) | teste: usuário com `show_in_rankings = false` (e conta suspensa) aparece no placar de temporada encerrada; o ranking ao vivo filtra os dois | ocultar o perfil (ou ser suspenso) depois do fim da temporada e abrir *Rankings → temporadas encerradas* | a preferência "não aparecer nos rankings" era desrespeitada em uma tela pública | lista pública filtra pela escolha **atual** e pelo status ativo; posições congeladas mantidas; o próprio usuário continua vendo a sua linha | `tests/integration/audit-regressions.test.ts` (AUD-02) | ✅ |
| AUD-03 | Média | Regra de jogo | `src/lib/server/game/finish.ts`; `lessons.ts` e `missions.ts` não verificavam a meta | `grep "'weekly_goal'"`: único ponto de concessão era o fim de sessão de jogo; o teste falhou antes da correção | definir meta de 50 XP e fazer 2 lições (50 XP) | quem estudava só com lições e missões nunca recebia o bônus prometido | regra centralizada em `awardWeeklyGoalIfReached` (`study.ts`), usada por sessões, lições e missões; idempotente por semana; o bônus aparece no fim da lição e da missão | teste AUD-03 (inclui "XP total = soma do histórico") | ✅ |
| AUD-04 | Baixa | Integração (voz) | `src/lib/server/speech/azure.ts` | teste: HTTP 200 com corpo HTML gera `SyntaxError` em vez de `SpeechProviderError` | provedor/proxy devolvendo página de erro com status 200 | o aluno recebia "erro inesperado" (500) em vez de "tente novamente em instantes", e o erro não era classificado como falha do provedor | corpo inválido vira `SpeechProviderError` | `tests/unit/azure-provider.test.ts` (corpo inválido + timeout) | ✅ |
| AUD-05 | Baixa | Validação de upload | `src/app/api/sessions/[id]/speak/route.ts` | o servidor só conferia `file.type`, declarado pelo cliente | enviar qualquer arquivo rotulado `audio/wav` | arquivos arbitrários repassados ao provedor pago, consumindo cota (sem efeito hoje: não há provedor configurado) | conferência da assinatura `RIFF…WAVE` (compatível com o gravador do app, que escreve esse cabeçalho) | `tests/unit/security.test.ts` (AUD-05) | ✅ |
| AUD-06 | Baixa | Privacidade | `src/lib/server/accounts.ts:90` | cadastro responde "Este e-mail já está cadastrado" | cadastrar um e-mail existente | permite descobrir se um e-mail tem conta (mitigado por limite de 10 cadastros/h por IP) | **recomendado**, decisão de produto: mensagem genérica + e-mail ao titular | — | ⏳ documentado |
| AUD-07 | Baixa | Regra de jogo | `profiles.weekly_goal_xp` (mín. 50) | meta mínima de 50 XP rende +50 XP de bônus por semana | definir meta 50 | XP pessoal um pouco inflado; não afeta rankings (que usam pontos competitivos) | **recomendado**: bônus proporcional à meta ou meta mínima maior (decisão de game design) | — | ⏳ documentado |
| AUD-08 | Baixa/Média | Antifraude | voz no modo navegador (`submitVoiceAttempt`, transcrição enviada pelo cliente) | a transcrição vem do navegador e não é verificável | enviar transcrição igual ao texto esperado | XP e conquistas pessoais podem ser inflados; **não** entra no ranking (bloqueado por padrão) | já mitigado no ranking; **recomendado**: limitar XP de sessões não verificadas | — | ⏳ documentado |
| AUD-09 | Baixa | Custos / justiça | `consumeQuota` antes da chamada ao provedor | falha do provedor também consome cota | — | o aluno perde 1 unidade da cota numa falha | **recomendado**: estornar em falha transitória (o provedor pode cobrar mesmo assim; decisão de custo) | — | ⏳ documentado |
| AUD-10 | Baixa | Persistência | `lesson-player.tsx` (estado no navegador) | recarregar no meio da lição recomeça a lição | recarregar durante uma lição | perda de 1–3 min de progresso; nada é registrado indevidamente. Sessões de jogo e missões retomam do servidor | **recomendado**: salvar a posição (baixa prioridade) | — | ⏳ documentado |
| AUD-11 | Baixa | Datas | `startOfIsoWeekUtc` (meta semanal) | a semana vira à 0h UTC de segunda (21h de domingo em São Paulo) | — | XP do domingo à noite conta na semana seguinte | **recomendado**: semana no fuso do perfil | — | ⏳ documentado |

### Hipóteses investigadas e descartadas (com prova)

| Hipótese | Prova | Resultado |
|---|---|---|
| Páginas de admin protegidas só pelo layout (alerta da documentação do Next 16 sobre renderização parcial) | as 9 páginas de admin e todas as da área logada chamam `requireAdmin`/`requireUser`; requisição RSC simulando navegação parcial como usuário comum → **307**, sem e-mails no corpo | não vulnerável |
| Injeção de SQL | todas as consultas com `${}` interpolam só constantes internas; o restante usa parâmetros | não vulnerável |
| XSS | nenhum `dangerouslySetInnerHTML`/`innerHTML`; apelidos e avatares validados por regex/enum | não encontrado |
| Rotas de API sem autenticação | só `auth/*`, `health` e o webhook (autenticado por HMAC) | conforme esperado |
| Isolamento e manipulação (24 provas contra o build de produção) | missões, cobrança, onboarding e lições: tentativa de outro usuário, pular etapa/tentativa, texto gigante, JSON inválido, origem estrangeira, 8 envios simultâneos, checkout com preço do cliente, aprovação de checkout alheio, concessão de Premium por não admin, limites inválidos | todas bloqueadas (404/409/400/403) |
| Inconsistência de XP/nível | banco E2E (47 usuários de todos os fluxos): `xp_total` = soma de `xp_events` e nível = fórmula, em 100% | consistente |
| Usuário suspenso continua usando a sessão | suspensão apaga as sessões; `requireUser`/`apiUser` recusam suspensos; login recusado | não vulnerável |
| Acessibilidade básica (18 telas) | botões/links sem nome, campos sem rótulo, imagens sem `alt`, `lang`, um `h1` por página, saltos de título, IDs duplicados | nenhum problema |

## C. Alterações realizadas

| Arquivo | Motivo | Comportamento corrigido |
|---|---|---|
| `src/components/app-nav.tsx`, `src/app/(app)/layout.tsx`, `demo/app.tsx` | AUD-01a | navegação completa a partir de 1024 px; barra inferior abaixo disso |
| `src/components/session-setup.tsx`, `src/components/learning-path.tsx`, `src/components/profile-forms.tsx` | AUD-01b/c/d | grades com `grid-cols-1`; e-mail com quebra de linha |
| `src/lib/server/rankings.ts` | AUD-02 | lista de temporada encerrada respeita privacidade e suspensão |
| `src/lib/server/study.ts` (novo helper), `game/finish.ts`, `lessons.ts`, `missions.ts`, `lesson-player.tsx`, `missions.tsx` | AUD-03 | meta semanal vale para qualquer atividade e aparece na tela de conclusão |
| `src/lib/server/speech/azure.ts` | AUD-04 | resposta inválida → erro do provedor com mensagem amigável |
| `src/lib/server/body.ts`, `src/app/api/sessions/[id]/speak/route.ts` | AUD-05 | áudio validado pelo conteúdo |
| `tests/e2e/responsive.spec.ts`, `tests/integration/audit-regressions.test.ts`, `tests/unit/azure-provider.test.ts`, `tests/unit/security.test.ts` | regressão | — |

Diff revisado integralmente. A refatoração da meta semanal preserva a ordem de gravação na sessão de jogo, roda sob o mesmo lock de usuário e mantém a unicidade por semana; os testes de ranking, sessões, lições e missões existentes continuam verdes.

## D. Testes executados

| Comando | Resultado |
|---|---|
| `npx eslint .` | 0 erros, 3 avisos (preexistentes, `window.location` em logout/perfil) |
| `npx tsc --noEmit` | sem erros |
| `npx vitest run tests/unit` | **98/98** (antes: 94) |
| `VITEST_SUITE=integration npx vitest run` | **64/64** (antes: 62) |
| `npm run build` | ok |
| `npx playwright test` | **25/25** (antes: 24) |
| `npm run demo:build` | ok |
| `npm audit` | 0 vulnerabilidades |
| `node scripts/check-secrets.mjs` | nenhum segredo |
| Provas manuais contra o build de produção (scripts no rascunho da sessão, não versionados) | 24 provas de autorização/manipulação aprovadas; varredura de 3 larguras × 18 páginas (erros de console, HTTP 5xx, rolagem); checagens de acessibilidade em 18 telas; consistência de XP/nível no banco |

Os testes novos falharam antes das correções (AUD-02, AUD-03, AUD-04, AUD-01) e passaram depois.

**Não executados:**
- auditoria automática de contraste (axe, que exigiria nova dependência);
- leitor de tela real;
- teste de carga;
- E2E no runtime do Cloudflare (`wrangler dev`) nesta rodada;
- Azure, Resend e pagamento reais (sem credenciais);
- navegadores além do Chromium (Firefox e Safari).

## E. Pendências

- **Credenciais:** validar Azure Speech, e-mail transacional e um provedor de pagamento real.
- **Decisões de produto:** AUD-06 (enumeração de e-mail), AUD-07 (bônus semanal), AUD-08 (XP de voz não verificada), AUD-09 (estorno de cota), AUD-11 (semana no fuso do usuário).
- **Validação manual:** contraste, leitor de tela, Safari/iOS e Firefox.
- **Conteúdo:** revisão humana do catálogo e das missões.

## F. Próximos passos (priorizados)

1. Ativar no GitHub o secret scanning, o Dependabot e a proteção de branch exigindo o CI.
2. Decidir AUD-06 e AUD-08 (privacidade e antifraude) e implementar.
3. Validar as integrações com credenciais de teste (Azure, e-mail, pagamento em modo teste).
4. Adicionar auditoria de acessibilidade automatizada ao CI (axe) e testar com leitor de tela.
5. Rodar o E2E também em Firefox/WebKit e no runtime do Cloudflare.
6. AUD-10 e AUD-11 (retomada de lição e semana no fuso do usuário).

## G. Estado final

**Validado parcialmente.** Não há falhas críticas nem altas conhecidas. As verificações automatizadas executadas passaram, no escopo de: Chromium (desktop e celular emulado), build Node.js de produção, PostgreSQL 16 local e provedores simulados ou ausentes (voz e pagamento sandbox). Ficam pendentes os itens de baixa gravidade documentados (AUD-06 a AUD-11) e as validações que dependem de credenciais, outros navegadores e avaliação manual de acessibilidade.
