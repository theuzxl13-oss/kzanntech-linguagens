# Pontuação, XP e rankings

Todas as fórmulas estão em `src/lib/domain/scoring.ts` e são executadas **no servidor**. Os parâmetros ficam em `app_settings.scoring` (editáveis em Admin → Temporadas e pontuação); cada sessão grava a versão das regras usada.

Há três grandezas distintas:

| Grandeza | Para quê | Onde aparece |
|---|---|---|
| Pontuação bruta (`raw_score`) | Desempenho dentro da partida | Placar ao vivo e resultado |
| XP | Progresso pessoal (níveis) | Painel, conquistas |
| Pontos de ranking (`rank_points`, 0–1000 por sessão) | Competição normalizada | Rankings e ligas |

## Correção das respostas digitadas

- Maiúsculas, pontuação e espaços extras: ignorados. Hífens viram espaço; apóstrofos tipográficos são unificados.
- Contrações do inglês (`I'm`, `don't`…) equivalem à forma por extenso.
- Traduções alternativas cadastradas: corretas (crédito 1,0), com aviso da forma mais comum.
- Só acentuação diferente (inclui `ae/oe/ue/ss` no alemão): **acentuação**, crédito 0,75.
- Erro de digitação (distância de edição 1 em respostas de 5–12 letras, 2 acima disso): **digitação**, crédito 0,5. Respostas de até 4 letras exigem grafia exata (não ≠ mão).
- Demais casos: errado (0). Resposta vazia não é enviada.

## Digitação

```
pontos_item = 100 × dificuldade × crédito × (1 + 0,5 × velocidade) × (1 + min(0,5; 0,1 × sequência_anterior))
velocidade  = 1 se tempo ≤ esperado; cai linearmente até 0 em 3× o esperado
esperado    = 3 s + 0,25 s por caractere da resposta (+1,5 s + 0,08 s/caractere na escuta)
```

Dificuldade por nível: A1 1,0 · A2 1,15 · B1 1,3 · B2 1,45 · C1 1,6 · C2 1,75. Só a 1ª tentativa pontua; o tempo é medido pelo servidor desde a exibição do item.

**A velocidade nunca compensa errar:** um erro perde 100% da base e zera a sequência; a velocidade acrescenta no máximo 50%.

```
rank_points   = 1000 × precisão² × volume × (0,8 + 0,2 × velocidade_média) × peso_do_nível
precisão      = média dos créditos dos itens respondidos
volume        = min(1, respondidos / alvo)   (rápida 10, 60 s 10, 3 min 25, 5 min 40)
peso_do_nível = A1 0,70 · A2 0,78 · B1 0,86 · B2 0,93 · C1/C2 1,0
```

## Voz

```
nota_tentativa = nota_avaliação × fator (1ª 1,0 · 2ª 0,9 · 3ª 0,8)
nota_item      = melhor nota_tentativa (até 3 tentativas)
pontos_item    = nota_item × dificuldade
rank_points    = 1000 × (média_notas/100)² × volume × (0,9 + 0,1 × consistência) × peso_do_nível
consistência   = 1 − min(1, desvio_padrão_das_notas / 50)
```

A nota vem do serviço de pronúncia (Azure `PronScore`: combina precisão, fluência e completude). Sem ele, vem da **correspondência de palavras** reconhecidas pelo navegador (80% cobertura das palavras esperadas + 20% precisão), sempre exibida como aproximada — isso **não** mede pronúncia fonética. Sessões avaliadas só pelo navegador não entram no ranking (configurável com `VOICE_ALLOW_CLIENT_RANKED`; nesse caso aparecem como "não verificado"). Item aprovado: nota ≥ 60.

Mensagens: ≥ 85 "Muito bem! A frase foi reconhecida corretamente."; 60–84 "Você acertou a maior parte da frase."; < 60 "Vamos tentar novamente. Ouça com atenção a palavra destacada." Sotaques não são penalizados por si só: o critério é ser reconhecido/compreendido.

## XP

```
xp_item = 10 × dificuldade × crédito × decaimento
decaimento pelos acertos do mesmo item nas últimas 20 h: 1,0 → 0,5 → 0,25 → 0
```

Na voz, o crédito é nota/100 se a nota ≥ 60. Bônus de conclusão: +20 XP (≥ 80% do alvo e ≥ 50% de precisão; no máximo 10 por dia). Conquistas e desafios diários dão XP uma única vez (livro-razão `xp_events` com chave única). Meta semanal atingida: +50 XP por semana.

Níveis: XP total para o nível *n* = 50 × (n−1) × n (nível 2 = 100, nível 3 = 300, nível 4 = 600…).

## Rankings

- Contam apenas sessões **competitivas** finalizadas, de contas ativas que aceitam aparecer.
- Placar de uma modalidade no período = soma das **10 melhores sessões** (`ranking.topSessions`). Acumular sessões repetidas não infla o placar.
- **Ranking geral = (placar de digitação + placar de voz) / 2.** Como as duas modalidades usam a escala 0–1000 por sessão, nenhuma domina; quem joga só uma alcança no máximo metade.
- Períodos: semana ISO (segunda 00:00 UTC), temporada atual, todos os tempos ou temporada encerrada (resultado congelado).
- Evolução: posição atual comparada à posição no início do dia (UTC).

## Ligas e temporadas

Liga = faixa do placar geral na temporada atual (máximo teórico 10 000): Bronze 0 · Prata 1000 · Ouro 2500 · Platina 4500 · Diamante 6500 · Mestre 8500.

Temporadas são mensais e criadas automaticamente. Ao encerrar (automaticamente ou pelo admin), as classificações finais por modalidade e idioma são gravadas em `season_results` e o placar competitivo recomeça. XP, níveis, conquistas e histórico são permanentes.
