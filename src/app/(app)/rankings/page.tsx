import type { Metadata } from "next";
import Link from "next/link";
import { Select } from "@/components/forms";
import { Avatar, Badge, Card, EmptyState, LeagueBadge, PageHeader, cn, formatDate } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { listLanguages } from "@/lib/server/content";
import { getRanking, rankingQuerySchema, type RankingRow } from "@/lib/server/rankings";
import { listSeasons } from "@/lib/server/seasons";

export const metadata: Metadata = { title: "Rankings" };

const BOARDS = [
  ["general", "🏆 Geral"],
  ["typing", "⌨️ Digitação"],
  ["voice", "🎙️ Vozes"],
] as const;
const PERIODS = [
  ["week", "Semana"],
  ["season", "Temporada"],
  ["all", "Todos os tempos"],
] as const;

function Change({ c }: { c: RankingRow["change"] }) {
  if (c === null) return <span className="sr-only">sem comparação</span>;
  if (c === "new") return <span className="text-xs font-bold text-sky-700">NOVO</span>;
  if (c === 0) return <span className="text-xs text-slate-400" aria-label="Posição mantida">—</span>;
  return c > 0 ? (
    <span className="text-xs font-bold text-emerald-700" aria-label={`Subiu ${c} posições`}>
      ▲{c}
    </span>
  ) : (
    <span className="text-xs font-bold text-rose-700" aria-label={`Caiu ${-c} posições`}>
      ▼{-c}
    </span>
  );
}

