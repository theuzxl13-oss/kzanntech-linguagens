import { EntitlementsEditor, GrantPremiumForm, RevokeGrantButton } from "@/components/admin-client";
import { Alert, Badge, Card, PageHeader, Stat, formatDate, formatMoney } from "@/components/ui";
import { requireAdmin } from "@/lib/server/auth";
import { billingStatus } from "@/lib/server/billing";
import { getBillingAdminOverview, listPlans } from "@/lib/server/billing/service";
import { getEntitlementsConfig } from "@/lib/server/entitlements";

export default async function BillingAdmin() {
  await requireAdmin();
  const [overview, plans, cfg] = await Promise.all([getBillingAdminOverview(), listPlans(true), getEntitlementsConfig()]);
  const billing = billingStatus();
  return (
    <>
      <PageHeader title="Planos e assinaturas" subtitle="Estado vindo dos webhooks do provedor de pagamento. Concessões manuais ficam na auditoria." />
      {!billing.available ? (
        <Alert tone="warning" title="Nenhum provedor de pagamento configurado">
          Assinaturas estão indisponíveis para os usuários. Configure um provedor (ver docs/BILLING.md). Concessões manuais continuam funcionando.
        </Alert>
      ) : billing.sandbox ? (
        <Alert tone="warning" title="Provedor sandbox ativo">Pagamentos simulados. Não use em produção.</Alert>
      ) : null}

      <div className="my-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Ativas" value={overview.counts.active} />
        <Stat label="Pagamento pendente" value={overview.counts.past_due} />
        <Stat label="Canceladas" value={overview.counts.canceled} />
        <Stat label="Eventos com falha/adiados" value={overview.counts.failed_events} />
      </div>

      <Card className="mb-4 space-y-3">
        <h2 className="font-bold">Conceder Premium manualmente</h2>
        <GrantPremiumForm />
      </Card>

      <Card className="mb-4 overflow-x-auto p-0">
        <h2 className="px-3 pt-3 font-bold">Assinaturas recentes</h2>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Usuário</th><th className="px-3 py-2">Plano</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Fim do período</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {overview.subs.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2"><strong>{s.nickname ?? "—"}</strong><p className="text-slate-500">{s.email}</p></td>
                <td className="px-3 py-2">{s.plan_code} <Badge>{s.provider}</Badge></td>
                <td className="px-3 py-2"><Badge color={s.status === "active" ? "green" : s.status === "past_due" ? "amber" : "slate"}>{s.status}</Badge>{s.cancel_at_period_end && <span className="ml-1 text-xs text-slate-500">cancela no fim</span>}</td>
                <td className="px-3 py-2">{s.current_period_end ? formatDate(s.current_period_end, true) : "—"}</td>
                <td className="px-3 py-2">{s.provider === "manual" && s.status === "active" && <RevokeGrantButton id={s.id} />}</td>
              </tr>
            ))}
            {!overview.subs.length && <tr><td colSpan={5} className="px-3 py-4 text-slate-500">Nenhuma assinatura ainda.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card className="mb-4 overflow-x-auto p-0">
        <h2 className="px-3 pt-3 font-bold">Eventos de pagamento (webhooks)</h2>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Recebido</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Detalhe</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {overview.events.map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-2">{formatDate(e.received_at, true)}</td>
                <td className="px-3 py-2">{e.type} <span className="text-xs text-slate-400">{e.provider}</span></td>
                <td className="px-3 py-2"><Badge color={e.status === "processed" ? "green" : e.status === "failed" ? "rose" : "slate"}>{e.status}</Badge></td>
                <td className="px-3 py-2 text-xs text-slate-500">{e.error ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-bold">Catálogo de planos</h2>
          <ul className="space-y-1 text-sm">
            {plans.map((p) => (
              <li key={p.code} className="flex justify-between gap-2">
                <span>{p.name} <span className="text-slate-400">({p.code})</span> {!p.is_active && <Badge>inativo</Badge>}</span>
                <span>{p.price_cents ? `${formatMoney(p.price_cents, p.currency)}/${p.billing_interval === "year" ? "ano" : "mês"}` : "grátis"}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Preços são definidos na migração/banco e precisam corresponder aos preços cadastrados no provedor.</p>
        </Card>
        <Card>
          <h2 className="mb-2 font-bold">Limites por plano</h2>
          <EntitlementsEditor initial={cfg} />
        </Card>
      </div>
    </>
  );
}
