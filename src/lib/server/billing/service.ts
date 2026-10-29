/**
 * Serviço de cobrança. Regras:
 *  - O checkout é criado no servidor e amarrado a (usuário, plano). O navegador nunca informa quem pagou.
 *  - Assinaturas só mudam por eventos de webhook autenticados (assinatura HMAC + janela de tempo).
 *  - Cada evento é processado no máximo uma vez: unicidade (provider, event_id).
 *  - Eventos fora de ordem: cada assinatura guarda `last_event_at`; eventos mais antigos não revertem o estado.
 *    Eventos que chegam antes da assinatura existir ficam "deferred" e são aplicados quando ela é criada.
 *  - Eventos da mesma assinatura são serializados por advisory lock.
 */
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { config } from "../config";
import { query, queryOne, tx } from "../db";
import { getEntitlements } from "../entitlements";
import { badRequest, conflict, notFound } from "../errors";
import { audit, logEvent } from "../events";
import { enforceRateLimit } from "../rate-limit";
import { getPaymentProvider } from "./index";
import { signPayload, SIGNATURE_HEADER } from "./signature";
import { WebhookVerificationError, type BillingEvent, type PaymentProvider } from "./types";

const CHECKOUT_TTL_MINUTES = 60;

export interface PlanRow {
  code: string;
  tier: "free" | "premium";
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  billing_interval: "month" | "year" | null;
}

export async function listPlans(includeInactive = false) {
  return query<PlanRow & { is_active: boolean }>(
    `select code, tier, name, description, price_cents, currency, billing_interval, is_active from plans
      where $1 or is_active order by sort_order, code`,
    [includeInactive],
  );
}

export const checkoutSchema = z.object({ planCode: z.string().regex(/^[a-z0-9_]{2,40}$/) });

/** Cria um checkout no provedor para o usuário logado. Não concede nada: só o webhook de pagamento concede. */
export async function createCheckout(userId: string, planCode: string) {
  await enforceRateLimit(`checkout:${userId}`, 10, 3600);
  const provider = getPaymentProvider();
  if (!provider) throw conflict("billing_unavailable", "Assinaturas ainda não estão disponíveis.");
  const plan = await queryOne<PlanRow>(`select code, tier, name, description, price_cents, currency, billing_interval from plans where code = $1 and is_active`, [planCode]);
  if (!plan || plan.tier !== "premium" || !plan.billing_interval) throw notFound("Plano não encontrado.");
  const ent = await getEntitlements(userId);
  if (ent.subscription?.grantsPremium) throw conflict("already_subscribed", "Você já tem o Premium ativo. Gerencie a assinatura na página de planos.");

  const id = randomUUID();
  const { providerCheckoutId, url } = await provider.createCheckout({
    checkoutSessionId: id,
    planCode: plan.code,
    priceCents: plan.price_cents,
    currency: plan.currency,
    interval: plan.billing_interval,
    successUrl: `${config.appUrl}/planos/retorno?checkout=${id}`,
    cancelUrl: `${config.appUrl}/planos`,
  });
  await query(
    `insert into checkout_sessions (id, user_id, plan_code, provider, provider_checkout_id, expires_at)
     values ($1,$2,$3,$4,$5, now() + make_interval(mins => $6))`,
    [id, userId, plan.code, provider.id, providerCheckoutId, CHECKOUT_TTL_MINUTES],
  );
  return { checkoutId: id, url };
}

export async function getCheckoutStatus(userId: string, checkoutId: string) {
  if (!z.uuid().safeParse(checkoutId).success) throw notFound("Checkout não encontrado.");
  const row = await queryOne<{ status: string; expires_at: Date; plan_name: string }>(
    `select c.status, c.expires_at, p.name as plan_name from checkout_sessions c join plans p on p.code = c.plan_code where c.id = $1 and c.user_id = $2`,
    [checkoutId, userId],
  );
  if (!row) throw notFound("Checkout não encontrado.");
  const status = row.status === "open" && row.expires_at < new Date() ? "expired" : row.status;
  return { status, planName: row.plan_name };
}

