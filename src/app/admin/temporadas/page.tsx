import { ScoringEditor, SeasonForm } from "@/components/admin-client";
import { Badge, Card, PageHeader, formatDate } from "@/components/ui";
import { requireAdmin } from "@/lib/server/auth";
import { ensureActiveSeason, listSeasons } from "@/lib/server/seasons";
import { getScoringRules } from "@/lib/server/settings";

export default async function SeasonsAdmin() {
  await requireAdmin();
  await ensureActiveSeason();
  const [seasons, rules] = await Promise.all([listSeasons(), getScoringRules()]);
  return (
    <>
      <PageHeader title="Temporadas e regras de pontuação" />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <h2 className="font-bold">Temporadas</h2>
            <p className="mt-1 text-sm text-slate-600">Temporadas mensais são criadas automaticamente. Ao encerrar, o placar final é congelado em season_results.</p>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {seasons.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <span>
                    <strong>{s.name}</strong>
                    <span className="block text-slate-500">{formatDate(s.starts_at)} — {formatDate(s.ends_at)}</span>
                  </span>
                  <Badge color={s.status === "active" ? "green" : s.status === "closed" ? "slate" : "sky"}>{s.status === "active" ? "ativa" : s.status === "closed" ? "encerrada" : "agendada"}</Badge>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="mb-3 font-bold">Encerrar temporada atual</h2>
            <SeasonForm />
          </Card>
        </div>
        <Card>
          <h2 className="font-bold">Regras de pontuação (versão {rules.version})</h2>
          <p className="mt-1 mb-3 text-sm text-slate-600">
            Validadas no servidor. Cada alteração cria uma nova versão, registrada em cada sessão e na auditoria. Fórmulas documentadas em docs/SCORING.md.
          </p>
          <ScoringEditor initial={rules} />
        </Card>
      </div>
    </>
  );
}
