# KeyLingo RPG — Etapa 1: diagnóstico técnico

Data: 2026-10-29 · commit de partida `45d4f69` (árvore limpa, sem alterações locais do desenvolvedor).

## Legenda de estado

- **I+T**: implementado e coberto por teste automatizado executado nesta sessão (unitário, integração com PostgreSQL real ou E2E com build de produção).
- **I**: implementado, verificado só por leitura de código ou uso manual.
- **P**: parcialmente implementado.
- **D**: documentado, mas não validado (depende de serviço externo).
- **A**: ausente.
- **NV**: não verificável neste ambiente.

Suítes executadas antes desta etapa: 80 unitários, 52 de integração e 22 E2E, todos passando; CI do GitHub verde em lint/tipos/unitários/auditoria/segredos/CodeQL/integração/build na execução nº 1. Esse é o único resultado de CI citado aqui.

## Fontes públicas sobre o Duolingo (consultadas em 2026-10-29)

| Afirmação | Fonte | Confiabilidade |
|---|---|---|
| Max inclui Video Call (conversa com personagem de IA) e Roleplay (cenários do cotidiano com feedback de precisão e complexidade); disponibilidade varia por curso | [blog.duolingo.com/duolingo-max](https://blog.duolingo.com/duolingo-max) (post de lançamento, anterior a 2026) e [storylearning.com/duolingo-max-review](https://storylearning.com/duolingo-max-review) | oficial, mas antigo; o restante é secundário |
| "Explain My Answer" teria passado a ser gratuito em vários cursos em jan/2026 | [dev.to (aitoolspot)](https://dev.to/incubadora_6c1fc80706dda7/duolingo-max-gpt-4-worth-paying-for-in-2026-2o71), [beginnersinai.org](https://beginnersinai.org/duolingo-max-explained/) | secundária, **não confirmada** em fonte oficial |
| Super remove anúncios, dá corações/energia ilimitados e prática personalizada com base em erros | [newsletter.duoplanet.com](https://newsletter.duoplanet.com/posts/duolingo-unlimited-hearts), [Duolingo Wiki (Energy)](https://duolingo.fandom.com/wiki/Energy) | secundária, **não confirmada** |
| Practice Hub: revisão personalizada a partir da atividade recente; parte exclusiva do Super | [blog.duolingo.com/guide-to-duolingo-practice-hub](https://blog.duolingo.com/guide-to-duolingo-practice-hub/) | oficial (descreve o comportamento pretendido) |
| Revisão espaçada e o modelo "Birdbrain" (estimativa de acerto por exercício, desde 2020) | [blog.duolingo.com/spaced-repetition-for-learning](https://blog.duolingo.com/spaced-repetition-for-learning), [IEEE Spectrum](https://spectrum.ieee.org/duolingo), [VentureBeat](https://venturebeat.com/ai/how-duolingo-uses-ai-in-every-part-of-its-app) | oficial + imprensa |

Não presumo que um recurso exista em todos os cursos ou planos: as próprias fontes divergem por idioma e por plataforma. A comparação abaixo descreve **categorias de funcionalidade**, não telas, textos ou identidade visual.

## Matriz

| Funcionalidade | Evidência no código | Estado | Comportamento real | Equivalente no Duolingo | Diferença relevante | Impacto | Prior. | Esforço | Critério de aceitação | Dependências / riscos |
|---|---|---|---|---|---|---|---|---|---|---|
| Cadastro, login, recuperação, verificação de e-mail, perfil | `server/accounts.ts`, `api/auth/*`, `tests/integration/auth.test.ts`, `privacy-auth.test.ts`, `e2e/auth.spec.ts` | I+T | scrypt + rehash, sessão httpOnly com HMAC, rate limit por IP confiável, CSRF por Origin | conta com login social | sem login social nem MFA | médio | baixa | M | — | e-mail exige Resend/SMTP em produção |
| Onboarding (idioma, nível, objetivo, meta diária) | `language-picker.tsx`, `/comecar`, `onboarding-content.test.ts` | I+T | objetivo e meta de XP; contas antigas não são forçadas | onboarding com objetivo e meta | objetivo **ainda não muda o conteúdo** | alto | média | M | conteúdo e missões recomendados conforme o objetivo | depende de conteúdo marcado por objetivo |
| Teste de nivelamento | `game/finish.ts` (kind `placement`) | I+T | sessão que estima A1–B2 | teste de nível no início | só vocabulário/tradução | médio | baixa | M | — | — |
| Currículo: unidades, lições, desbloqueio | `domain/lessons.ts buildPath`, `lessons.test.ts`, `e2e/learn.spec.ts` | I+T | 90 unidades (idioma × nível × categoria), desbloqueio sequencial, pula níveis declarados | trilha com unidades e seções | unidades são **temas de vocabulário**, sem objetivo comunicativo nem desafio final | alto | alta | G | — | conteúdo |
| Tradução, escrita, escuta | `answer-check.ts`, `game/sessions.ts`, `typing-game.test.ts` | I+T | correção tolerante (acento, digitação), diff, "não sei", nova tentativa | exercícios equivalentes | comparação com lista de respostas aceitas; **não reconhece paráfrases** | médio | média | M | — | — |
| Gramática (explicações, exercícios estruturais) | só `explanation` por item e `language-tips.ts` | P | dica curta por item | dicas e explicações de resposta | sem exercícios de estrutura nem explicação do erro de gramática | alto | média | G | — | redação pedagógica com revisão humana |
| Áudio de referência (TTS) | `speech/azure.ts`, `resolveItemAudio` | D | adaptador Azure com testes de contrato e `fetch` simulado; **nunca testado na API real**; sem chave → áudio do navegador | áudio gravado/sintetizado | depende de credencial | alto | média | P | áudio real servido com chave válida | chave Azure, custo por uso |
| Gravação, reconhecimento e pronúncia | `voice-player.tsx`, `submitVoiceAttempt`, `voice-game.test.ts`, `e2e/voice.spec.ts` | P (D no servidor) | servidor: Azure (não validado ao vivo); navegador: Web Speech, rotulado como **aproximado** | exercícios de fala | no modo navegador não há avaliação real de pronúncia | médio | média | P | avaliação real com Azure | chave Azure; Firefox sem Web Speech |
| Tutor de IA / conversação | — | **A** | não existe nenhum LLM nem missão de diálogo | Video Call, Roleplay, explicações (Max, conforme fontes acima) | **maior lacuna de produto** | muito alto | **alta** | G | missão de diálogo jogável de ponta a ponta, com feedback, também sem IA | IA exige provedor, custo, moderação e avaliação de qualidade |
| Histórico de respostas e erros | `answers`, `/historico`, `/resultado/[id]`, `getSessionReport` | I+T | respostas por tentativa, revisão de cada exercício | revisão de erros no fim da lição | ok | — | — | — | — | — |
| Revisão espaçada | `domain/srs.ts` (SM-2 simplificado), `finish.ts`, `selection.ts` (até 40% de vencidos, modo foco), `srs-voice.test.ts` | I+T | agenda no servidor ao finalizar a sessão (idempotente); vocabulário mostra "Revisar agora" | revisão personalizada (Practice Hub) | não explica **por que** revisar; lições inserem itens com intervalo fixo; sem revisão de estruturas | médio | média | M | fila com motivo (erro recente, vencido há X dias) | — |
| XP, níveis, sequência, metas | `scoring.ts`, `xp_events unique(user_id,source,ref)`, `dashboard.ts` | I+T | XP decrescente por repetição, tetos diários, meta diária/semanal | XP, sequência, metas | sequência zera ao falhar um dia (sem proteção) | médio | média | P | — | — |
| Moedas, recompensas, cosméticos | — | **A** | — | gemas, loja, itens | ausente (bom: nada de caixas aleatórias pagas) | médio | baixa | M | — | risco de mecânica manipulativa se mal desenhado |
| Missões diárias / desafios | `domain/challenges.ts` (8 desafios rotativos), painel | I+T | desafios diários com XP | missões diárias | genéricos, sem narrativa | baixo | baixa | P | — | — |
| Conquistas | `domain/achievements.ts`, 15 conquistas | I+T | concedidas no servidor ao finalizar | conquistas | ok | — | — | — | — | — |
| Rankings, ligas, temporadas, antiabuso | `rankings.ts`, `seasons.ts`, `rankings.test.ts`, `e2e/security.spec.ts` | I+T | top-10 sessões por modalidade, ligas, temporadas congeladas, opção de ocultar perfil, voz do navegador fora do ranking | ligas semanais | sem detecção de bots/multicontas | médio | baixa | G | — | — |
| Estatísticas e indicadores | `/estatisticas` (Premium), painel | I | por modalidade, tipos de erro, ritmo semanal, itens difíceis | progresso e relatórios | **sem medida de aprendizagem** (retenção após intervalo) | médio | média | M | — | telemetria com consentimento |
| Admin e conteúdo | `admin.ts`, `/admin/*`, `e2e/security.spec.ts` | I+T | CRUD, revisão editorial, procedência IA/humano, auditoria | ferramentas internas | conteúdo inicial **100% redigido com IA e não revisado** (355 itens) | alto | alta | — | — | professores/nativos |
| Planos Free/Premium | `entitlements.ts`, `billing/*`, `billing.test.ts`, `e2e/billing.spec.ts` | I+T (sandbox) | acesso no servidor, webhooks assinados e idempotentes; **só provedor simulado** | Free/Super/Max | sem cobrança real (correto até haver decisão) | — | — | — | — | provedor, decisão comercial |
| Responsividade, mobile, acessibilidade | `e2e/mobile.spec.ts`, `globals.css` (`prefers-reduced-motion`), rótulos ARIA | P | sem rolagem horizontal no Pixel 7; foco/teclado ok nos fluxos testados | apps nativos | sem auditoria automatizada (axe) nem leitor de tela testado | médio | média | P | axe sem violações sérias nas páginas principais | — |
| Autorização e isolamento de dados | consultas filtradas por `user_id`, `e2e/security.spec.ts` ("sessão de outro usuário é inacessível"), RLS + revoke | I+T | ok nos fluxos testados | — | — | — | — | — | — | — |
| Observabilidade e custos | `app_events`, `/admin/registros`, `docs/OPERATIONS.md`, cotas de voz/TTS | P | logs no banco; sem métricas externas | — | sem telemetria de produto | médio | média | M | — | consentimento LGPD |
| Testes (unit, integração, concorrência) | 80 + 52 + 22 testes; concorrência em finalização e webhooks | I+T | — | — | sem testes de acessibilidade automatizados | — | — | — | — | — |

## Cinco maiores problemas

1. **Não existe prática de conversação.** Todo exercício é palavra/frase isolada: o aluno não pratica comunicar-se numa situação, que é a promessa central do produto.
2. **Conteúdo não revisado por humanos:** os 355 itens foram redigidos com apoio de IA e há poucos itens em B1+ (35 em B1, 10 em B2).
3. **O currículo não tem objetivos comunicativos:** as unidades são categorias de vocabulário, sem desafio final contextualizado nem critério de domínio.
4. **A avaliação de fala e o áudio do servidor nunca foram validados contra o serviço real**, e o modo do navegador é só aproximado.
5. **Não há medida de aprendizagem:** XP e sessões medem esforço, não retenção nem melhoria de habilidade.

## Cinco oportunidades de maior impacto

1. **Missões narrativas de diálogo que funcionam sem IA** (avaliação determinística, avaliada no servidor), com uma porta para IA depois.
2. **Mapa de regiões** reorganizando lições existentes por objetivo comunicativo, com desafio final por região.
3. **Revisão espaçada explicável**, alimentada também pelos erros das missões ("você errou X na missão Y").
4. **Progresso por habilidade** (compreensão, produção escrita, interação), separado do XP.
5. **Trilhas por objetivo** (viagem, trabalho), usando o objetivo já coletado no onboarding.

Nenhuma vulnerabilidade crítica nova foi encontrada nesta etapa; as da auditoria anterior (AUDIT.md) já estão corrigidas e cobertas por testes.
