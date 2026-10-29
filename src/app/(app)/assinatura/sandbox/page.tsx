import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SandboxCheckout } from "@/components/billing";
import { Alert, Card, PageHeader, formatMoney } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { getSandboxCheckout } from "@/lib/server/billing/service";

export const metadata: Metadata = { title: "Pagamento simulado" };

/** "Checkout hospedado" do provedor sandbox. Existe só com BILLING_PROVIDER=sandbox (nunca em produção). */
export default async function SandboxCheckoutPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const user = await requireUser();
  const { checkout } = await searchParams;
  if (!checkout || !/^cs_sbx_[a-f0-9]{32}$/.test(checkout)) notFound();
  const row = await getSandboxCheckout(user.id, checkout).catch(() => null);
  if (!row) notFound();
  const open = row.status === "open" && row.expires_at > new Date();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Pagamento simulado (sandbox)" />
      <Alert tone="warning" title="Isto não é um pagamento real">
        Esta tela imita o checkout de um provedor de pagamento para testes. Nenhum valor é cobrado e nenhum dado de cartão é pedido.
      </Alert>
      <Card className="space-y-3">
        <p className="text-sm text-slate-600">Plano</p>
        <p className="text-xl font-bold text-slate-900">
          {row.plan_name} — {formatMoney(row.price_cents, row.currency)}/{row.billing_interval === "year" ? "ano" : "mês"}
        </p>
        {open ? <SandboxCheckout checkout={checkout} /> : <Alert tone="info">Este checkout não está mais aberto.</Alert>}
      </Card>
    </div>
  );
}
