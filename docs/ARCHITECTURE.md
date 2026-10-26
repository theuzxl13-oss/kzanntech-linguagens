# Arquitetura

## Decisões

| Decisão | Motivo |
|---|---|
| Next.js 16 App Router, renderização dinâmica no servidor (`cacheComponents` desativado) | Quase todas as páginas dependem do usuário da requisição. O modelo de Cache Components exigiria `<Suspense>` em toda leitura de sessão, sem ganho real aqui. |
| PostgreSQL acessado **somente pelo servidor** (`pg`) | Pontuação competitiva, seleção de exercícios e correção precisam ser autoritativas no servidor. O navegador nunca fala com o banco. |
| Autenticação própria em vez de Supabase Auth | O Supabase local exige Docker (indisponível no ambiente de desenvolvimento), o que impediria testar o fluxo de ponta a ponta. A implementação usa práticas padrão (scrypt, tokens aleatórios guardados como HMAC, cookies `httpOnly`/`SameSite=Lax`, revogação de sessões) e roda em qualquer Postgres, inclusive no do Supabase. Migrar para Supabase Auth depois é possível substituindo `session-store.ts` e `accounts.ts`. |
| RLS habilitado em todas as tabelas, sem políticas | No Supabase, isso nega todo acesso pela API pública (chaves `anon`/`authenticated`), protegendo pontuações e dados pessoais. O servidor conecta como dono das tabelas. |
| Provedores de voz intercambiáveis (`src/lib/server/speech`) | Interface `SpeechProvider` (TTS + avaliação). Hoje: Azure. Trocar de fornecedor exige só um novo adaptador. |
| Sem Supabase Storage | Avatares são predefinidos e o áudio do usuário não é armazenado. Áudios de referência podem ficar em `/public/audio` ou em URL https. |

## Fluxo de uma sessão (anti-fraude)

1. `POST /api/sessions` — o servidor escolhe os exercícios (revisões vencidas, itens novos do nível, itens com erros) e grava a sessão. **Nenhum enunciado nem resposta é enviado.**
2. `POST /api/sessions/:id/serve {idx}` — revela o enunciado do próximo item e grava `served_at`. Os itens são entregues em ordem; o cronômetro começa no primeiro item.
3. `POST /api/sessions/:id/answer {idx, attempt, answer}` — o servidor corrige, mede o tempo (`agora − served_at`) e calcula os pontos. A tentativa é idempotente (`unique(session_id, idx, attempt_no)`): reenviar devolve o mesmo resultado.
4. `POST /api/sessions/:id/finish` — transação com `SELECT … FOR UPDATE` + advisory lock por usuário: calcula XP, pontos de ranking, revisão espaçada, sequência, conquistas, desafios e meta semanal. Chamadas repetidas devolvem o resultado gravado.

Proteções:

- Campos extras enviados pelo cliente (ex.: `points`) são ignorados pelos schemas Zod.
- Respostas a itens não exibidos, fora de ordem, após o tempo (com 45 s de tolerância para o item em andamento) ou de outro usuário são recusadas.
- A escuta competitiva só usa áudio servido pelo servidor (o texto não vai ao navegador).
- A voz competitiva só vale com avaliação no servidor.
- Sessões filtradas por tema ou revisão são sempre treino.
- Uma sessão ativa por usuário (iniciar outra encerra a anterior como está).
- XP decrescente para itens repetidos; o ranking considera só as N melhores sessões.
- Pular por "áudio indisponível" sem penalidade é limitado a 3 itens por sessão.

## Modelo de dados (resumo)

- **Catálogo:** `languages`, `levels`, `categories`, `units`, `content_items` (com `review_status`, `source`, `formats`), `accepted_answers` (`to_pt` / `to_target`), `audio_assets`.
- **Contas:** `users`, `profiles`, `auth_sessions`, `auth_tokens`, `email_outbox`, `rate_limits`.
- **Jogo:** `game_sessions`, `session_items`, `answers` (texto e nota; nunca áudio), `seasons`, `season_results`.
- **Progresso:** `user_stats`, `user_languages`, `user_item_progress` (SRS), `xp_events` (livro-razão idempotente), `achievements`, `user_achievements`, `challenge_completions`.
- **Admin:** `app_settings` (regras de pontuação versionadas), `audit_logs`, `app_events`.

A exclusão de conta remove em cascata todos os dados do usuário; os logs de auditoria mantêm o evento sem o vínculo pessoal.

Exercícios são gerados de itens × formatos habilitados (`content_items.formats`), em vez de uma tabela de exercícios estática: o admin habilita/desabilita formatos por item.

## Segurança

- Senhas: scrypt (N=16384, r=8, p=1), comparação em tempo constante; login com tempo uniforme para e-mails inexistentes.
- Sessões: token de 256 bits, armazenado como HMAC-SHA256; expira após 30 dias de inatividade; troca/redefinição de senha revoga todas.
- CSRF: verificação de `Origin` em toda requisição que altera estado + `SameSite=Lax`.
- Autorização: `requireUser`/`requireAdmin` nos layouts e `apiUser`/`apiAdmin` em cada rota de API. O `proxy.ts` é só um redirecionamento otimista.
- Rate limit (no banco): cadastro, login (por IP e por e-mail), recuperação de senha, criação de sessões, respostas, voz, TTS, exportação.
- Cabeçalhos: CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (microfone só na própria origem).
- Erros internos retornam mensagem genérica e são registrados em `app_events` (visíveis em Admin → Registros).
- Rankings expõem apenas apelido, avatar e pontos; o usuário pode se ocultar.
- Moderação: suspensão exige motivo, encerra as sessões do usuário e é auditada; um admin não altera a própria conta nem suspende outro admin sem antes remover o papel.

## Acessibilidade

Link "pular para o conteúdo", foco visível, rótulos em todos os campos, `role="radiogroup"` nas escolhas, barras de progresso com `aria-valuenow`, feedback em regiões `aria-live`, cronômetro com `role="timer"`, tabela alternativa ao gráfico, respeito a `prefers-reduced-motion`, botões de acentos para teclados sem o layout do idioma, `lang` correto nos textos estrangeiros e alternativas quando áudio ou microfone não estão disponíveis. O campo de resposta desativa autocorreção/autocapitalização para teclados virtuais.