export default async function RankingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = rankingQuerySchema.parse({
    board: sp.board,
    period: sp.period,
    language: sp.language || null,
    seasonId: sp.season || undefined,
  });
  const [ranking, languages, seasons] = await Promise.all([getRanking(q, user.id), listLanguages(), listSeasons()]);
  const closed = seasons.filter((s) => s.status === "closed");
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { board: q.board, period: q.period, language: q.language ?? null, season: null as string | null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/rankings?${p.toString()}`;
  };
  const viewerInTop = ranking.viewer && ranking.rows.some((r) => r.userId === ranking.viewer!.userId);
  const showLeague = q.board === "general";

  return (
    <>
      <PageHeader title="Rankings" subtitle={ranking.frozen ? `Resultado final — ${ranking.seasonName}` : ranking.seasonName ?? undefined} />

      <nav aria-label="Tipo de ranking" className="mb-4 flex gap-2 overflow-x-auto">
        {BOARDS.map(([b, label]) => (
          <Link
            key={b}
            href={href({ board: b, season: ranking.frozen ? String(q.seasonId) : null })}
            aria-current={q.board === b ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold",
              q.board === b ? "bg-brand-600 text-white" : "bg-white text-slate-700 shadow-sm hover:bg-slate-50",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      <form action="/rankings" className="mb-6 grid gap-3 sm:grid-cols-4" aria-label="Filtros do ranking">
        <input type="hidden" name="board" value={q.board} />
        <label className="text-sm font-semibold text-slate-700">
          Idioma
          <Select name="language" defaultValue={q.language ?? ""} className="mt-1">
            <option value="">Todos os idiomas</option>
            {languages.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.name_pt}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Período
          <Select name="period" defaultValue={ranking.frozen ? "season" : q.period} className="mt-1">
            {PERIODS.map(([p, l]) => (
              <option key={p} value={p}>
                {l}
              </option>
            ))}
          </Select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Temporada
          <Select name="season" defaultValue={ranking.frozen ? String(q.seasonId) : ""} className="mt-1">
            <option value="">Atual</option>
            {closed.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} (encerrada)
              </option>
            ))}
          </Select>
        </label>
        <div className="flex items-end">
          <button type="submit" className="h-11 w-full rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800">
            Aplicar filtros
          </button>
        </div>
      </form>

      {ranking.viewer && (
        <Card className="mb-4 flex flex-wrap items-center gap-4 border-brand-200 bg-brand-50">
          <p className="text-3xl font-black text-brand-700">#{ranking.viewer.position}</p>
          <div className="flex-1">
            <p className="font-semibold">Sua posição</p>
            <p className="text-sm text-slate-600">
              {ranking.viewer.points} pts · de {ranking.totalPlayers} jogadores
            </p>
          </div>
          {showLeague && ranking.viewer.league && <LeagueBadge code={ranking.viewer.league.code} name={ranking.viewer.league.name} />}
        </Card>
      )}

      {ranking.rows.length === 0 ? (
        <EmptyState icon="🏁" title="Ninguém pontuou neste filtro ainda">
          Jogue uma sessão <strong>competitiva</strong> para aparecer aqui.
        </EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Ranking {BOARDS.find((b) => b[0] === q.board)?.[1]} — {PERIODS.find((p) => p[0] === q.period)?.[1]}
            </caption>
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Pos.
                </th>
                <th scope="col" className="px-2 py-3">
                  Jogador
                </th>
                {q.board === "general" && (
                  <th scope="col" className="hidden px-2 py-3 text-right sm:table-cell">
                    Digitação / Voz
                  </th>
                )}
                <th scope="col" className="px-4 py-3 text-right">
                  Pontos
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...ranking.rows, ...(ranking.viewer && !viewerInTop ? [ranking.viewer] : [])].map((r, i) => (
                <tr key={r.userId + i} className={cn(r.userId === user.id && "bg-brand-50 font-semibold")} aria-current={r.userId === user.id ? "true" : undefined}>
                  <td className="px-3 py-3 sm:px-4">
                    <div className="flex items-center gap-1 sm:gap-2">
                      <span className="w-8 font-extrabold">{r.position <= 3 ? ["🥇", "🥈", "🥉"][r.position - 1] : `#${r.position}`}</span>
                      <Change c={r.change} />
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2">
                      <Avatar avatar={r.avatar} color={r.avatarColor} size="sm" label={`Avatar de ${r.nickname}`} />
                      <span className="max-w-[8rem] truncate sm:max-w-none">{r.nickname}</span>
                      {r.userId === user.id && <Badge color="brand">você</Badge>}
                      {r.isDemo && <Badge color="amber">DEMO</Badge>}
                      {r.unverified && (
                        <Badge color="slate" title="Inclui sessões de voz avaliadas apenas pelo navegador">
                          não verificado
                        </Badge>
                      )}
                      {showLeague && r.league && (
                        <span className="hidden sm:inline">
                          <LeagueBadge code={r.league.code} name={r.league.name} />
                        </span>
                      )}
                    </div>
                  </td>
                  {q.board === "general" && (
                    <td className="hidden px-2 py-3 text-right text-slate-500 sm:table-cell">
                      {r.typing} / {r.voice}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right font-extrabold tabular-nums">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <section aria-labelledby="regras" className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 id="regras" className="font-bold">
            Como a pontuação funciona
          </h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
            <li>Só sessões <strong>competitivas</strong> contam. Cada sessão vale de 0 a 1000 pontos, na mesma escala para digitação e voz.</li>
            <li>A pontuação da sessão considera precisão (peso maior), quantidade de exercícios, dificuldade do nível e, na digitação, velocidade.</li>
            <li>
              No período, contam apenas as suas <strong>{ranking.rules.topSessions} melhores sessões</strong> em cada modalidade — repetir sessões não infla o
              placar.
            </li>
            <li>O ranking geral é a média entre o placar de digitação e o de voz: quem domina as duas modalidades vai mais longe.</li>
            <li>A temporada é mensal: o placar competitivo reinicia, mas XP, conquistas e o histórico das temporadas são preservados.</li>
          </ul>
        </Card>
        <Card>
          <h2 className="font-bold">Ligas da temporada</h2>
          <p className="mt-1 text-sm text-slate-600">Definidas pela pontuação geral acumulada na temporada atual.</p>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {ranking.rules.leagues.map((l, i, arr) => (
              <li key={l.code} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <LeagueBadge code={l.code} name={l.name} />
                <span className="text-slate-600">{arr[i + 1] ? `${l.min}–${arr[i + 1].min - 1}` : `${l.min}+`}</span>
              </li>
            ))}
          </ul>
          {ranking.range.from && (
            <p className="mt-3 text-xs text-slate-500">
              Período exibido: {formatDate(ranking.range.from, false, user.timezone)} — {ranking.range.to ? formatDate(ranking.range.to, false, user.timezone) : "agora"}
            </p>
          )}
        </Card>
      </section>
    </>
  );
}
