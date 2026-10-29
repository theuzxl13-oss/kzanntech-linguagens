import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEFAULT_ENTITLEMENTS } from "../../src/lib/domain/entitlements";
import { signPayload } from "../../src/lib/server/billing/signature";
import {
  completeSandboxCheckout,
  createCheckout,
  getCheckoutStatus,
  grantManualPremium,
  handleWebhook,
  listInvoices,
  revokeManualPremium,
  setCancelAtPeriodEnd,
  simulateSandboxLifecycle,
} from "../../src/lib/server/billing/service";
import { selectLanguage } from "../../src/lib/server/content";
import { query, queryOne } from "../../src/lib/server/db";
import { consumeQuota, getEntitlements, saveEntitlementsConfig } from "../../src/lib/server/entitlements";
import { getLearningPath, getLesson } from "../../src/lib/server/lessons";
import { makeUser } from "./helpers";

const SECRET = "test-billing-webhook-secret";

function send(event: Record<string, unknown>, opts: { secret?: string; ts?: number; provider?: string } = {}) {
  const body = JSON.stringify({ id: `evt_${randomUUID()}`, occurredAt: new Date().toISOString(), ...event });
  const sig = signPayload(body, opts.secret ?? SECRET, opts.ts);
  return handleWebhook(opts.provider ?? "sandbox", body, (n) => (n === "x-keylingo-signature" ? sig : null));
}

function sendRaw(body: string) {
  const sig = signPayload(body, SECRET);
  return handleWebhook("sandbox", body, (n) => (n === "x-keylingo-signature" ? sig : null));
}

async function openCheckout(userId: string, plan = "premium_monthly") {
  const { checkoutId, url } = await createCheckout(userId, plan);
  const providerCheckoutId = new URL(url).searchParams.get("checkout")!;
  return { checkoutId, providerCheckoutId };
}

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