// ───────────────────────── Webhooks ─────────────────────────

export type ProcessOutcome = "processed" | "duplicate" | "ignored" | "deferred";

/** Ponto de entrada dos webhooks: autentica, normaliza e processa. Lança WebhookVerificationError se inválido. */
export async function handleWebhook(providerId: string, rawBody: string, headers: (name: string) => string | null) {
  const provider = getPaymentProvider();
  if (!provider || provider.id !== providerId) throw new WebhookVerificationError("Provedor desconhecido.");
  const event = provider.parseWebhook(rawBody, headers);
  return { eventId: event.id, outcome: await processEvent(provider.id, event) };
}

export async function processEvent(provider: string, event: BillingEvent): Promise<ProcessOutcome> {
  return tx(async (c) => {
    if (event.subscriptionId) await c.query(`select pg_advisory_xact_lock(hashtext($1))`, [`billing:${provider}:${event.subscriptionId}`]);
    const inserted = await c.query(
      `insert into payment_events (provider, event_id, type, occurred_at, subscription_ref, payload)
       values ($1,$2,$3,$4,$5,$6) on conflict (provider, event_id) do nothing returning id`,
      [provider, event.id, event.type, event.occurredAt, event.subscriptionId ?? null, JSON.stringify(event)],
    );
    if (!inserted.rowCount) return "duplicate";
    const rowId = inserted.rows[0].id as number;
    const { outcome, error } = await applyEvent(c, provider, event);
    await c.query(`update payment_events set status = $2, error = $3, processed_at = now() where id = $1`, [rowId, outcome, error ?? null]);
    if (outcome === "processed" && event.type === "checkout.completed" && event.subscriptionId) {
      await replayDeferred(c, provider, event.subscriptionId);
    }
    return outcome;
  });
}

type ApplyResult = { outcome: Exclude<ProcessOutcome, "duplicate">; error?: string };

async function applyEvent(c: PoolClient, provider: string, e: BillingEvent): Promise<ApplyResult> {
  if (e.type === "checkout.completed") return applyCheckoutCompleted(c, provider, e);
  if (!e.subscriptionId) return { outcome: "ignored", error: "Evento sem assinatura." };
  const sub = (
    await c.query<{ id: string; user_id: string; status: string; last_event_at: Date; current_period_end: Date | null }>(
      `select id, user_id, status, last_event_at, current_period_end from subscriptions where provider = $1 and provider_subscription_id = $2 for update`,
      [provider, e.subscriptionId],
    )
  ).rows[0];
  // Chegou antes da criação da assinatura (fora de ordem): aplica quando o checkout for concluído
  if (!sub) return { outcome: "deferred" };
  const fresh = e.occurredAt >= sub.last_event_at;

  switch (e.type) {
    case "subscription.updated":
    case "subscription.canceled": {
      if (!fresh) return { outcome: "ignored", error: "Evento mais antigo que o estado atual." };
      const status = e.type === "subscription.canceled" ? "canceled" : (e.status ?? sub.status);
      await c.query(
        `update subscriptions set status = $2,
           current_period_start = coalesce($3, current_period_start), current_period_end = coalesce($4, current_period_end),
           cancel_at_period_end = coalesce($5, cancel_at_period_end),
           canceled_at = case when $2 = 'canceled' then coalesce(canceled_at, $6) else null end,
           last_event_at = $6, updated_at = now()
         where id = $1`,
        [sub.id, status, e.periodStart ?? null, e.periodEnd ?? null, e.type === "subscription.canceled" ? false : (e.cancelAtPeriodEnd ?? null), e.occurredAt],
      );
      return { outcome: "processed" };
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      if (!e.invoiceId || e.amountCents == null || !e.currency) return { outcome: "ignored", error: "Fatura incompleta." };
      const paid = e.type === "invoice.paid";
      await c.query(
        `insert into invoices (user_id, subscription_id, provider, provider_invoice_id, amount_cents, currency, status, period_start, period_end)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict (provider, provider_invoice_id) do update set status = case when invoices.status = 'paid' then 'paid' else excluded.status end, updated_at = now()`,
        [sub.user_id, sub.id, provider, e.invoiceId, e.amountCents, e.currency, paid ? "paid" : "failed", e.periodStart ?? null, e.periodEnd ?? null],
      );
      if (!fresh) return { outcome: "processed" }; // a fatura fica registrada, mas não reverte um estado mais novo
      if (paid) {
        await c.query(
          `update subscriptions set status = case when status in ('past_due','incomplete','active','trialing') then 'active' else status end,
             current_period_start = coalesce($2, current_period_start),
             current_period_end = greatest(current_period_end, coalesce($3, current_period_end)),
             last_event_at = $4, updated_at = now()
           where id = $1`,
          [sub.id, e.periodStart ?? null, e.periodEnd ?? null, e.occurredAt],
        );
      } else {
        await c.query(
          `update subscriptions set status = case when status in ('active','trialing') then 'past_due' else status end, last_event_at = $2, updated_at = now() where id = $1`,
          [sub.id, e.occurredAt],
        );
      }
      return { outcome: "processed" };
    }
  }
  return { outcome: "ignored", error: "Tipo de evento não tratado." };
}

