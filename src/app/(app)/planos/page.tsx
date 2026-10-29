import type { Metadata } from "next";
import { ManageSubscription, SubscribeButton } from "@/components/billing";
import { Alert, Badge, Card, PageHeader, formatDate, formatMoney } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { billingStatus } from "@/lib/server/billing";
import { listInvoices, listPlans } from "@/lib/server/billing/service";
import { getEntitlements, getEntitlementsConfig, usageToday } from "@/lib/server/entitlements";

export const metadata: Metadata = { title: "Planos" };

const STATUS_LABEL: Record<string, string> = {
  active: "ativa",
  trialing: "em teste",
  past_due: "pagamento pendente",
  canceled: "cancelada",
  expired: "encerrada",
  incomplete: "incompleta",
};

const LEVEL_TEXT: Record<string, string> = { A1: "A1", A2: "A1–A2", B1: "A1–B1", B2: "A1–B2", C1: "A1–C1", C2: "todas (A1–C2)" };

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ recurso?: string; checkout?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [plans, ent, invoices, usage] = await Promise.all([listPlans(), getEntitlements(user.id), listInvoices(user.id), usageToday(user.id, user.timezone)]);
  const billing = billingStatus();
  const sub = ent.subscription;
  const premium = ent.tier === "premium";
  const { free, premium: prem } = await getEntitlementsConfig();

  const features: [string, string, string][] = [
    ["Lições da trilha", LEVEL_TEXT[free.lessonMaxLevel], LEVEL_TEXT[prem.lessonMaxLevel]],
    ["Jogos de digitação e voz, revisão espaçada, metas, conquistas e rankings", "✓", "✓"],
    ["Avaliações de pronúncia no servidor por dia", String(free.voiceAssessmentsPerDay), String(prem.voiceAssessmentsPerDay)],
    ["Áudios gerados no servidor por dia", String(free.ttsPerDay), String(prem.ttsPerDay)],
    ["Estatísticas detalhadas", free.detailedStats ? "✓" : "—", prem.detailedStats ? "✓" : "—"],
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Plano e assinatura" subtitle="O plano Grátis continua completo para começar; o Premium libera os níveis avançados e mais recursos de voz." />

      {sp.recurso === "licoes" && !premium && <Alert tone="info" title="Lição do Premium">Essa lição faz parte dos níveis avançados, liberados no plano Premium.</Alert>}
      {sp.recurso === "estatisticas" && !premium && <Alert tone="info" title="Recurso do Premium">As estatísticas detalhadas fazem parte do plano Premium.</Alert>}
      {sp.checkout === "recusado" && <Alert tone="warning">Pagamento não concluído. Nenhuma cobrança foi registrada.</Alert>}

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-slate-900">Seu plano: {premium ? "Premium" : "Grátis"}</h2>
          {sub && <Badge color={sub.grantsPremium ? "green" : "slate"}>{sub.planName} · {STATUS_LABEL[sub.status] ?? sub.status}</Badge>}
          {sub?.provider === "manual" && <Badge color="sky">concedido pela equipe</Badge>}
        </div>
        {sub?.grantsPremium && sub.currentPeriodEnd && (
          <p className="text-sm text-slate-600">
            {sub.status === "past_due"
              ? "O último pagamento falhou. Atualize o meio de pagamento no provedor para não perder o acesso."
              : sub.cancelAtPeriodEnd || sub.status === "canceled" || sub.provider === "manual"
                ? `Acesso Premium até ${formatDate(sub.currentPeriodEnd, false, user.timezone)}.`
                : `Renova em ${formatDate(sub.currentPeriodEnd, false, user.timezone)}.`}
          </p>
        )}
        <p className="text-sm text-slate-600">
          Uso hoje: {usage.voice_assessment ?? 0}/{ent.limits.voiceAssessmentsPerDay} avaliações de pronúncia · {usage.tts ?? 0}/{ent.limits.ttsPerDay} áudios do servidor.
        </p>
        {sub?.grantsPremium && (
          <ManageSubscription
            cancelAtPeriodEnd={sub.cancelAtPeriodEnd}
            canManage={sub.provider !== "manual" && ["active", "trialing", "past_due"].includes(sub.status)}
            sandbox={billing.available && billing.sandbox && sub.provider === "sandbox"}
          />
        )}
      </Card>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <caption className="sr-only">Comparação entre os planos Grátis e Premium</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left">
              <th scope="col" className="py-2 pr-4 font-semibold text-slate-600">Recurso</th>
              <th scope="col" className="py-2 pr-4 font-semibold text-slate-900">Grátis</th>
              <th scope="col" className="py-2 font-semibold text-slate-900">Premium</th>
            </tr>
          </thead>
          <tbody>
            {features.map(([label, a, b]) => (
              <tr key={label} className="border-b border-slate-100">
                <th scope="row" className="py-2 pr-4 text-left font-normal text-slate-700">{label}</th>
                <td className="py-2 pr-4">{a}</td>
                <td className="py-2 font-semibold">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!premium && (
        <section aria-labelledby="assinar" className="space-y-3">
          <h2 id="assinar" className="text-lg font-bold text-slate-900">Assinar o Premium</h2>
          {!billing.available ? (
            <Alert tone="info">As assinaturas ainda não estão disponíveis. Enquanto isso, todo o plano Grátis continua liberado.</Alert>
          ) : (
            <>
              {billing.sandbox && (
                <Alert tone="warning" title="Ambiente de teste">
                  Pagamentos simulados (sandbox): nenhuma cobrança real é feita e nenhum dado de cartão é pedido.
                </Alert>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {plans
                  .filter((p) => p.tier === "premium" && p.billing_interval)
                  .map((p) => (
                    <Card key={p.code} className="flex flex-col gap-3">
                      <div>
                        <h3 className="font-bold text-slate-900">{p.name}</h3>
                        <p className="text-sm text-slate-600">{p.description}</p>
                      </div>
                      <p className="text-2xl font-extrabold text-slate-900">
                        {formatMoney(p.price_cents, p.currency)}
                        <span className="text-sm font-medium text-slate-500">/{p.billing_interval === "year" ? "ano" : "mês"}</span>
                      </p>
                      <SubscribeButton planCode={p.code} label={`Assinar ${p.name}`} />
                    </Card>
                  ))}
              </div>
              <p className="text-xs text-slate-500">Cancele quando quiser: o acesso continua até o fim do período pago. Os dados de pagamento ficam com o provedor; o KeyLingo não armazena dados de cartão.</p>
            </>
          )}
        </section>
      )}

      {invoices.length > 0 && (
        <section aria-labelledby="faturas" className="space-y-2">
          <h2 id="faturas" className="text-lg font-bold text-slate-900">Histórico de cobranças</h2>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span>{formatDate(i.created_at, false, user.timezone)}</span>
                <span className="font-semibold">{formatMoney(i.amount_cents, i.currency)}</span>
                <Badge color={i.status === "paid" ? "green" : i.status === "failed" ? "rose" : "slate"}>
                  {i.status === "paid" ? "pago" : i.status === "failed" ? "falhou" : i.status === "refunded" ? "reembolsado" : "em aberto"}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
