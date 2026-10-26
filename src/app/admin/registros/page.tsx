import { Badge, Card, PageHeader, formatDate } from "@/components/ui";
import { getLogs } from "@/lib/server/admin";
import { requireAdmin } from "@/lib/server/auth";

export default async function LogsAdmin() {
  await requireAdmin();
  const { events, audits, emails } = await getLogs();
  return (
    <>
      <PageHeader title="Registros" subtitle="Falhas técnicas, auditoria administrativa e e-mails enviados (últimos registros)." />
      <div className="space-y-6">
        <Card>
          <h2 className="font-bold">Eventos técnicos</h2>
          {events.length ? (
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {events.map((e) => (
                <li key={e.id} className="py-2">
                  <Badge color={e.level === "error" ? "rose" : e.level === "warn" ? "amber" : "slate"}>{e.level}</Badge>{" "}
                  <strong>{e.source}</strong> — {e.message} <span className="text-xs text-slate-500">{formatDate(e.created_at, true)}</span>
                  {e.context ? <pre className="mt-1 max-h-32 overflow-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(e.context, null, 2)}</pre> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Nenhum evento registrado.</p>
          )}
        </Card>
        <Card>
          <h2 className="font-bold">Auditoria</h2>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {audits.map((a) => (
              <li key={a.id} className="py-2">
                <strong>{a.action}</strong> por {a.actor ?? "sistema/conta removida"} {a.target_type && <>em {a.target_type} {a.target_id}</>}{" "}
                <span className="text-xs text-slate-500">{formatDate(a.created_at, true)}</span>
              </li>
            ))}
            {!audits.length && <li className="py-2 text-slate-500">Sem registros.</li>}
          </ul>
        </Card>
        <Card>
          <h2 className="font-bold">E-mails</h2>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {emails.map((m) => (
              <li key={m.id} className="py-2">
                {m.subject} → {m.to_email} <Badge>{m.transport}</Badge> <Badge color={m.status === "failed" ? "rose" : "green"}>{m.status}</Badge>{" "}
                <span className="text-xs text-slate-500">{formatDate(m.created_at, true)}</span>
              </li>
            ))}
            {!emails.length && <li className="py-2 text-slate-500">Nenhum e-mail.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
