import type { Metadata } from "next";
import Link from "next/link";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, Stat, formatDate, formatPercent } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { getHistory } from "@/lib/server/dashboard";
import { FORMAT_LABELS, getPreset } from "@/lib/domain/presets";

export const metadata: Metadata = { title: "Histórico" };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const user = await requireUser();
  const page = Math.max(1, Number((await searchParams).pagina) || 1);
  const { rows, hasMore, records } = await getHistory(user.id, page);
  return (
    <>
      <PageHeader title="Histórico de atividades" subtitle="Todas as suas sessões e recordes." />
      <section aria-label="Recordes" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon="⌨️" label="Recorde digitação" value={records?.best_typing ?? 0} hint="pontos de ranking" />
        <Stat icon="🎙️" label="Recorde voz" value={records?.best_voice ?? 0} hint="pontos de ranking" />
        <Stat icon="💯" label="Maior pontuação" value={records?.best_raw ?? 0} hint="em uma sessão" />
        <Stat icon="🔥" label="Maior sequência" value={records?.best_streak ?? 0} hint="acertos seguidos" />
      </section>
      {rows.length === 0 ? (
        <EmptyState icon="🕘" title="Nenhuma sessão ainda" action={<ButtonLink href="/jogar">Jogar agora</ButtonLink>} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Sessões, da mais recente para a mais antiga</caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Data</th>
                <th scope="col" className="px-2 py-3">Sessão</th>
                <th scope="col" className="px-2 py-3 text-right">Precisão</th>
                <th scope="col" className="px-2 py-3 text-right">Pontos</th>
                <th scope="col" className="px-2 py-3 text-right">XP</th>
                <th scope="col" className="px-4 py-3 text-right">Ranking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(s.started_at, true, user.timezone)}</td>
                  <td className="px-2 py-3">
                    <Link href={s.status === "finished" ? `/resultado/${s.id}` : `/sessao/${s.id}`} className="font-semibold text-brand-700 hover:underline">
                      {s.flag} {s.mode === "voice" ? "Vozes" : `Digitação · ${FORMAT_LABELS[s.format] ?? s.format}`}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <Badge color={s.kind === "ranked" ? "amber" : "green"}>{s.kind === "ranked" ? "Competitiva" : s.kind === "placement" ? "Nivelamento" : "Treino"}</Badge>
                      <Badge>{getPreset(s.preset)?.label ?? s.preset}</Badge>
                      {s.status === "active" && <Badge color="sky">em andamento</Badge>}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right">{s.answered_count ? formatPercent(s.accuracy) : "—"}</td>
                  <td className="px-2 py-3 text-right">{s.raw_score}</td>
                  <td className="px-2 py-3 text-right">+{s.xp_awarded}</td>
                  <td className="px-4 py-3 text-right font-bold">{s.rank_points || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <nav aria-label="Paginação" className="mt-4 flex justify-between">
        {page > 1 ? <ButtonLink variant="secondary" href={`/historico?pagina=${page - 1}`}>← Mais recentes</ButtonLink> : <span />}
        {hasMore && <ButtonLink variant="secondary" href={`/historico?pagina=${page + 1}`}>Mais antigas →</ButtonLink>}
      </nav>
    </>
  );
}
