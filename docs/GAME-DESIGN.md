# KeyLingo RPG — game design, proposta de valor, modelo de negócio e validação

Base: diagnóstico em [RPG-DIAGNOSTICO.md](RPG-DIAGNOSTICO.md). Tudo aqui é **proposta**, exceto o que a seção "Primeira implementação" marca como feito e testado.

## 1. Proposta de valor e público inicial

**Público inicial:** adultos brasileiros (18–40) que estudam idiomas para **viajar ou trabalhar**, sabem pouco ou nada e desistiram de apps que "ensinam palavras soltas".

**Proposta:** *"No KeyLingo você aprende o idioma vivendo situações reais: cada missão é uma conversa que você precisa resolver — pedir a comida, fazer o check-in, se apresentar na entrevista — com dicas quando trava e revisão do que esqueceu."*

### Hipóteses de valor

| Hipótese | Valor | Diferenciação | Complexidade | Dependências | Custo recorrente | Risco pedagógico | Como validar | Métrica de sucesso |
|---|---|---|---|---|---|---|---|---|
| 1. Situações reais | alto | média (concorrentes já têm roleplay pago) | média | conteúdo revisado | baixo | roteiros artificiais | entrevistas + teste com 10–20 alunos | ≥ 60% concluem a 1ª missão; autoavaliação de confiança antes/depois |
| 2. Tutor de IA com contexto | alto | baixa–média | alta | provedor de LLM, moderação | **alto** (por mensagem) | correções erradas, alucinação | piloto fechado com revisão humana de amostras | ≥ 90% das correções avaliadas como corretas por professor |
| 3. Revisão adaptativa | alto | baixa (padrão do mercado) | baixa (já existe SM-2) | — | baixo | intervalos mal calibrados | retenção em revisão após 7 dias | taxa de acerto em itens revisados no prazo vs. atrasados |
| 4. Progresso por habilidade | médio | média | média | missões e avaliação | baixo | métrica parecer "nível CEFR" sem ser | teste de usabilidade | aluno explica corretamente o que o gráfico mede |
| 5. Trilhas carreira/viagem | alto | média | média | conteúdo especializado | baixo | conteúdo raso | escolha de trilha no onboarding + conclusão | % que escolhe e conclui a 1ª região da trilha |
| 6. RPG com narrativa | médio | alta (se bem feito) | alta | arte, roteiro | baixo | jogo distrair do aprendizado | A/B tradicional × gamificado | retenção D7 **e** acerto em revisão (não só tempo de tela) |
| 7. Sessões curtas contínuas | alto | baixa | baixa | — | baixo | superficialidade | duração e conclusão por sessão | ≥ 70% das sessões concluídas em ≤ 10 min |

Nenhuma vantagem competitiva está comprovada: todas as hipóteses dependem de teste com usuários reais.

## 2. Conceito do jogo e ciclo principal

O jogador é um **viajante** que chega a um país onde fala o idioma estudado. Cada região é um lugar desse país; avançar exige **se comunicar** nas situações do lugar.

Ciclo principal (já mapeado ao que existe):

1. **Entra e vê o objetivo do dia** → painel com meta diária (feito) + "próxima missão" (feito nesta etapa).
2. **Recebe uma missão adequada** → missão desbloqueada pela trilha; no futuro, escolhida pelo objetivo e pelos erros recentes.
3. **Aprende/revisa** → lições da trilha (existente) que preparam o vocabulário da missão.
4. **Usa em exercícios contextualizados** → jogos de digitação/voz (existente).
5. **Aplica numa situação prática** → **missão de diálogo** (implementada nesta etapa).
6. **Feedback e recompensa proporcional** → resumo da missão com acertos, correções e XP decrescente em repetições (implementado).
7. **Desbloqueia** → próxima missão da região; cosméticos ficam para depois.
8. **Agenda revisões** → erros da missão entram na revisão espaçada como vencidos (implementado).
9. **Retorna** → sequência, meta diária e revisões vencidas (existente).

Sessão: uma missão leva de 3 a 8 minutos; uma lição, de 2 a 5. A duração é configurável pela quantidade de etapas da missão.

## 3. Mundo, regiões e progressão (proposta)

| Região (nome provisório) | Nível | Situações | Desafio final |
|---|---|---|---|
| Primeiros Passos | A1 | cumprimentos, apresentação, café | conversa de apresentação + pedido simples |
| Cidade Viva | A1–A2 | transporte, compras, direções | comprar uma passagem e perguntar o caminho |
| Mundo das Viagens | A2–B1 | aeroporto, hotel, restaurante, imprevistos | resolver um problema com a reserva |
| Academia Profissional | B1–B2 | entrevista, reunião, e-mail | entrevista de emprego |
| Fronteira da Conversação | B2+ | conversa livre | conversa aberta (exige IA) |

