import type { Metadata } from "next";
import { CheckoutReturn } from "@/components/billing";
import { ButtonLink, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Confirmando pagamento" };

export default async function CheckoutReturnPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  await requireUser();
  const { checkout } = await searchParams;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Confirmando seu pagamento" />
      {checkout ? <CheckoutReturn checkoutId={checkout} /> : null}
      <ButtonLink href="/planos" variant="secondary">
        Ver meu plano
      </ButtonLink>
    </div>
  );
}
