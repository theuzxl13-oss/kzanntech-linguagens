import { describe, expect, it } from "vitest";
import { DEFAULT_ENTITLEMENTS, entitlementsConfigSchema, lessonAllowed, subscriptionGrantsPremium } from "../../src/lib/domain/entitlements";
import { buildPath } from "../../src/lib/domain/lessons";
import { signPayload, verifySignature } from "../../src/lib/server/billing/signature";
import { createSandboxProvider } from "../../src/lib/server/billing/sandbox";

const now = new Date("2026-05-10T12:00:00Z");
const day = 86_400_000;

describe("assinatura de webhook (HMAC)", () => {
  const body = JSON.stringify({ id: "evt_1" });
  const t = Math.floor(now.getTime() / 1000);

  it("aceita assinatura válida dentro da janela", () => {
    expect(() => verifySignature(body, signPayload(body, "s3cr3t", t), "s3cr3t", t + 60)).not.toThrow();
  });
  it("rejeita segredo errado, corpo alterado, ausência e formato inválido", () => {
    const sig = signPayload(body, "s3cr3t", t);
    expect(() => verifySignature(body, signPayload(body, "outro", t), "s3cr3t", t)).toThrow(/inválida/);
    expect(() => verifySignature(body.replace("1", "2"), sig, "s3cr3t", t)).toThrow(/inválida/);
    expect(() => verifySignature(body, null, "s3cr3t", t)).toThrow(/ausente/);
    expect(() => verifySignature(body, "v1=abc", "s3cr3t", t)).toThrow(/malformada/);
    expect(() => verifySignature(body, `t=${t},v1=zz`, "s3cr3t", t)).toThrow(/inválida/);
  });
  it("rejeita reenvio fora da janela de 5 minutos (replay)", () => {
    expect(() => verifySignature(body, signPayload(body, "s3cr3t", t - 301), "s3cr3t", t)).toThrow(/janela/);
    expect(() => verifySignature(body, signPayload(body, "s3cr3t", t + 301), "s3cr3t", t)).toThrow(/janela/);
  });
  it("o adaptador sandbox valida assinatura e formato do evento", () => {
    const p = createSandboxProvider("s3cr3t", "http://localhost");
    const ev = JSON.stringify({ id: "evt_2", type: "invoice.paid", occurredAt: now.toISOString(), subscriptionId: "sub_1" });
    const sig = signPayload(ev, "s3cr3t");
    expect(p.parseWebhook(ev, () => sig)).toMatchObject({ id: "evt_2", type: "invoice.paid", occurredAt: now });
    const bad = JSON.stringify({ id: "evt_3", type: "refund.magic", occurredAt: now.toISOString() });
    expect(() => p.parseWebhook(bad, () => signPayload(bad, "s3cr3t"))).toThrow(/formato/);
  });
});

describe("regras de acesso por plano", () => {
  it("assinatura ativa/cancelada dá acesso até o fim do período; past_due até a tolerância", () => {
    const end = new Date(now.getTime() + day);
    const past = new Date(now.getTime() - day);
    expect(subscriptionGrantsPremium({ status: "active", currentPeriodEnd: end }, now, 3)).toBe(true);
    expect(subscriptionGrantsPremium({ status: "active", currentPeriodEnd: past }, now, 3)).toBe(false);
    expect(subscriptionGrantsPremium({ status: "canceled", currentPeriodEnd: end }, now, 3)).toBe(true);
    expect(subscriptionGrantsPremium({ status: "past_due", currentPeriodEnd: past }, now, 3)).toBe(true);
    expect(subscriptionGrantsPremium({ status: "past_due", currentPeriodEnd: new Date(now.getTime() - 4 * day) }, now, 3)).toBe(false);
    expect(subscriptionGrantsPremium({ status: "incomplete", currentPeriodEnd: end }, now, 3)).toBe(false);
    expect(subscriptionGrantsPremium({ status: "expired", currentPeriodEnd: end }, now, 3)).toBe(false);
    expect(subscriptionGrantsPremium(null, now, 3)).toBe(false);
  });
  it("níveis de lição liberados por plano", () => {
    expect(lessonAllowed("A2", DEFAULT_ENTITLEMENTS.free)).toBe(true);
    expect(lessonAllowed("B1", DEFAULT_ENTITLEMENTS.free)).toBe(false);
    expect(lessonAllowed("C2", DEFAULT_ENTITLEMENTS.premium)).toBe(true);
    expect(lessonAllowed("Z9", DEFAULT_ENTITLEMENTS.premium)).toBe(false);
  });
  it("a trilha marca como premium as lições fora do plano, mesmo já concluídas", () => {
    const units = [
      { unitId: 1, title: "a", icon: "x", level: "A2", levelOrder: 2, itemCount: 3 },
      { unitId: 2, title: "b", icon: "x", level: "B1", levelOrder: 3, itemCount: 3 },
    ];
    const path = buildPath(units, new Map([[1, 1], [2, 1]]), 1, (l) => lessonAllowed(l, DEFAULT_ENTITLEMENTS.free));
    expect(path.map((l) => l.status)).toEqual(["completed", "premium"]);
  });
  it("configuração de limites é validada", () => {
    expect(entitlementsConfigSchema.safeParse(DEFAULT_ENTITLEMENTS).success).toBe(true);
    expect(entitlementsConfigSchema.safeParse({ ...DEFAULT_ENTITLEMENTS, pastDueGraceDays: -1 }).success).toBe(false);
    expect(entitlementsConfigSchema.safeParse({ ...DEFAULT_ENTITLEMENTS, free: { ...DEFAULT_ENTITLEMENTS.free, lessonMaxLevel: "D1" } }).success).toBe(false);
  });
});

describe("provedor configurado", () => {
  it("sandbox nunca é ativado em produção sem a flag explícita de teste", async () => {
    const { getPaymentProvider } = await import("../../src/lib/server/billing");
    const env = { ...process.env };
    try {
      Object.assign(process.env, { BILLING_PROVIDER: "sandbox", AUTH_SECRET: "x".repeat(40), NODE_ENV: "production" });
      delete process.env.ALLOW_SANDBOX_BILLING_IN_PRODUCTION;
      expect(getPaymentProvider()).toBeNull();
      process.env.ALLOW_SANDBOX_BILLING_IN_PRODUCTION = "true";
      expect(getPaymentProvider()?.id).toBe("sandbox");
      Object.assign(process.env, { NODE_ENV: "development", BILLING_PROVIDER: "" });
      expect(getPaymentProvider()).toBeNull();
    } finally {
      process.env = env;
    }
  });
});