describe("Planos e assinaturas", () => {
  it("usuário sem assinatura é Grátis: lições acima de A2 aparecem como Premium e não abrem", async () => {
    const u = await makeUser();
    await selectLanguage(u.id, "es", "B1");
    const ent = await getEntitlements(u.id);
    expect(ent).toMatchObject({ tier: "free", subscription: null });
    const { lessons } = await getLearningPath(u.id, "es");
    const b1 = lessons.find((l) => l.level === "B1")!;
    expect(b1.status).toBe("premium");
    expect(lessons.filter((l) => l.level === "A1").every((l) => l.status !== "premium")).toBe(true);
    await expect(getLesson(u.id, b1.unitId)).rejects.toMatchObject({ status: 402, code: "plan_required" });
  });

  it("criar checkout ou voltar da página de pagamento não concede nada", async () => {
    const u = await makeUser();
    const { checkoutId } = await openCheckout(u.id);
    expect((await getEntitlements(u.id)).tier).toBe("free");
    expect(await getCheckoutStatus(u.id, checkoutId)).toMatchObject({ status: "open" });
    const other = await makeUser();
    await expect(getCheckoutStatus(other.id, checkoutId)).rejects.toMatchObject({ status: 404 });
  });

  it("pagamento aprovado (webhooks assinados) ativa o Premium e registra a fatura", async () => {
    const u = await makeUser();
    await selectLanguage(u.id, "es", "A1");
    const { checkoutId, providerCheckoutId } = await openCheckout(u.id);
    await completeSandboxCheckout(u.id, { checkout: providerCheckoutId, outcome: "approve" });
    const ent = await getEntitlements(u.id);
    expect(ent.tier).toBe("premium");
    expect(ent.limits).toEqual(DEFAULT_ENTITLEMENTS.premium);
    expect(ent.subscription).toMatchObject({ status: "active", planCode: "premium_monthly", cancelAtPeriodEnd: false });
    expect(await getCheckoutStatus(u.id, checkoutId)).toMatchObject({ status: "completed" });
    expect(await listInvoices(u.id)).toMatchObject([{ amount_cents: 2990, currency: "BRL", status: "paid" }]);
    expect((await getLearningPath(u.id, "es")).lessons.some((l) => l.status === "premium")).toBe(false);
    // Não dá para assinar de novo nem reaproveitar o checkout
    await expect(createCheckout(u.id, "premium_yearly")).rejects.toMatchObject({ code: "already_subscribed" });
    await expect(completeSandboxCheckout(u.id, { checkout: providerCheckoutId, outcome: "approve" })).rejects.toMatchObject({ code: "checkout_closed" });
  });

  it("pagamento recusado não concede nada; outro usuário não conclui checkout alheio", async () => {
    const u = await makeUser();
    const other = await makeUser();
    const { providerCheckoutId } = await openCheckout(u.id);
    await expect(completeSandboxCheckout(other.id, { checkout: providerCheckoutId, outcome: "approve" })).rejects.toMatchObject({ status: 404 });
    await completeSandboxCheckout(u.id, { checkout: providerCheckoutId, outcome: "decline" });
    expect((await getEntitlements(u.id)).tier).toBe("free");
    expect((await getEntitlements(other.id)).tier).toBe("free");
  });

  it("webhook com assinatura forjada, expirada (replay) ou provedor desconhecido é rejeitado sem efeito", async () => {
    const u = await makeUser();
    const { providerCheckoutId } = await openCheckout(u.id);
    const ev = { type: "checkout.completed", checkoutId: providerCheckoutId, subscriptionId: `sub_${randomUUID()}`, periodEnd: inDays(30) };
    await expect(send(ev, { secret: "segredo-errado" })).rejects.toThrow(/inválida/);
    await expect(send(ev, { ts: Math.floor(Date.now() / 1000) - 3600 })).rejects.toThrow(/janela/);
    await expect(send(ev, { provider: "stripe" })).rejects.toThrow(/desconhecido/);
    await expect(handleWebhook("sandbox", JSON.stringify(ev), () => null)).rejects.toThrow(/ausente/);
    await expect(sendRaw("não é json")).rejects.toThrow();
    expect((await getEntitlements(u.id)).tier).toBe("free");
    const n = await queryOne<{ n: number }>(`select count(*)::int as n from subscriptions where user_id = $1`, [u.id]);
    expect(n!.n).toBe(0);
  });

  it("evento duplicado e entregas concorrentes do mesmo evento são processados uma única vez", async () => {
    const u = await makeUser();
    const { providerCheckoutId } = await openCheckout(u.id);
    const subId = `sub_${randomUUID()}`;
    const body = JSON.stringify({ id: `evt_${randomUUID()}`, type: "checkout.completed", occurredAt: new Date().toISOString(), checkoutId: providerCheckoutId, subscriptionId: subId, periodEnd: inDays(30) });
    const results = await Promise.all(Array.from({ length: 6 }, () => sendRaw(body)));
    expect(results.filter((r) => r.outcome === "processed")).toHaveLength(1);
    expect(results.filter((r) => r.outcome === "duplicate")).toHaveLength(5);
    const subs = await query(`select 1 from subscriptions where user_id = $1`, [u.id]);
    expect(subs).toHaveLength(1);
    // Fatura entregue duas vezes (eventos distintos com o mesmo invoiceId) também não duplica
    const inv = { type: "invoice.paid", subscriptionId: subId, invoiceId: `in_${randomUUID()}`, amountCents: 2990, currency: "BRL" };
    await send(inv);
    await send(inv);
    expect(await listInvoices(u.id)).toHaveLength(1);
  });

  it("checkout que o servidor não criou não gera assinatura", async () => {
    const u = await makeUser();
    const r = await send({ type: "checkout.completed", checkoutId: "cs_sbx_inventado", subscriptionId: `sub_${randomUUID()}`, periodEnd: inDays(30) });
    expect(r.outcome).toBe("ignored");
    expect((await getEntitlements(u.id)).tier).toBe("free");
  });

  it("eventos fora de ordem: chega antes da assinatura (adiado) e evento antigo não reverte estado novo", async () => {
    const u = await makeUser();
    const { providerCheckoutId } = await openCheckout(u.id);
    const subId = `sub_${randomUUID()}`;
    const t0 = Date.now();
    // Atualização (cancelar ao fim do período) emitida depois, mas entregue antes do checkout
    const early = await send({ type: "subscription.updated", subscriptionId: subId, status: "active", cancelAtPeriodEnd: true, occurredAt: new Date(t0 + 2000).toISOString() });
    expect(early.outcome).toBe("deferred");
    const done = await send({ type: "checkout.completed", checkoutId: providerCheckoutId, subscriptionId: subId, periodEnd: inDays(30), occurredAt: new Date(t0).toISOString() });
    expect(done.outcome).toBe("processed");
    let ent = await getEntitlements(u.id);
    expect(ent.subscription).toMatchObject({ status: "active", cancelAtPeriodEnd: true });
    const ev = await queryOne<{ status: string }>(`select status from payment_events where subscription_ref = $1 and type = 'subscription.updated'`, [subId]);
    expect(ev!.status).toBe("processed");
    // Falha de pagamento antiga (anterior ao último evento) registra a fatura mas não muda o status
    const stale = await send({ type: "invoice.payment_failed", subscriptionId: subId, invoiceId: `in_${randomUUID()}`, amountCents: 2990, currency: "BRL", occurredAt: new Date(t0 + 1000).toISOString() });
    expect(stale.outcome).toBe("processed");
    ent = await getEntitlements(u.id);
    expect(ent.subscription!.status).toBe("active");
    const staleUpdate = await send({ type: "subscription.updated", subscriptionId: subId, status: "expired", occurredAt: new Date(t0 + 500).toISOString() });
    expect(staleUpdate.outcome).toBe("ignored");
    expect((await getEntitlements(u.id)).tier).toBe("premium");
  });

  it("falha de pagamento: past_due mantém o acesso durante a tolerância e perde depois; renovação recupera", async () => {
    const u = await makeUser();
    const { providerCheckoutId } = await openCheckout(u.id);
    await completeSandboxCheckout(u.id, { checkout: providerCheckoutId, outcome: "approve" });
    await simulateSandboxLifecycle(u.id, "payment_failed");
    let ent = await getEntitlements(u.id);
    expect(ent.subscription!.status).toBe("past_due");
    expect(ent.tier).toBe("premium");
    // Período terminou há mais tempo que a tolerância
    await query(`update subscriptions set current_period_end = now() - interval '5 days' where user_id = $1`, [u.id]);
    ent = await getEntitlements(u.id);
    expect(ent.tier).toBe("free");
    await simulateSandboxLifecycle(u.id, "renew");
    ent = await getEntitlements(u.id);
    expect(ent).toMatchObject({ tier: "premium", subscription: { status: "active" } });
    expect((await listInvoices(u.id)).map((i) => i.status).sort()).toEqual(["failed", "paid", "paid"]);
  });

  it("cancelar ao fim do período mantém o acesso até o fim; reativar desfaz; encerramento remove", async () => {
    const u = await makeUser();
    const { providerCheckoutId } = await openCheckout(u.id);
    await completeSandboxCheckout(u.id, { checkout: providerCheckoutId, outcome: "approve" });
    await setCancelAtPeriodEnd(u.id, true);
    expect((await getEntitlements(u.id)).subscription).toMatchObject({ cancelAtPeriodEnd: true, grantsPremium: true });
    await setCancelAtPeriodEnd(u.id, false);
    expect((await getEntitlements(u.id)).subscription).toMatchObject({ cancelAtPeriodEnd: false });
    await simulateSandboxLifecycle(u.id, "expire");
    const ent = await getEntitlements(u.id);
    expect(ent.tier).toBe("free");
    expect(ent.subscription!.status).toBe("canceled");
    await expect(setCancelAtPeriodEnd(u.id, true)).rejects.toMatchObject({ status: 404 });
  });

  it("cota diária é atômica sob concorrência e depende do plano", async () => {
    const u = await makeUser();
    await saveEntitlementsConfig({ ...DEFAULT_ENTITLEMENTS, free: { ...DEFAULT_ENTITLEMENTS.free, voiceAssessmentsPerDay: 3 } }, u.id);
    try {
      const results = await Promise.allSettled(Array.from({ length: 10 }, () => consumeQuota(u.id, "voice_assessment")));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
      const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason).toMatchObject({ status: 429, code: "plan_limit" });
      await grantManualPremium({ userId: u.id, days: 30, reason: "teste de cota" }, u.id, null);
      await expect(consumeQuota(u.id, "voice_assessment")).resolves.toMatchObject({ used: 4, limit: DEFAULT_ENTITLEMENTS.premium.voiceAssessmentsPerDay });
    } finally {
      await query(`delete from app_settings where key = 'entitlements'`);
      await saveEntitlementsConfig(DEFAULT_ENTITLEMENTS, u.id);
    }
  });

  it("concessão manual pelo admin é auditada, não pode ser cancelada pelo usuário e pode ser revogada", async () => {
    const admin = await makeUser();
    const u = await makeUser();
    await grantManualPremium({ userId: u.id, days: 7, reason: "cortesia para professor parceiro" }, admin.id, "127.0.0.1");
    const ent = await getEntitlements(u.id);
    expect(ent).toMatchObject({ tier: "premium", subscription: { provider: "manual" } });
    await expect(setCancelAtPeriodEnd(u.id, true)).rejects.toMatchObject({ code: "manual_subscription" });
    const log = await queryOne(`select 1 from audit_logs where actor_id = $1 and action = 'billing.manual_grant' and target_id = $2`, [admin.id, u.id]);
    expect(log).toBeTruthy();
    await revokeManualPremium(ent.subscription!.id, admin.id, null);
    expect((await getEntitlements(u.id)).tier).toBe("free");
  });
});
