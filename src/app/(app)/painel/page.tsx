import type { Metadata } from "next";
import Link from "next/link";
import { XpChart } from "@/components/xp-chart";
import { Alert, ButtonLink, Card, EmptyState, LeagueBadge, ProgressBar, SectionTitle, Stat, formatDuration, formatPercent } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { getDashboard } from "@/lib/server/dashboard";

export const metadata: Metadata = { title: "Painel" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const user = await requireUser();
  const d = await getDashboard(user);
  const sp = await searchParams;
  const lang = d.currentLanguage;

  return (
    <div className="space-y-8">
      {sp.erro === "sem-permissao" && <Alert tone="error">Você não tem permissão para acessar aquela área.</Alert>}
      {user.isDemo && <Alert tone="warning">Conta de demonstração: os números exibidos são fictícios.</Alert>}

      <section className="flex flex-col gap-4 rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 p-6 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="text-brand-200">
            {greeting()}, <strong className="text-white">{user.nickname}</strong>!
          </p>
          <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">
            {d.activeSession ? "Você tem uma sessão em andamento" : lang ? `Vamos praticar ${lang.name_pt.toLowerCase()} hoje?` : "Escolha um idioma para começar"}
          </h1>
          {lang && (
            <p className="mt-2 text-sm text-brand-100">
              {lang.flag} Nível {lang.level_code} · {lang.learned} de {lang.total} itens aprendidos
              {lang.due > 0 && ` · ${lang.due} para revisar`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {d.activeSession ? (
            <ButtonLink href={`/sessao/${d.activeSession.id}`} size="lg" variant="secondary">
              Continuar sessão
            </ButtonLink>
          ) : lang ? (
            <ButtonLink href="/jogar" size="lg" variant="secondary">
              Continuar aprendendo
            </ButtonLink>
          ) : (
            <ButtonLink href="/idiomas" size="lg" variant="secondary">
              Escolher idioma
            </ButtonLink>
          )}
        </div>
      </section>

      <section aria-label="Resumo" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">⭐ Nível {d.level.level}</p>
          <p className="mt-1 text-2xl font-extrabold">{d.xp} XP</p>
          <ProgressBar className="mt-2" value={d.level.current} max={d.level.needed} label={`Progresso para o nível ${d.level.level + 1}`} />
          <p className="mt-1 text-xs text-slate-500">
            {d.level.needed - d.level.current} XP para o nível {d.level.level + 1}
          </p>
        </div>
        <Stat icon="🔥" label="Sequência" value={`${d.streak.current} ${d.streak.current === 1 ? "dia" : "dias"}`} hint={d.streak.studiedToday ? "Você já estudou hoje" : `Recorde: ${d.streak.longest}`} />
        <Stat icon="⏱️" label="Tempo estudado" value={formatDuration(d.studySeconds)} hint={`${d.sessions} sessões`} />
        <Stat icon="🧠" label="Itens aprendidos" value={d.learnedTotal} hint="2+ revisões corretas" />
        <Stat icon="🎯" label="Taxa de acerto" value={formatPercent(d.accuracy)} hint={`Melhor sequência: ${d.bestAnswerStreak}`} />
      </section>

      <section aria-labelledby="modos" className="grid gap-4 md:grid-cols-2">
        <h2 id="modos" className="sr-only">
          Modalidades
        </h2>
        {[
          { key: "typing" as const, icon: "⌨️", title: "Jogo de Digitar", href: "/jogar/digitar", desc: "Tradução, escrita e escuta." },
          { key: "voice" as const, icon: "🎙️", title: "Jogo com Vozes", href: "/jogar/voz", desc: "Ouça e repita frases em voz alta." },
        ].map((m) => {
          const stats = d.modes[m.key];
          const standing = d.standings[m.key];
          return (
            <Card key={m.key} className="flex flex-col justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="text-3xl" aria-hidden="true">
                  {m.icon}
                </span>
                <div>
                  <h3 className="font-bold">{m.title}</h3>
                  <p className="text-sm text-slate-600">{m.desc}</p>
                  <p className="mt-2 text-sm text-slate-700">
                    {stats ? (
                      <>
                        {stats.sessions} sessões · melhor: <strong>{stats.best}</strong> pts
                        {standing && (
                          <>
                            {" "}
                            · <strong>#{standing.position}</strong> na temporada
                          </>
                        )}
                      </>
                    ) : (
                      "Você ainda não jogou esta modalidade."
                    )}
                  </p>
                </div>
              </div>
              <ButtonLink href={m.href} variant={m.key === "typing" ? "primary" : "secondary"}>
                Jogar
              </ButtonLink>
            </Card>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="desafios" className="lg:col-span-1">
          <SectionTitle id="desafios">Desafios do dia</SectionTitle>
          <Card className="space-y-4">
            {d.challenges.map((c) => (
              <div key={c.code}>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className={c.done ? "font-semibold text-emerald-700" : "font-medium text-slate-800"}>
                    {c.done ? "✅ " : ""}
                    {c.title}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-slate-500">+{c.xp} XP</span>
                </div>
                <ProgressBar className="mt-1.5" value={c.value} max={c.goal} label={c.title} color={c.done ? "green" : "brand"} />
                <p className="mt-0.5 text-xs text-slate-500">
                  {c.value}/{c.goal}
                </p>
              </div>
            ))}
            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Meta semanal</span>
                <span className="text-xs text-slate-500">
                  {d.weekly.xp}/{d.weekly.goal} XP
                </span>
              </div>
              <ProgressBar className="mt-1.5" value={d.weekly.xp} max={d.weekly.goal} label="Meta semanal de XP" color={d.weekly.xp >= d.weekly.goal ? "green" : "amber"} />
              <p className="mt-1 text-xs text-slate-500">
                Ajuste a meta em <Link href="/perfil" className="underline">Perfil</Link>.
              </p>
            </div>
          </Card>
        </section>

        <section aria-labelledby="evolucao" className="lg:col-span-2">
          <SectionTitle id="evolucao">Evolução (XP por dia)</SectionTitle>
          <Card>
            <XpChart data={d.xpByDay} />
          </Card>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="ranking">
          <SectionTitle id="ranking" action={<Link href="/rankings" className="text-sm font-semibold text-brand-700 hover:underline">Ver rankings</Link>}>
            Temporada
          </SectionTitle>
          <Card>
            <div className="flex items-center justify-between">
              <LeagueBadge code={d.standings.league.code} name={d.standings.league.name} />
              <span className="text-sm text-slate-600">{d.standings.league.points} pts</span>
            </div>
            {d.standings.league.next && (
              <p className="mt-2 text-xs text-slate-500">
                Faltam {d.standings.league.next.min - d.standings.league.points} pts para {d.standings.league.next.name}.
              </p>
            )}
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              {(["general", "typing", "voice"] as const).map((b) => (
                <div key={b} className="rounded-xl bg-slate-50 p-2">
                  <dt className="text-xs text-slate-500">{b === "general" ? "Geral" : b === "typing" ? "Digitação" : "Voz"}</dt>
                  <dd className="text-lg font-extrabold">{d.standings[b] ? `#${d.standings[b]!.position}` : "—"}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-slate-500">{d.standings.seasonName}</p>
          </Card>
        </section>

        <section aria-labelledby="recomendacoes">
          <SectionTitle id="recomendacoes">Recomendado para você</SectionTitle>
          <div className="space-y-3">
            {d.recommendations.length ? (
              d.recommendations.map((r) => (
                <Link key={r.title} href={r.href} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow">
                  <p className="font-semibold text-slate-900">{r.title}</p>
                  <p className="text-sm text-slate-600">{r.description}</p>
                </Link>
              ))
            ) : (
              <EmptyState icon="✨" title="Tudo em dia!">
                Continue praticando para receber novas recomendações.
              </EmptyState>
            )}
          </div>
        </section>

        <section aria-labelledby="conquistas">
          <SectionTitle
            id="conquistas"
            action={
              <Link href="/conquistas" className="text-sm font-semibold text-brand-700 hover:underline">
                {d.achievementTotals?.unlocked ?? 0}/{d.achievementTotals?.total ?? 0}
              </Link>
            }
          >
            Conquistas recentes
          </SectionTitle>
          {d.achievements.length ? (
            <Card>
              <ul className="grid grid-cols-3 gap-3">
                {d.achievements.map((a) => (
                  <li key={a.code} className="text-center">
                    <span className="text-3xl" aria-hidden="true">
                      {a.icon}
                    </span>
                    <p className="text-xs font-semibold text-slate-700">{a.name_pt}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <EmptyState icon="🏅" title="Nenhuma conquista ainda">
              Conclua sua primeira sessão para desbloquear.
            </EmptyState>
          )}
        </section>
      </div>

      {d.languages.length > 1 && (
        <section aria-labelledby="idiomas-andamento">
          <SectionTitle id="idiomas-andamento">Idiomas em andamento</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.languages.map((l) => (
              <Card key={l.code} className="flex items-center gap-3">
                <span className="text-3xl" aria-hidden="true">
                  {l.flag}
                </span>
                <div className="flex-1">
                  <p className="font-semibold">
                    {l.name_pt} · {l.level_code}
                  </p>
                  <ProgressBar className="mt-1.5" value={l.learned} max={l.total} label={`Itens aprendidos em ${l.name_pt}`} />
                  <p className="mt-0.5 text-xs text-slate-500">
                    {l.learned}/{l.total} aprendidos
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