async function applyCheckoutCompleted(c: PoolClient, provider: string, e: BillingEvent): Promise<ApplyResult> {
  if (!e.checkoutId || !e.subscriptionId || !e.periodEnd) return { outcome: "ignored", error: "checkout.completed incompleto." };
  const checkout = (
    await c.query<{ id: string; user_id: string; plan_code: string; status: string }>(
      `select id, user_id, plan_code, status from checkout_sessions where provider = $1 and provider_checkout_id = $2 for update`,
      [provider, e.checkoutId],
    )
  ).rows[0];
  // Só um checkout criado pelo servidor pode gerar assinatura: amarra pagamento ↔ usuário ↔ plano
  if (!checkout) return { outcome: "ignored", error: "Checkout desconhecido." };
  if (checkout.status === "completed") return { outcome: "ignored", error: "Checkout já concluído." };
  // Um pagamento confirmado após a expiração local ainda é honrado (o dinheiro foi cobrado)
  await c.query(
    `insert into subscriptions (user_id, plan_code, provider, provider_customer_id, provider_subscription_id, status,
                                current_period_start, current_period_end, last_event_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (provider, provider_subscription_id) do nothing`,
    [checkout.user_id, checkout.plan_code, provider, e.customerId ?? null, e.subscriptionId, e.status ?? "active", e.periodStart ?? e.occurredAt, e.periodEnd, e.occurredAt],
  );
  await c.query(`update checkout_sessions set status = 'completed', completed_at = now() where id = $1`, [checkout.id]);
  await audit(checkout.user_id, "billing.subscription_started", { type: "subscription", id: e.subscriptionId }, { plan: checkout.plan_code, provider }, null, c);
  return { outcome: "processed" };
}

/** Reaplica, em ordem cronológica, eventos que chegaram antes da assinatura existir. */
async function replayDeferred(c: PoolClient, provider: string, subscriptionRef: string) {
  const pending = await c.query<{ id: number; payload: BillingEvent }>(
    `select id, payload from payment_events where provider = $1 and subscription_ref = $2 and status = 'deferred' order by occurred_at, id`,
    [provider, subscriptionRef],
  );
  for (const row of pending.rows) {
    const p = row.payload as unknown as Record<string, unknown>;
    const event: BillingEvent = {
      ...(row.payload as BillingEvent),
      occurredAt: new Date(p.occurredAt as string),
      periodStart: p.periodStart ? new Date(p.periodStart as string) : undefined,
      periodEnd: p.periodEnd ? new Date(p.periodEnd as string) : undefined,
    };
    const { outcome, error } = await applyEvent(c, provider, event);
    await c.query(`update payment_events set status = $2, error = $3, processed_at = now() where id = $1`, [row.id, outcome, error ?? null]);
  }
}

