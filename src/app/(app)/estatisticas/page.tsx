import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, EmptyState, ButtonLink, PageHeader, formatDate, formatPercent } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { getEntitlements } from "@/lib/server/entitlements";
import { getDetailedStats } from "@/lib/server/stats";

export const metadata: Metadata = { title: "Estatísticas" };

const MODE: Record<string, string> = { typing: "Digitação", voice: "Voz" };
const FORMAT: Record<string, string> = { translate: "Tradução", write: "Escrita", listen: "Escuta", mixed: "Misto", speak: "Fala" };
const RESULT: Record<string, string> = { correct: "Corretas", accent: "Acento", typo: "Erro de digitação", wrong: "Erradas", skipped: "Puladas" };

export default async function StatsPage() {
  const user = await requireUser();
  const ent = await getEntitlements(user.id);
  if (!ent.limits.detailedStats) redirect("/planos?recurso=estatisticas");
  const s = await getDetailedStats(user.id);
  const totalAnswers = s.byResult.reduce((a, r) => a + r.n, 0);

  if (!s.byMode.length && !s.lessons.length) {
    return (
      <div className="space-y-6">
        <PageHeader title="Estatísticas detalhadas" />
        <EmptyState icon="📊" title="Ainda sem dados" action={<ButtonLink href="/aprender">Começar uma lição</ButtonLink>}>
          Faça lições e sessões de jogo para ver aqui sua evolução por modalidade, os itens mais difíceis e o ritmo semanal.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Estatísticas detalhadas" subtitle="Últimos 30 dias, salvo indicação." />

      <Card>
        <h2 className="mb-3 font-bold text-slate-900">Desempenho por modalidade</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b text-left text-slate-600">
                <th scope="col" className="py-1.5 pr-3">Idioma</th>
                <th scope="col" className="py-1.5 pr-3">Modalidade</th>
                <th scope="col" className="py-1.5 pr-3">Sessões</th>
                <th scope="col" className="py-1.5 pr-3">Acerto</th>
                <th scope="col" className="py-1.5">Pontuação média</th>
              </tr>
            </thead>
            <tbody>
              {s.byMode.map((r) => (
                <tr key={`${r.language_code}-${r.mode}-${r.format}`} className="border-b border-slate-100">
                  <td className="py-1.5 pr-3 uppercase">{r.language_code}</td>
                  <td className="py-1.5 pr-3">{MODE[r.mode] ?? r.mode} · {FORMAT[r.format] ?? r.format}</td>
                  <td className="py-1.5 pr-3">{r.sessions}</td>
                  <td className="py-1.5 pr-3">{formatPercent(r.accuracy)}</td>
                  <td className="py-1.5">{r.avg_score != null ? Math.round(r.avg_score) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold text-slate-900">Tipos de resposta</h2>
          <ul className="space-y-1 text-sm">
            {s.byResult.map((r) => (
              <li key={r.result} className="flex justify-between">
                <span>{RESULT[r.result] ?? r.result}</span>
                <span className="font-semibold">
                  {r.n} ({formatPercent(totalAnswers ? r.n / totalAnswers : 0)})
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold text-slate-900">Lições concluídas por nível</h2>
          <ul className="space-y-1 text-sm">
            {s.lessons.map((l) => (
              <li key={l.level_code} className="flex justify-between">
                <span>{l.level_code}</span>
                <span className="font-semibold">
                  {l.done} · melhor acerto médio {formatPercent(l.avg_accuracy)}
                </span>
              </li>
            ))}
            {!s.lessons.length && <li className="text-slate-500">Nenhuma lição concluída ainda.</li>}
          </ul>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 font-bold text-slate-900">Ritmo semanal (8 semanas)</h2>
        <ul className="space-y-1 text-sm">
          {s.weekly.map((w) => (
            <li key={String(w.week)} className="flex justify-between">
              <span>Semana de {formatDate(w.week, false, user.timezone)}</span>
              <span className="font-semibold">
                {w.sessions} sessões · {w.answers} respostas · {formatPercent(w.answers ? w.correct / w.answers : 0)} de acerto
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-1 font-bold text-slate-900">Itens que mais precisam de atenção (90 dias)</h2>
        <p className="mb-3 text-sm text-slate-600">Eles voltam com mais frequência na revisão espaçada.</p>
        {s.hardest.length ? (
          <ol className="space-y-1 text-sm">
            {s.hardest.map((h) => (
              <li key={`${h.language_code}-${h.text}`} className="flex flex-wrap justify-between gap-2">
                <span>
                  <strong lang={h.language_code}>{h.text}</strong> — {h.translation}
                </span>
                <span className="text-slate-600">
                  {h.misses} erro(s) em {h.tries}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">Nenhum erro registrado. Muito bem!</p>
        )}
      </Card>
    </div>
  );
}