Cada região: missões principais (obrigatórias para o desafio final), secundárias (opcionais), lições de preparação (as unidades existentes reagrupadas), revisão e desafio final. **Desbloqueio objetivo:** concluir as missões principais com pelo menos 70% das etapas sem usar a resposta-modelo. Nada essencial depende de moeda ou compra; revisão e prática livre ficam sempre abertas.

Na primeira implementação, a região existe como **campo da missão** (`region`) e as missões aparecem agrupadas por região. O mapa visual vem depois.

## 4. Avatar e companheiro (proposta, não implementado)

- Hoje o avatar é um emoji com cor. Próximo passo barato: **acessórios em SVG** sobrepostos ao avatar (chapéu, mochila, crachá) liberados por marcos de **domínio** (ex.: concluir a região), nunca vendidos.
- **Companheiro original** (ex.: um pequeno mapa-guia falante) dá as dicas das missões. Animações só em CSS, respeitando `prefers-reduced-motion`.
- **Separação de estados:** `cosmetics` em tabela própria, nunca lida por regras pedagógicas. Item cosmético não prova domínio.
- Fora de escopo agora: 3D, multiplayer e animações pesadas (custo alto, benefício não demonstrado).

## 5. Missões narrativas e conversação

Formato implementado (`src/lib/domain/missions.ts`):

- Contexto, objetivo, nível recomendado, vocabulário e estruturas-alvo.
- Etapas: fala do personagem → objetivo da resposta → **avaliação por grupos de sentido** (a resposta é aceita se contém cada ideia obrigatória em qualquer formulação aceita), e não por opções fixas.
- Feedback em quatro eixos: **clareza** (as ideias necessárias estão lá), **vocabulário** (palavras-alvo usadas), **adequação** (cortesia, registro), **gramática** (só erros conhecidos e cadastrados — limitação declarada).
- Dicas progressivas: 1) o que dizer, em português; 2) estrutura com lacuna; 3) resposta-modelo (marca a etapa como assistida).
- Resumo final: o que fez bem, correções, frase para praticar e próxima recomendação.
- Erros relevantes viram revisões vencidas na revisão espaçada.

**Sem IA** a avaliação é determinística e transparente. Ela aceita paráfrases previstas, mas não entende qualquer frase. **Com IA (futuro):** o personagem responde livremente e um avaliador gera o feedback nos mesmos quatro eixos; a avaliação determinística continua como piso, e o conteúdo gerado nunca é tratado como validado automaticamente. Pré-requisitos: provedor escolhido, custo por missão medido, moderação, limite por plano e revisão humana por amostragem.

Áudio nas missões: reaproveitar o TTS e o reconhecimento existentes **depois** de validar a Azure com chave real. Sem serviço, a missão funciona em texto (implementado).

## 6. Progressão de jogo

| Elemento | Regra | Estado |
|---|---|---|
| XP | só no servidor; `xp_events` com `unique(user_id, source, ref)`; repetição rende menos; teto diário por fonte | existente; missões seguem a mesma regra |
| Níveis de jogador | derivados do XP | existente |
| Domínio por habilidade | por item (SRS) hoje; por habilidade comunicativa no futuro | parcial |
| Missões diárias/semanais | desafios diários existentes; semanais futuros | parcial |
| Conquistas | servidor | existente |
| Sequência | hoje zera ao perder um dia → **propor** 1 dia de tolerância por semana, sem custo | proposta |
| Moeda virtual | só se houver algo útil para gastar; ganha por domínio, nunca vendida em caixas aleatórias | proposta |
| Competição | ranking opcional (já é possível ocultar o perfil) | existente |

Antiexploração: repetir missão concluída rende pouco XP e respeita o teto diário; respostas repetidas não contam duas vezes (unicidade por tentativa); a pontuação vem do servidor.

## 7. Revisão espaçada adaptativa

O que já existe e foi mantido: SM-2 simplificado e determinístico (`domain/srs.ts`), cálculo no servidor, persistência em `user_item_progress`, fila de vencidos nos jogos e "Revisar agora" no vocabulário, testes unitários.

Adicionado nesta etapa: os erros das missões entram como **vencidos agora**, com motivo registrado (`last_result = 'mission_miss'`), sem apagar o histórico.

