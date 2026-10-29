/** Contrato entre o KeyLingo e um provedor de pagamento (sandbox hoje; Stripe/Mercado Pago no futuro). */

export type BillingEventType =
  | "checkout.completed"
  | "subscription.updated"
  | "subscription.canceled"
  | "invoice.paid"
  | "invoice.payment_failed";

/** Evento normalizado: o serviço de cobrança só conhece este formato, nunca o payload bruto do provedor. */
export interface BillingEvent {
  id: string; // id do evento no provedor (deduplicação)
  type: BillingEventType;
  occurredAt: Date;
  checkoutId?: string;
  subscriptionId?: string;
  customerId?: string;
  status?: "trialing" | "active" | "past_due" | "canceled" | "expired" | "incomplete";
  periodStart?: Date;
  periodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  invoiceId?: string;
  amountCents?: number;
  currency?: string;
}

export interface CheckoutRequest {
  checkoutSessionId: string; // id interno (amarra usuário + plano)
  planCode: string;
  priceCents: number;
  currency: string;
  interval: "month" | "year";
  successUrl: string;
  cancelUrl: string;
}

export interface PaymentProvider {
  id: string;
  label: string;
  /** Cria o checkout hospedado pelo provedor e devolve a URL para redirecionar o usuário. */
  createCheckout(req: CheckoutRequest): Promise<{ providerCheckoutId: string; url: string }>;
  /** Valida a autenticidade do webhook (assinatura + janela de tempo) e normaliza o evento. */
  parseWebhook(rawBody: string, headers: (name: string) => string | null): BillingEvent;
  /** Pede ao provedor o cancelamento (ou reativação) ao fim do período. O estado local muda via webhook. */
  setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<void>;
}

export class WebhookVerificationError extends Error {}
