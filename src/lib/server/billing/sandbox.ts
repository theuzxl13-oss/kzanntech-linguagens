/**
 * Provedor SANDBOX — simula um provedor de pagamento para desenvolvimento e testes.
 * O "checkout hospedado" é a página /assinatura/sandbox do próprio app (claramente identificada),
 * e a aprovação gera um webhook ASSINADO que passa pela mesma verificação de um provedor real.
 * Nunca é ativado em produção (ver billing/index.ts).
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { SIGNATURE_HEADER, verifySignature } from "./signature";
import { WebhookVerificationError, type BillingEvent, type PaymentProvider } from "./types";

const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.enum(["checkout.completed", "subscription.updated", "subscription.canceled", "invoice.paid", "invoice.payment_failed"]),
  occurredAt: z.coerce.date(),
  checkoutId: z.string().max(200).optional(),
  subscriptionId: z.string().max(200).optional(),
  customerId: z.string().max(200).optional(),
  status: z.enum(["trialing", "active", "past_due", "canceled", "expired", "incomplete"]).optional(),
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
  invoiceId: z.string().max(200).optional(),
  amountCents: z.number().int().min(0).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
});

export function createSandboxProvider(secret: string, appUrl: string): PaymentProvider & { secret: string } {
  return {
    id: "sandbox",
    label: "Sandbox (pagamentos simulados)",
    secret,
    async createCheckout() {
      const providerCheckoutId = `cs_sbx_${randomUUID().replace(/-/g, "")}`;
      return { providerCheckoutId, url: `${appUrl}/assinatura/sandbox?checkout=${providerCheckoutId}` };
    },
    parseWebhook(rawBody, headers): BillingEvent {
      verifySignature(rawBody, headers(SIGNATURE_HEADER), secret);
      let data: unknown;
      try {
        data = JSON.parse(rawBody);
      } catch {
        throw new WebhookVerificationError("Corpo do webhook inválido.");
      }
      const parsed = eventSchema.safeParse(data);
      if (!parsed.success) throw new WebhookVerificationError("Evento em formato inesperado.");
      return parsed.data;
    },
    async setCancelAtPeriodEnd() {
      // No sandbox, o "provedor" responde emitindo o webhook correspondente (ver service.ts).
    },
  };
}