Próximos: mostrar o motivo da revisão ("errou na missão X há 2 dias"; "vencido há 5 dias"); estender a revisão a **estruturas** (frases da missão), além de palavras; testes de fuso horário na fila.

## 8. Feedback e evolução real

O resumo da missão mostra o que o aluno fez bem, as correções, uma explicação curta, uma frase para praticar e a próxima missão. **Pontuação de jogo ≠ evidência de aprendizagem:** a tela não promete fluência e não converte XP em nível CEFR. O nível CEFR das missões é só "recomendado", porque o conteúdo não foi validado por especialistas.

## 9. Modelo de negócio (proposta; cobrança real não implementada)

| Recurso | Free | Premium |
|---|---|---|
| Trilha A1–A2, jogos, revisão, missões de texto | ✓ | ✓ |
| Histórico e progresso | ✓ (nunca bloqueado) | ✓ |
| Missões com IA (conversa livre) | algumas por semana | volume maior, com teto de custo |
| Trilhas especializadas (carreira) | prévia | completas |
| Relatórios detalhados | — | ✓ |

A infraestrutura de acesso por plano já existe e é testada (`entitlements.ts`, webhooks idempotentes, sandbox). Antes da cobrança real faltam: escolher o provedor, definir preços, impostos, reembolso e política de arrependimento, e medir o **custo de IA por usuário ativo** (que decide o limite Free/Premium das missões com IA).

## 10. Validação do game (métricas e instrumentação)

| Métrica | Fonte hoje | Falta |
|---|---|---|
| Conclusão de missões | `mission_attempts` (status, etapas) | — |
| Abandono por etapa | `mission_attempts.current_step` de tentativas não concluídas | painel |
| Retenção D1/D7/D30 | `game_sessions`, `mission_attempts`, `user_lessons` (datas) | consulta agregada |
| Revisões no prazo | `user_item_progress.due_at` × última resposta | consulta |
| Retenção de vocabulário | acerto em itens revisados após ≥ 7 dias | consulta |
| Melhoria por habilidade | — | avaliação periódica (mini-teste) |
| Conversas concluídas | `mission_attempts` concluídas | — |
| Custo de IA por usuário ativo | — | só quando houver IA |
| Conversão Premium | `subscriptions` | só com dados suficientes |

Não há telemetria de cliente nem dados de usuários reais: nenhuma métrica é informada como resultado. Instrumentação mínima proposta: usar os registros já gravados no servidor para o funcionamento do produto (sem rastreadores de terceiros) e pedir consentimento antes de qualquer analytics adicional.

**Experimento quando houver usuários suficientes:** grupo A (trilha tradicional) × grupo B (trilha + missões), sorteado por conta, comparando retenção D7/D30 **e** acerto em revisões após 7 dias, não só tempo de tela.

## 11. Roadmap priorizado

| # | Item | Impacto | Esforço | Dependências | Riscos |
|---|---|---|---|---|---|
| 1 | **Missões de diálogo em texto** (motor, 1ª missão em 5 idiomas, XP, revisão) | muito alto | M | — | conteúdo não revisado (marcado) |
| 2 | Revisão espaçada explicável + revisão de frases das missões | alto | P | 1 | — |
| 3 | Mais missões da região Primeiros Passos + desafio final | alto | M | revisores | qualidade do roteiro |
| 4 | Mapa de regiões (UI) reagrupando lições e missões | médio | M | 3 | reformulação visual sem perder função |
| 5 | Progresso por habilidade | médio | M | 1 | interpretação errada da métrica |
| 6 | Validar Azure (TTS/STT) e voz nas missões | médio | P | chave Azure | custo |
| 7 | Tutor de IA nas missões (piloto) | muito alto | G | provedor, orçamento, moderação | custo, qualidade das correções |
| 8 | Avatar com acessórios por marcos | médio | P | 3 | desviar o foco |
| 9 | Proteção de sequência sem custo | baixo | P | — | — |
| 10 | Cobrança real | — | M | decisão comercial | jurídico/fiscal |

## 12. Primeira implementação: missões de diálogo (texto)

**Por quê:** é a maior lacuna apontada no diagnóstico (problema 1, oportunidade 1). Funciona **sem credenciais**, reaproveita correção de respostas, XP, revisão espaçada, rate limit e autorização, e é o primeiro passo concreto do RPG.

Implementação, arquivos e testes: [RPG-ENTREGA.md](RPG-ENTREGA.md).
