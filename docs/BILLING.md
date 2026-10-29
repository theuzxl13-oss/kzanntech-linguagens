# Planos, assinaturas e cobrança

## Visão geral

| Peça | Arquivo |
|---|---|
| Tabelas (`plans`, `checkout_sessions`, `subscriptions`, `payment_events`, `invoices`, `usage_counters`) | `db/migrations/0005_billing.sql` |
| Regras puras de acesso (limites por plano, tolerância de pagamento) | `src/lib/domain/entitlements.ts` |
| Decisão de acesso no servidor (`getEntitlements`, cotas `consumeQuota`) | `src/lib/server/entitlements.ts` |
| Contrato do provedor (`PaymentProvider`) e escolha do provedor | `src/lib/server/billing/types.ts`, `billing/index.ts` |
| Verificação de assinatura dos webhooks | `src/lib/server/billing/signature.ts` |
| Provedor simulado (sandbox) | `src/lib/server/billing/sandbox.ts` |
| Checkout, processamento de eventos, cancelamento, concessão manual | `src/lib/server/billing/service.ts` |
| Páginas | `/planos`, `/planos/retorno`, `/assinatura/sandbox`, `/estatisticas`, `/admin/assinaturas` |

## O que cada plano libera (padrão, editável em /admin/assinaturas)

| | Grátis | Premium |
|---|---|---|
| Lições da trilha | A1–A2 | A1–C2 |
| Jogos, revisão espaçada, metas, conquistas, rankings | ✓ | ✓ |
| Avaliações de pronúncia no servidor / dia | 20 | 300 |
| Áudios sintetizados no servidor / dia | 150 | 3000 |
| Estatísticas detalhadas | — | ✓ |
| Tolerância após falha de pagamento | — | 3 dias |

Preços iniciais da migração (R$ 29,90/mês, R$ 239,90/ano) são **exemplos**: preço, impostos, período de teste e política de reembolso são decisões de negócio.

## Regras de segurança implementadas

1. **O navegador nunca concede acesso.** O checkout é criado no servidor e amarrado a (usuário, plano). A página de retorno só consulta o status; o Premium aparece quando o **webhook** de pagamento confirmado é processado.
2. **Webhook autenticado:** cabeçalho `x-keylingo-signature: t=<unix>,v1=<hex>`, HMAC-SHA256 de `"<t>.<corpo bruto>"` com `BILLING_WEBHOOK_SECRET`, comparação em tempo constante, janela de 5 minutos contra replay. Falhas → `400`, sem tocar no banco.
3. **Idempotência:** `payment_events` tem unicidade `(provider, event_id)`; entregas repetidas ou concorrentes do mesmo evento são processadas uma vez (testado com 6 entregas paralelas). Faturas são únicas por `(provider, provider_invoice_id)`.
4. **Eventos fora de ordem:** cada assinatura guarda `last_event_at`; eventos mais antigos não revertem o estado. Eventos que chegam antes de a assinatura existir ficam `deferred` e são reaplicados, em ordem, quando o `checkout.completed` chega. Eventos da mesma assinatura são serializados com advisory lock.
5. **Checkout desconhecido** (não criado pelo servidor) é ignorado: não há como criar assinatura para outro usuário ou plano.
6. **Sem dados de cartão:** o KeyLingo guarda só identificadores do provedor, status e valores.
7. **Cotas atômicas:** o incremento de `usage_counters` só acontece se houver cota (`... do update ... where count < limite`), então requisições concorrentes não ultrapassam o limite.
8. **Sem cache por usuário:** o acesso é recalculado a cada requisição (só a configuração global de limites tem cache de 30 s).
9. **Exclusão de conta** pede ao provedor o fim das cobranças antes de apagar os dados; se o provedor estiver indisponível, a exclusão é interrompida com mensagem clara.
10. **Concessões manuais** (`/admin/assinaturas`) exigem motivo e ficam em `audit_logs`; não podem ser canceladas pelo usuário.

## Provedor sandbox (desenvolvimento e testes)

```bash
BILLING_PROVIDER=sandbox
BILLING_WEBHOOK_SECRET=qualquer-valor-local   # opcional; sem ele, é derivado do AUTH_SECRET
```

O "checkout hospedado" é `/assinatura/sandbox`, claramente marcado como pagamento simulado. Aprovar gera eventos **assinados** que passam pela mesma verificação dos webhooks reais. Na página de planos há botões para simular renovação, falha de pagamento e encerramento.

O sandbox **não liga em produção** (`NODE_ENV=production`), exceto com `ALLOW_SANDBOX_BILLING_IN_PRODUCTION=true`, usado apenas pelo E2E contra o build de produção. Nunca defina essa variável em um ambiente público.

## Integrar um provedor real (pendente — exige decisão e credenciais)

Nenhum provedor real foi integrado: não havia escolha de provedor nem credenciais. Para integrar (ex.: Stripe, Mercado Pago, Pagar.me):

1. Criar `src/lib/server/billing/<provedor>.ts` implementando `PaymentProvider`:
   - `createCheckout`: cria a sessão de checkout hospedada (preço via `plans.provider_price_id`), com `client_reference_id`/metadados = `checkoutSessionId`, e devolve a URL.
   - `parseWebhook`: verifica a assinatura **com a biblioteca/algoritmo oficial do provedor** e converte o evento para `BillingEvent` (mapear os tipos do provedor para os 5 tipos internos).
   - `setCancelAtPeriodEnd`: chama a API do provedor. O estado local muda pelo webhook.
2. Registrar em `getPaymentProvider()` (`billing/index.ts`) e preencher `provider_price_id` dos planos.
3. Cadastrar a URL `https://<domínio>/api/billing/webhook/<id-do-provedor>` no painel do provedor e configurar o segredo como **secret** (`wrangler secret put` no Cloudflare).
4. Testar em modo de teste do provedor: pagamento aprovado, recusado, 3-D Secure, falha de renovação, cancelamento, reembolso e reenvio de webhooks.
5. Configurar o portal do cliente do provedor para troca de cartão (o KeyLingo não coleta dados de cartão).

Decisões em aberto: provedor, preços finais, impostos/nota fiscal, período de teste, política de reembolso e de arrependimento (CDC art. 49 para vendas online — validar com jurídico), prazo de guarda de registros financeiros (hoje não são apagados pela rotina de manutenção) e e-mails transacionais de cobrança.
