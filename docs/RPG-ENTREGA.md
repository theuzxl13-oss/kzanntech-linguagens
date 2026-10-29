# KeyLingo RPG — entrega da primeira etapa

| Item da Etapa 8 | Onde |
|---|---|
| 1. Diagnóstico técnico | [RPG-DIAGNOSTICO.md](RPG-DIAGNOSTICO.md) |
| 2. Matriz comparativa com o Duolingo (com fontes e datas) | [RPG-DIAGNOSTICO.md](RPG-DIAGNOSTICO.md#matriz) |
| 3. Proposta de valor e público inicial | [GAME-DESIGN.md §1](GAME-DESIGN.md#1-proposta-de-valor-e-público-inicial) |
| 4. Conceito do game e ciclo principal | [GAME-DESIGN.md §2–8](GAME-DESIGN.md#2-conceito-do-jogo-e-ciclo-principal) |
| 5. Roadmap priorizado | [GAME-DESIGN.md §11](GAME-DESIGN.md#11-roadmap-priorizado) |
| 6–11 | abaixo |

## 6. Melhoria selecionada: missões de diálogo em modo texto

**Justificativa:** o diagnóstico mostrou que não existe nenhuma prática de conversação (problema 1). É a lacuna de maior impacto que dá para fechar **sem credenciais externas**, reaproveitando correção de respostas, XP com idempotência, revisão espaçada, autorização e rate limit que já funcionam e estão testados. É também o primeiro passo concreto do RPG: personagem, situação, objetivo, região e progressão.

**O que o jogador faz agora:**
1. Abre **Missões** (navegação, ou o cartão "Missão" no painel).
2. Vê as missões da região **Primeiros Passos**, com objetivo, personagem, duração estimada e o critério de desbloqueio em linguagem clara.
3. Conversa com o personagem escrevendo com as próprias palavras. A resposta é aceita quando transmite as ideias necessárias, e há várias formulações aceitas para cada ideia.
4. Recebe feedback na hora: o que falta dizer, acentuação, grafia, erros de gramática conhecidos e sugestão de cortesia.
5. Pode pedir até 3 dicas (o que dizer → estrutura → resposta-modelo). Depois de 3 tentativas, a etapa mostra uma forma correta e segue.
6. No fim, vê o resumo: o que fez bem, correções com a frase natural, frase para praticar, palavras enviadas à revisão e a próxima missão.

**Regras no servidor:** etapa atual, tentativas, dicas, pontuação e XP ficam no banco. O navegador só envia o texto. Respostas repetidas ou simultâneas contam uma vez. XP: 40 na primeira conclusão (proporcional ao desempenho, mínimo 10), 8 por repetição (uma vez por dia), teto de 160 XP de missões em 24 h. Missões ficam no plano Free, porque são o valor central.

**Limitações declaradas:**
- Sem IA, a avaliação não entende qualquer frase, só as formulações cadastradas.
- A gramática só é corrigida para erros previamente cadastrados.
- O conteúdo (2 missões × 5 idiomas) foi redigido com apoio de IA e aparece como "conteúdo em revisão".
- Áudio e voz ainda não estão nas missões.

## 7. Arquivos modificados

| Arquivo | Motivo |
|---|---|
| `db/migrations/0007_missions.sql` (novo) | tabelas `missions`, `mission_attempts` (uma em andamento por missão), `mission_turns` (única por tentativa/etapa/número); XP com fonte `mission`; RLS |
| `src/lib/domain/missions.ts` (novo) | avaliação por grupos de sentido, fronteira de palavra com Unicode, dicas, pontuação, XP, desbloqueio, validação de conteúdo |
| `db/seed/missions.ts` (novo), `scripts/seed.ts` | 10 roteiros (es, en, fr, de, it); seed idempotente que valida cada missão antes de inserir |
| `src/lib/server/missions.ts` (novo) | listar, iniciar/retomar, visão do jogador (sem vazar respostas), responder (idempotente, com lock), dica, conclusão (XP, sequência, revisão, resumo) |
| `src/lib/server/study.ts` (novo), `src/lib/server/lessons.ts` | XP/nível/sequência compartilhados entre lições e missões (refatoração sem mudança de comportamento; testes de lições continuam verdes) |
| `src/app/api/missions/**` (novo) | 5 rotas autenticadas, com proteção de origem e validação Zod |
| `src/app/(app)/missoes/**`, `src/components/missions.tsx` (novos) | lista por região e jogador de diálogo; `role="log"` com `aria-live`, rótulos, teclado de acentos, campo bloqueado durante o envio, tradução opcional |
| `src/components/player/typing-player.tsx` | exporta o mapa de acentos para reutilização |
| `src/components/app-nav.tsx`, `src/proxy.ts` | link "Missões" (desktop e celular; Conquistas segue no menu do usuário); rota protegida |
| `src/app/(app)/painel/page.tsx` | cartão "Missão" (próxima ou em andamento, ou como desbloquear) |
| `src/lib/server/accounts.ts` | exportação de dados inclui tentativas e respostas das missões |
| `src/lib/server/maintenance.ts` | tentativas esquecidas há 30 dias viram "abandonadas" |
| `demo/app.tsx` | a demo estática explica que as missões exigem o servidor, sem simular |
| `tests/unit/missions.test.ts`, `tests/integration/missions.test.ts`, `tests/e2e/missions.spec.ts`, `tests/e2e/mobile.spec.ts` | testes da etapa |
| `docs/*` | diagnóstico, game design e esta entrega |

## 8. Testes executados (2026-10-29, local, PostgreSQL 16)

| Comando | Resultado |
|---|---|
| `npx eslint .` | 0 erros, 3 avisos preexistentes |
| `npx tsc --noEmit` | sem erros |
| `npx vitest run tests/unit` | **94/94** (14 novos de missões) |
| `VITEST_SUITE=integration npx vitest run` | **62/62** (10 novos de missões) |
| `npm run build` | ok (`/missoes` e `/missoes/jogar/[attemptId]` gerados) |
| `npx playwright test` | **24/24** (2 novos de missões + missão no celular) |
| `npm audit --audit-level=high` | 0 vulnerabilidades |
| `node scripts/check-secrets.mjs` | nenhum segredo |
| `npm run demo:build` | ok |
| `npm run db:maintenance` | ok |

Cenários cobertos: desbloqueio; fluxo completo; paráfrases aceitas; respostas vazias, incompletas e com palavras-parte ("té" dentro de "tétrico"); acento e erro de digitação; erros de gramática cadastrados; contrações do inglês; isolamento entre usuários (ver, responder e pedir dica na tentativa de outro → 404); 6 envios simultâneos da mesma resposta → 1 registro; 5 inícios simultâneos → 1 tentativa; sequência fora de ordem → 409; dicas (a resposta-modelo só aparece na 3ª; índice correto no array); XP na primeira conclusão, em repetição e com teto; revisão espaçada após desempenho fraco; persistência após recarregar; exclusão de conta em cascata; exportação de dados; celular sem rolagem horizontal.

O CI do GitHub (execução nº 2, commit `45d4f69`) passou nos 3 jobs antes desta etapa. O resultado do CI desta etapa só existe depois do push e é informado à parte.

**Não executados:** auditoria automática de acessibilidade (axe — exigiria nova dependência), teste com leitor de tela real, testes com usuários e qualquer integração de IA, áudio ou pagamento real (sem credenciais).

## 9. Segurança

- Nenhuma vulnerabilidade nova encontrada no diagnóstico.
- Defeito encontrado e corrigido durante a implementação: `\b` em expressões regulares do JavaScript não reconhece letras acentuadas, então padrões como `\buna café\b` nunca disparavam. Agora usamos uma fronteira de palavra Unicode, coberta por teste.
- Defeito de UX/integridade corrigido: o campo de resposta era limpo quando a resposta anterior chegava, apagando o que o aluno já tinha digitado. Agora ele fica somente leitura durante o envio.
- Controles da etapa: tentativas sempre filtradas por `user_id`; IDs validados (UUID e formato do slug); rate limits em início, resposta e dica; corpo limitado a 64 KiB e resposta a 300 caracteres; nenhuma resposta aceita é enviada ao navegador antes da 3ª dica; recompensas idempotentes no servidor.

## 10. Pendências e limitações

- Revisão humana dos 10 roteiros e do catálogo (pré-requisito para vender).
- Edição de missões no painel admin (hoje só por seed/migração).
- Tutor de IA: exige provedor, orçamento, moderação e avaliação de qualidade.
- Voz nas missões: depende da validação da Azure com chave real.
- Mapa visual de regiões, avatar/companheiro, moeda, proteção de sequência e progresso por habilidade: propostos, não implementados.
- Métricas de aprendizagem: instrumentação proposta, nenhum dado real coletado.

## 11. Próximos passos recomendados

1. Revisão pedagógica das missões com professores; ampliar as formulações aceitas a partir das respostas reais recusadas (consulta em `mission_turns`).
2. Mostrar na revisão espaçada o motivo de cada item ("errou na missão X") e incluir as frases das missões na revisão.
3. Completar a região Primeiros Passos (4–6 missões) com um desafio final e depois o mapa visual.
4. Validar a Azure e adicionar voz às missões.
5. Piloto de tutor de IA com teto de custo, com a avaliação determinística como piso e revisão humana por amostragem.
