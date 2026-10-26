import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Alert, ButtonLink, Card, Stat, cn, formatDuration, formatPercent } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import type { SessionResult } from "@/lib/server/game/finish";
import { getSessionReport } from "@/lib/server/game/sessions";
import { FORMAT_LABELS } from "@/lib/domain/presets";

export const metadata: Metadata = { title: "Resultado" };

const RESULT_LABEL: Record<string, [string, string]> = {
  correct: ["✅", "Correto"],
  accent: ["🟡", "Acentuação"],
  typo: ["🟡", "Digitação"],
  wrong: ["❌", "Errado"],
  skipped: ["⏭️", "Pulado"],
};

export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const report = await getSessionReport(user.id, id);
  if (!report) notFound();
  if (report.session.status !== "finished") redirect(`/sessao/${id}`);
  const r = report.session.result as SessionResult;
  const isVoice = r.mode === "voice";
  const replayHref = isVoice ? "/jogar/voz" : "/jogar/digitar";
  const great = r.accuracy >= 0.8;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 p-6 text-center text-white shadow-lg sm:p-8">
        <p className="text-5xl" aria-hidden="true">
          {r.answered === 0 ? "🤔" : great ? "🎉" : r.accuracy >= 0.5 ? "💪" : "🌱"}
        </p>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">
          {r.answered === 0 ? "Sessão encerrada sem respostas" : great ? "Excelente sessão!" : r.accuracy >= 0.5 ? "Bom trabalho!" : "Cada tentativa conta!"}
        </h1>
        <p className="mt-1 text-brand-100">
          {report.language.flag} {report.language.name_pt} · {isVoice ? "Jogo com Vozes" : `Digitação · ${FORMAT_LABELS[report.session.format] ?? ""}`}
        </p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-xs uppercase tracking-wide text-brand-200">Pontuação</p>
            <p className="text-2xl font-extrabold">{r.rawScore}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-xs uppercase tracking-wide text-brand-200">XP ganho</p>
            <p className="text-2xl font-extrabold">+{r.xp.total}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-xs uppercase tracking-wide text-brand-200">Ranking</p>
            <p className="text-2xl font-extrabold">{r.rankEligible ? r.rankPoints : "—"}</p>
          </div>
        </div>
        {r.newRecord && <p className="mt-4 font-bold text-amber-300">🏅 Novo recorde pessoal no ranking!</p>}
        {r.levelAfter > r.levelBefore && <p className="mt-2 font-bold text-teal-200">⭐ Você subiu para o nível {r.levelAfter}!</p>}
      </section>

      {r.rankNote && <Alert tone="info">{r.rankNote}</Alert>}
      {r.placementLevel && (
        <Alert tone="success" title={`Nível sugerido: ${r.placementLevel}`}>
          Ajustamos seus exercícios para o nível {r.placementLevel}. Você pode alterar em Idiomas quando quiser.
        </Alert>
      )}

      <section aria-label="Estatísticas" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Precisão" value={formatPercent(r.accuracy)} hint={`${r.correct} certas · ${r.partial} parciais · ${r.wrong} erradas`} />
        <Stat label="Respondidos" value={r.answered} />
        <Stat label="Maior sequência" value={`🔥 ${r.maxStreak}`} />
        <Stat label="Tempo" value={formatDuration(r.studySeconds)} hint={!isVoice ? `Velocidade média ${formatPercent(r.avgSpeed)}` : undefined} />
      </section>

      <Card>
        <h2 className="font-bold">Composição do XP</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
          {[
            ["Exercícios", r.xp.items],
            ["Bônus de conclusão", r.xp.completionBonus],
            ["Conquistas", r.xp.achievements],
            ["Desafios do dia", r.xp.challenges],
            ["Meta semanal", r.xp.weeklyGoal],
          ].map(([k, v]) => (
            <div key={k as string} className="flex justify-between border-b border-slate-100 py-1">
              <dt className="text-slate-600">{k}</dt>
              <dd className="font-semibold">+{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-500">Itens repetidos nas últimas 20 horas rendem menos XP, para valorizar a variedade e evitar repetição sem propósito.</p>
      </Card>

      {(r.achievements.length > 0 || r.challenges.length > 0) && (
        <Card>
          <h2 className="font-bold">Desbloqueado nesta sessão</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {r.achievements.map((a) => (
              <li key={a.code} className="flex items-center gap-3 rounded-xl bg-amber-50 p-3">
                <span className="text-2xl" aria-hidden="true">
                  {a.icon}
                </span>
                <span className="flex-1 font-semibold">{a.name}</span>
                {a.xp > 0 && <span className="text-sm font-bold text-amber-800">+{a.xp} XP</span>}
              </li>
            ))}
            {r.challenges.map((c) => (
              <li key={c.code} className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3">
                <span className="text-2xl" aria-hidden="true">
                  🎯
                </span>
                <span className="flex-1 font-semibold">Desafio: {c.title}</span>
                <span className="text-sm font-bold text-emerald-800">+{c.xp} XP</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {report.items.length > 0 && (
        <Card>
          <h2 className="font-bold">Revisão dos exercícios</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {report.items.map((it) => {
              const [icon, label] = RESULT_LABEL[it.result ?? "wrong"] ?? ["•", ""];
              const voicePass = isVoice && (it.score ?? 0) >= 60;
              return (
                <li key={it.idx} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold" lang={report.language.locale}>
                      {it.text} <span className="font-normal text-slate-500">= {it.translation_pt}</span>
                    </p>
                    {it.first_answer && (
                      <p className="text-sm text-slate-600">
                        {isVoice ? "Reconhecido" : "Sua resposta"}: <span className="font-mono">{it.first_answer}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-sm">
                    {isVoice ? (
                      <span className={cn("font-bold", voicePass ? "text-emerald-700" : "text-rose-700")}>{it.excluded ? "Pulado" : `${Math.round(it.score ?? 0)}/100`}</span>
                    ) : (
                      <span>
                        <span aria-hidden="true">{icon}</span> {label}
                      </span>
                    )}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">+{it.points} pts</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <ButtonLink href={replayHref} size="lg">
          Jogar novamente
        </ButtonLink>
        <ButtonLink href="/rankings" size="lg" variant="secondary">
          Ver rankings
        </ButtonLink>
        <ButtonLink href="/painel" size="lg" variant="ghost">
          Ir para o painel
        </ButtonLink>
      </div>
    </div>
  );
}
