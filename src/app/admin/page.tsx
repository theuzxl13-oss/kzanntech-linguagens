import { Card, PageHeader, Stat, formatPercent } from "@/components/ui";
import { getAdminMetrics } from "@/lib/server/admin";
import { requireAdmin } from "@/lib/server/auth";
import { speechStatus } from "@/lib/server/speech";
import { config } from "@/lib/server/config";

const STATUS_PT: Record<string, string> = { draft: "Rascunho", pending_review: "Pendente", approved: "Aprovado", archived: "Arquivado" };

export default async function AdminHome() {
  await requireAdmin();
  const m = await getAdminMetrics();
  const speech = speechStatus();
  const byLang = new Map<string, Record<string, number>>();
  for (const c of m.content) byLang.set(c.language_code, { ...(byLang.get(c.language_code) ?? {}), [c.review_status]: c.n });
  return (
    <>
      <PageHeader title="Métricas de utilização" />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Usuários" value={m.users} hint={`+${m.new_users_7d} nos últimos 7 dias`} />
        <Stat label="Ativos (7 dias)" value={m.active_7d} />
        <Stat label="Sessões (24h / 7d)" value={`${m.sessions_24h} / ${m.sessions_7d}`} hint={`${m.voice_sessions_7d} de voz em 7 dias`} />
        <Stat label="Precisão média (7d)" value={formatPercent(m.avg_accuracy_7d)} />
        <Stat label="Erros técnicos (24h)" value={m.errors_24h} hint="Veja em Registros" />
        <Stat label="Contas suspensas" value={m.suspended} />
      </section>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-bold">Serviços configurados</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              🎙️ Avaliação de voz no servidor: {speech.server.available ? <strong className="text-emerald-700">{speech.server.label}</strong> : <strong className="text-amber-700">não configurada</strong>}
            </li>
            <li>📧 E-mail: <strong>{config.emailTransport}</strong></li>
            <li>
              🌐 IP do cliente (TRUST_PROXY): <strong>{config.trustProxy}</strong>
              {config.trustProxy === "none" && config.isProduction && (
                <span className="block text-amber-700">
                  ⚠️ Em produção atrás de proxy/CDN, configure TRUST_PROXY; sem isso todos os acessos compartilham o mesmo limite por IP.
                </span>
              )}
            </li>
            <li>🏁 Voz avaliada no navegador no ranking: <strong>{speech.clientRankedAllowed ? "permitida (marcada como não verificada)" : "bloqueada"}</strong></li>
          </ul>
        </Card>
        <Card>
          <h2 className="font-bold">Conteúdo por status de revisão</h2>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1">Idioma</th>
                {Object.values(STATUS_PT).map((s) => (
                  <th key={s} className="py-1 text-right">{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...byLang.entries()].map(([lang, counts]) => (
                <tr key={lang} className="border-t border-slate-100">
                  <td className="py-1.5 font-semibold uppercase">{lang}</td>
                  {Object.keys(STATUS_PT).map((s) => (
                    <td key={s} className="py-1.5 text-right">{counts[s] ?? 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <h2 className="font-bold">Sessões por idioma (30 dias)</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {m.popularLanguages.map((l) => (
              <li key={l.code} className="flex justify-between border-b border-slate-100 py-1">
                <span>{l.flag} {l.name_pt}</span>
                <strong>{l.sessions}</strong>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="font-bold">Itens com mais erros (30 dias, mín. 5 respostas)</h2>
          {m.hardestItems.length ? (
            <ul className="mt-3 space-y-1 text-sm">
              {m.hardestItems.map((i) => (
                <li key={i.id} className="flex justify-between border-b border-slate-100 py-1">
                  <a href={`/admin/conteudo/${i.id}`} className="text-brand-700 hover:underline">[{i.language_code}] {i.text}</a>
                  <span>{Math.round((i.wrong / i.total) * 100)}% de erro</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Ainda sem dados suficientes.</p>
          )}
        </Card>
      </div>
    </>
  );
}