// ───────────────────────── Gestão pelo assinante ─────────────────────────

export const cancelSchema = z.object({ cancelAtPeriodEnd: z.boolean() });

/** Cancela (ao fim do período) ou reativa. O estado local muda quando o provedor confirma via webhook. */
export async function setCancelAtPeriodEnd(userId: string, cancel: boolean) {
  await enforceRateLimit(`billing-manage:${userId}`, 20, 3600);
  const ent = await getEntitlements(userId);
  const sub = ent.subscription;
  if (!sub || !["active", "trialing", "past_due"].includes(sub.status)) throw notFound("Nenhuma assinatura ativa.");
  if (sub.provider === "manual") throw badRequest("manual_subscription", "Este acesso foi concedido pela equipe e não pode ser alterado aqui.");
  const provider = getPaymentProvider();
  if (!provider || provider.id !== sub.provider) throw conflict("billing_unavailable", "O provedor desta assinatura não está disponível agora.");
  const row = (await queryOne<{ provider_subscription_id: string }>(`select provider_subscription_id from subscriptions where id = $1`, [sub.id]))!;
  await provider.setCancelAtPeriodEnd(row.provider_subscription_id, cancel);
  if (isSandbox(provider)) {
    await emitSandboxEvent(provider, { type: "subscription.updated", subscriptionId: row.provider_subscription_id, cancelAtPeriodEnd: cancel, status: sub.status });
  }
  await audit(userId, cancel ? "billing.cancel_requested" : "billing.reactivated", { type: "subscription", id: sub.id });
  return { ok: true };
}

/**
 * Exclusão de conta: pede ao provedor o fim das cobranças recorrentes. Se o provedor não estiver
 * disponível, a exclusão é interrompida para não deixar uma cobrança órfã.
 */
export async function stopBillingForDeletedAccount(userId: string) {
  const subs = await query<{ provider: string; provider_subscription_id: string }>(
    `select provider, provider_subscription_id from subscriptions
      where user_id = $1 and provider <> 'manual' and status in ('active','trialing','past_due','incomplete') and not cancel_at_period_end`,
    [userId],
  );
  if (!subs.length) return;
  const provider = getPaymentProvider();
  for (const s of subs) {
    if (!provider || provider.id !== s.provider) {
      throw conflict("billing_unavailable", "Não foi possível cancelar a assinatura no provedor agora. Tente novamente mais tarde ou fale com o suporte.");
    }
    await provider.setCancelAtPeriodEnd(s.provider_subscription_id, true);
  }
}

export async function listInvoices(userId: string) {
  return query<{ id: string; amount_cents: number; currency: string; status: string; period_start: Date | null; period_end: Date | null; created_at: Date }>(
    `select id, amount_cents, currency, status, period_start, period_end, created_at from invoices where user_id = $1 order by created_at desc limit 50`,
    [userId],
  );
}

// ───────────────────────── Sandbox ─────────────────────────

function isSandbox(p: PaymentProvider & { secret?: string }): p is PaymentProvider & { secret: string } {
  return p.id === "sandbox" && typeof p.secret === "string";
}

/** Monta, assina e entrega um evento pelo mesmo caminho dos webhooks reais (inclui verificação). */
async function emitSandboxEvent(provider: PaymentProvider & { secret: string }, partial: Omit<BillingEvent, "id" | "occurredAt">) {
  const body = JSON.stringify({ id: `evt_sbx_${randomUUID().replace(/-/g, "")}`, occurredAt: new Date().toISOString(), ...partial });
  const sig = signPayload(body, provider.secret);
  return handleWebhook(provider.id, body, (n) => (n.toLowerCase() === SIGNATURE_HEADER ? sig : null));
}

function sandboxProvider() {
  const p = getPaymentProvider();
  if (!p || !isSandbox(p)) throw notFound("Sandbox de pagamentos desativado.");
  return p;
}

function addInterval(d: Date, interval: "month" | "year") {
  const r = new Date(d);
  if (interval === "year") r.setUTCFullYear(r.getUTCFullYear() + 1);
  else r.setUTCMonth(r.getUTCMonth() + 1);
  return r;
}

