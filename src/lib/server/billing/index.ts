import { createHmac } from "node:crypto";
import { config } from "../config";
import { createSandboxProvider } from "./sandbox";
import type { PaymentProvider } from "./types";

export * from "./types";

/**
 * Provedor de pagamento configurado.
 *  - BILLING_PROVIDER=sandbox: simulado, para desenvolvimento/testes. Bloqueado em produção, exceto com
 *    ALLOW_SANDBOX_BILLING_IN_PRODUCTION=true (somente para E2E contra o build de produção).
 *  - Sem provedor: assinaturas indisponíveis (a interface informa).
 * Um provedor real (Stripe, Mercado Pago…) deve implementar PaymentProvider e ser registrado aqui.
 */
export function getPaymentProvider(): (PaymentProvider & { secret?: string }) | null {
  if (process.env.BILLING_PROVIDER !== "sandbox") return null;
  if (config.isProduction && process.env.ALLOW_SANDBOX_BILLING_IN_PRODUCTION !== "true") return null;
  const secret = process.env.BILLING_WEBHOOK_SECRET || createHmac("sha256", config.authSecret).update("billing-sandbox").digest("hex");
  return createSandboxProvider(secret, config.appUrl);
}

export function billingStatus() {
  const p = getPaymentProvider();
  return p ? { available: true, provider: p.id, label: p.label, sandbox: p.id === "sandbox" } : { available: false as const };
}
