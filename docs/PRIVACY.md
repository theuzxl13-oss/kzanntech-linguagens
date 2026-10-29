# Privacidade e retenção de dados (visão técnica)

> Documento técnico de apoio. **Não é parecer jurídico** e não garante conformidade com a LGPD: a política pública (`/privacidade`) e os Termos são modelos que precisam de revisão jurídica e dos dados do controlador.

## Inventário de dados pessoais

| Dado | Onde | Finalidade | Retenção |
|---|---|---|---|
| E-mail, hash da senha (scrypt), apelido, avatar, fuso, preferências | `users`, `profiles` | conta | enquanto a conta existir |
| Objetivo de estudo e metas | `profiles` | personalização | enquanto a conta existir |
| Sessões de jogo, respostas, texto reconhecido da fala, XP, conquistas, revisão espaçada | `game_sessions`, `answers`, `xp_events`, `user_*` | serviço | enquanto a conta existir |
| Áudio de voz | não armazenado (processado em memória) | avaliação de pronúncia | — |
| IP e navegador das sessões de login | `auth_sessions` | segurança | até a expiração da sessão |
| Chaves de limite de tentativas | `rate_limits` (HMAC do IP/e-mail) | antiabuso | 24 h |
| Registros técnicos | `app_events` | diagnóstico | 90 dias |
| E-mails enviados | `email_outbox` | entrega e diagnóstico | 30 dias (apagados na exclusão da conta) |
| Auditoria | `audit_logs` | segurança/responsabilização | 1 ano |
| Assinatura, faturas, eventos de pagamento | `subscriptions`, `invoices`, `payment_events` | cobrança | **não apagados pela manutenção** — prazo legal a definir; assinaturas e faturas são apagadas na exclusão da conta |
| Checkouts abandonados | `checkout_sessions` | cobrança | 30 dias |
| Contadores de uso diário | `usage_counters` | cotas do plano | 35 dias |

Dados de cartão nunca passam pelo KeyLingo.

## Direitos do titular implementados

- **Acesso/portabilidade:** Perfil → Exportar dados (JSON com conta, progresso, assinaturas e faturas).
- **Exclusão:** Perfil → Excluir conta. Apaga em cascata os dados da conta e os e-mails enviados ao titular; antes, pede ao provedor de pagamento o fim das cobranças recorrentes.
- **Revogação do consentimento de voz:** Perfil → Privacidade.

## Rotina de limpeza

`npm run db:maintenance` (`src/lib/server/maintenance.ts`). Agende diariamente — ver [OPERATIONS.md](OPERATIONS.md).

## Pendências que dependem de decisão

- Identificação do controlador e do encarregado (DPO) na política.
- Prazo de guarda de registros financeiros e se faturas devem sobreviver à exclusão da conta (anonimizadas) por obrigação fiscal.
- Contratos/termos de tratamento com os provedores (hospedagem, banco, e-mail, voz, pagamento).