export async function getSandboxCheckout(userId: string, providerCheckoutId: string) {
  sandboxProvider();
  return queryOne<{ status: string; expires_at: Date; plan_name: string; price_cents: number; currency: string; billing_interval: "month" | "year" }>(
    `select c.status, c.expires_at, p.name as plan_name, p.price_cents, p.currency, p.billing_interval
       from checkout_sessions c join plans p on p.code = c.plan_code
      where c.provider = 'sandbox' and c.provider_checkout_id = $1 and c.user_id = $2`,
    [providerCheckoutId, userId],
  );
}

export const sandboxCheckoutSchema = z.object({ checkout: z.string().regex(/^cs_sbx_[a-f0-9]{32}$/), outcome: z.enum(["approve", "decline"]) });

/** Simula a decisão do "provedor" sobre o pagamento. Aprovação gera webhooks assinados. */
export async function completeSandboxCheckout(userId: string, input: z.infer<typeof sandboxCheckoutSchema>) {
  const provider = sandboxProvider();
  const checkout = await queryOne<{ id: string; status: string; expires_at: Date; price_cents: number; currency: string; billing_interval: "month" | "year" }>(
    `select c.id, c.status, c.expires_at, p.price_cents, p.currency, p.billing_interval
       from checkout_sessions c join plans p on p.code = c.plan_code
      where c.provider = 'sandbox' and c.provider_checkout_id = $1 and c.user_id = $2`,
    [input.checkout, userId],
  );
  if (!checkout) throw notFound("Checkout não encontrado.");
  if (checkout.status !== "open" || checkout.expires_at < new Date()) throw conflict("checkout_closed", "Este checkout não está mais aberto.");
  if (input.outcome === "decline") {
    await query(`update checkout_sessions set status = 'canceled' where id = $1 and status = 'open'`, [checkout.id]);
    return { ok: true, checkoutId: checkout.id };
  }
  const now = new Date();
  const periodEnd = addInterval(now, checkout.billing_interval);
  const subscriptionId = `sub_sbx_${randomUUID().replace(/-/g, "")}`;
  await emitSandboxEvent(provider, { type: "checkout.completed", checkoutId: input.checkout, subscriptionId, customerId: `cus_sbx_${userId.slice(0, 8)}`, status: "active", periodStart: now, periodEnd });
  await emitSandboxEvent(provider, {
    type: "invoice.paid",
    subscriptionId,
    invoiceId: `in_sbx_${randomUUID().replace(/-/g, "")}`,
    amountCents: checkout.price_cents,
    currency: checkout.currency,
    periodStart: now,
    periodEnd,
  });
  return { ok: true, checkoutId: checkout.id };
}

export const sandboxSimulateSchema = z.object({ action: z.enum(["renew", "payment_failed", "expire"]) });

/** Simula eventos do ciclo de vida (renovação, falha de pagamento, encerramento) na assinatura sandbox do usuário. */
export async function simulateSandboxLifecycle(userId: string, action: z.infer<typeof sandboxSimulateSchema>["action"]) {
  const provider = sandboxProvider();
  await enforceRateLimit(`billing-sandbox:${userId}`, 30, 3600);
  const sub = await queryOne<{ provider_subscription_id: string; current_period_end: Date; price_cents: number; currency: string; billing_interval: "month" | "year" }>(
    `select s.provider_subscription_id, s.current_period_end, p.price_cents, p.currency, p.billing_interval
       from subscriptions s join plans p on p.code = s.plan_code
      where s.user_id = $1 and s.provider = 'sandbox' and s.status in ('active','trialing','past_due')
      order by s.created_at desc limit 1`,
    [userId],
  );
  if (!sub) throw notFound("Nenhuma assinatura sandbox ativa.");
  const invoice = { invoiceId: `in_sbx_${randomUUID().replace(/-/g, "")}`, amountCents: sub.price_cents, currency: sub.currency };
  if (action === "renew") {
    const start = sub.current_period_end;
    await emitSandboxEvent(provider, { type: "invoice.paid", subscriptionId: sub.provider_subscription_id, ...invoice, periodStart: start, periodEnd: addInterval(start, sub.billing_interval) });
  } else if (action === "payment_failed") {
    await emitSandboxEvent(provider, { type: "invoice.payment_failed", subscriptionId: sub.provider_subscription_id, ...invoice });
  } else {
    await emitSandboxEvent(provider, { type: "subscription.canceled", subscriptionId: sub.provider_subscription_id, periodEnd: new Date() });
  }
  return { ok: true };
}

// ───────────────────────── Admin ─────────────────────────

export const grantSchema = z
  .object({
    userId: z.uuid().optional(),
    email: z.email().max(254).optional(),
    days: z.number().int().min(1).max(3650),
    reason: z.string().trim().min(3).max(300),
  })
  .refine((v) => v.userId || v.email, { message: "Informe o usuário." });

/** Concessão manual de Premium (cortesia, suporte). Registrada em auditoria. */
export async function grantManualPremium(input: z.infer<typeof grantSchema>, actorId: string, ip: string | null) {
  const user = await queryOne<{ id: string }>(
    input.userId ? `select id from users where id = $1` : `select id from users where email = lower($1)`,
    [input.userId ?? input.email!.trim()],
  );
  if (!user) throw notFound("Usuário não encontrado.");
  const ref = `manual_${randomUUID()}`;
  await tx(async (c) => {
    await c.query(
      `insert into subscriptions (user_id, plan_code, provider, provider_subscription_id, status, current_period_start, current_period_end)
       values ($1, (select code from plans where tier = 'premium' order by sort_order limit 1), 'manual', $2, 'active', now(), now() + make_interval(days => $3))`,
      [user.id, ref, input.days],
    );
    await audit(actorId, "billing.manual_grant", { type: "user", id: user.id }, { days: input.days, reason: input.reason, ref }, ip, c);
  });
  return { ok: true };
}

export async function revokeManualPremium(subscriptionId: string, actorId: string, ip: string | null) {
  const row = await queryOne<{ user_id: string }>(
    `update subscriptions set status = 'expired', current_period_end = least(current_period_end, now()), updated_at = now()
      where id = $1 and provider = 'manual' and status = 'active' returning user_id`,
    [subscriptionId],
  );
  if (!row) throw notFound("Concessão manual ativa não encontrada.");
  await audit(actorId, "billing.manual_revoke", { type: "subscription", id: subscriptionId }, { userId: row.user_id }, ip);
  return { ok: true };
}

export async function getBillingAdminOverview() {
  const [subs, events, counts] = await Promise.all([
    query<{ id: string; email: string; nickname: string | null; plan_code: string; provider: string; status: string; current_period_end: Date | null; cancel_at_period_end: boolean }>(
      `select s.id, u.email, p.nickname, s.plan_code, s.provider, s.status, s.current_period_end, s.cancel_at_period_end
         from subscriptions s join users u on u.id = s.user_id left join profiles p on p.user_id = s.user_id
        order by s.updated_at desc limit 50`,
    ),
    query<{ id: number; provider: string; event_id: string; type: string; status: string; error: string | null; received_at: Date }>(
      `select id, provider, event_id, type, status, error, received_at from payment_events order by received_at desc limit 50`,
    ),
    queryOne<{ active: number; past_due: number; canceled: number; failed_events: number }>(
      `select count(*) filter (where status in ('active','trialing'))::int as active,
              count(*) filter (where status = 'past_due')::int as past_due,
              count(*) filter (where status = 'canceled')::int as canceled,
              (select count(*) from payment_events where status in ('failed','deferred'))::int as failed_events
         from subscriptions`,
    ),
  ]);
  return { subs, events, counts: counts! };
}

export async function logWebhookFailure(providerId: string, err: unknown) {
  await logEvent("warn", "billing.webhook", (err as Error)?.message ?? String(err), { provider: providerId });
}
