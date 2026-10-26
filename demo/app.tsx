/* eslint-disable react-hooks/purity, react-hooks/immutability -- demo estática: as páginas leem o estado local (localStorage) e a hora atual de forma síncrona a cada renderização. */
import { useEffect, useReducer, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import Landing from "@/app/(public)/page";
import { DesktopNav, MobileNav, UserMenu } from "@/components/app-nav";
import { LoginForm, SignupForm } from "@/components/auth-forms";
import { LanguagePicker } from "@/components/language-picker";
import { TypingPlayer } from "@/components/player/typing-player";
import { VoicePlayer } from "@/components/player/voice-player";
import { TypingSetup } from "@/components/session-setup";
import { VoiceSetup } from "@/components/voice-setup";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  LeagueBadge,
  Logo,
  PageHeader,
  ProgressBar,
  SectionTitle,
  Stat,
  cn,
  formatDuration,
  formatPercent,
} from "@/components/ui";
import { XpChart } from "@/components/xp-chart";
import { challengeProgress, dailyChallenges } from "@/lib/domain/challenges";
import { FORMAT_LABELS } from "@/lib/domain/presets";
import { DEFAULT_RULES, generalScore, leagueFor, levelProgress, modalityScore } from "@/lib/domain/scoring";
import { dayActivity, getView } from "./mock-api";
import { navigate, useHashRoute } from "./shims/navigation";
import Link from "./shims/link";
import { ACHIEVEMENTS, DEMO_PLAYERS, ITEMS, LANGUAGES, LEVELS, UNITS, load, resetDemo, save, todayLocal, type DemoState } from "./store";

// ---------------------------------------------------------------------------
// Estrutura
// ---------------------------------------------------------------------------

function DemoBanner() {
  return (
    <div className="bg-amber-400 px-4 py-2 text-center text-xs font-semibold text-slate-900 sm:text-sm">
      🧪 Modo demonstração<span className="hidden sm:inline"> — sem servidor nem banco de dados. O progresso fica salvo só neste navegador e o ranking usa jogadores fictícios</span>.{" "}
      <button
        type="button"
        className="underline"
        onClick={() => {
          if (confirm("Apagar todo o progresso da demonstração neste navegador?")) {
            resetDemo();
            navigate("/", true);
            location.reload();
          }
        }}
      >
        Reiniciar demo
      </button>
    </div>
  );
}

function PublicShell({ children }: { children: ReactNode }) {
  const s = load();
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/">
            <Logo dark />
          </Link>
          {s.user ? (
            <ButtonLink href="/painel" size="sm">
              Ir para o painel
            </ButtonLink>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/entrar" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-200 hover:text-white">
                Entrar
              </Link>
              <ButtonLink href="/cadastro" size="sm">
                Criar conta
              </ButtonLink>
            </div>
          )}
        </nav>
      </header>
      <div id="conteudo" className="flex flex-1 flex-col">
        {children}
      </div>
    </>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-gradient-to-b from-brand-50 to-slate-50">
      <header className="px-4 py-5 sm:px-6">
        <Link href="/">
          <Logo />
        </Link>
      </header>
      <main id="conteudo" className="flex flex-1 items-start justify-center px-4 pb-16 pt-4 sm:pt-10">
        <div className="w-full max-w-md space-y-4">
          <Alert tone="info">Demonstração: qualquer e-mail e senha válidos funcionam. Nada é enviado a um servidor.</Alert>
          {children}
        </div>
      </main>
    </div>
  );
}

function AppShell({ s, children }: { s: DemoState; children: ReactNode }) {
  const lang = LANGUAGES.find((l) => l.code === s.user!.currentLanguage);
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/painel">
              <Logo />
            </Link>
            <DesktopNav />
          </div>
          <div className="flex items-center gap-2">
            <Link href="/idiomas" className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <span aria-hidden="true">{lang?.flag ?? "🌍"}</span>
              <span className="hidden sm:inline">{lang?.name_pt ?? "Idioma"}</span>
            </Link>
            <UserMenu nickname={s.user!.nickname} isAdmin={false} avatar={<Avatar avatar={s.user!.avatar} color={s.user!.avatarColor} size="sm" />} />
          </div>
        </nav>
      </header>
      <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 md:pb-12">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dados derivados
// ---------------------------------------------------------------------------

function finishedSessions(s: DemoState) {
  return Object.values(s.sessions).filter((x) => x.status === "finished");
}

function standings(s: DemoState, language: string | null) {
  const mine = finishedSessions(s).filter((x) => x.kind === "ranked" && (!language || x.language === language));
  const pts = (mode: string) => mine.filter((x) => x.mode === mode).map((x) => Number(x.result?.rankPoints ?? 0)).filter((p) => p > 0);
  const rows = [
    ...DEMO_PLAYERS.map((p) => ({ ...p, isYou: false, typing: modalityScore(p.typing), voice: modalityScore(p.voice) })),
    { nickname: s.user!.nickname, avatar: s.user!.avatar, avatarColor: s.user!.avatarColor, isYou: true, typing: modalityScore(pts("typing")), voice: modalityScore(pts("voice")) },
  ].map((r) => ({ ...r, general: generalScore(r.typing, r.voice) }));
  return rows;
}

function rankOf(rows: ReturnType<typeof standings>, board: "typing" | "voice" | "general") {
  return rows
    .filter((r) => r[board] > 0)
    .sort((a, b) => b[board] - a[board])
    .map((r, i) => ({ ...r, position: i + 1, points: r[board] }));
}

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------

function Dashboard({ s }: { s: DemoState }) {
  const user = s.user!;
  const lang = LANGUAGES.find((l) => l.code === user.currentLanguage);
  const xp = s.stats.xp;
  const lp = levelProgress(xp);
  const today = todayLocal();
  const yesterday = todayLocal(Date.now() - 86_400_000);
  const streak = s.stats.lastStudyDate === today || s.stats.lastStudyDate === yesterday ? s.stats.currentStreak : 0;
  const learned = Object.values(s.progress).filter((p) => p.reps >= 2).length;
  const activity = dayActivity(s, today);
  const challenges = dailyChallenges(today).map((d) => ({ ...d, ...challengeProgress(d, activity) }));
  const byDay = new Map<string, number>();
  for (const e of s.xpEvents) byDay.set(todayLocal(e.at), (byDay.get(todayLocal(e.at)) ?? 0) + e.amount);
  const xpByDay = Array.from({ length: 14 }, (_, i) => {
    const d = todayLocal(Date.now() - (13 - i) * 86_400_000);
    return { day: d, xp: byDay.get(d) ?? 0 };
  });
  const weekStart = Date.now() - ((new Date().getDay() + 6) % 7) * 86_400_000;
  const weekXp = s.xpEvents.filter((e) => e.at >= new Date(todayLocal(weekStart) + "T00:00:00").getTime()).reduce((t, e) => t + e.amount, 0);
  const rows = standings(s, null);
  const pos = (b: "typing" | "voice" | "general") => rankOf(rows, b).find((r) => r.isYou)?.position ?? null;
  const me = rows.find((r) => r.isYou)!;
  const league = leagueFor(me.general);
  const modeStats = (mode: string) => {
    const list = finishedSessions(s).filter((x) => x.mode === mode);
    return list.length ? { sessions: list.length, best: Math.max(...list.map((x) => Number(x.result?.rankPoints ?? 0))) } : null;
  };
  const due = lang ? ITEMS.filter((i) => i.language === lang.code && s.progress[i.id] && s.progress[i.id].dueAt <= Date.now()).length : 0;
  const recent = Object.entries(s.achievements)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([code]) => ACHIEVEMENTS.find((a) => a.code === code)!);
  const active = Object.values(s.sessions).find((x) => x.status === "active");

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 p-6 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <p className="text-brand-200">
            Olá, <strong className="text-white">{user.nickname}</strong>!
          </p>
          <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">
            {active ? "Você tem uma sessão em andamento" : lang ? `Vamos praticar ${lang.name_pt.toLowerCase()} hoje?` : "Escolha um idioma para começar"}
          </h1>
          {lang && (
            <p className="mt-2 text-sm text-brand-100">
              {lang.flag} Nível {user.levels[lang.code] ?? "A1"} · {learned} itens aprendidos{due ? ` · ${due} para revisar` : ""}
            </p>
          )}
        </div>
        <ButtonLink href={active ? `/sessao/${active.id}` : lang ? "/jogar" : "/idiomas"} size="lg" variant="secondary">
          {active ? "Continuar sessão" : lang ? "Continuar aprendendo" : "Escolher idioma"}
        </ButtonLink>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">⭐ Nível {lp.level}</p>
          <p className="mt-1 text-2xl font-extrabold">{xp} XP</p>
          <ProgressBar className="mt-2" value={lp.current} max={lp.needed} label="Progresso do nível" />
          <p className="mt-1 text-xs text-slate-500">
            {lp.needed - lp.current} XP para o nível {lp.level + 1}
          </p>
        </div>
        <Stat icon="🔥" label="Sequência" value={`${streak} ${streak === 1 ? "dia" : "dias"}`} hint={`Recorde: ${s.stats.longestStreak}`} />
        <Stat icon="⏱️" label="Tempo estudado" value={formatDuration(s.stats.studySeconds)} hint={`${s.stats.sessionsCount} ${s.stats.sessionsCount === 1 ? "sessão" : "sessões"}`} />
        <Stat icon="🧠" label="Itens aprendidos" value={learned} hint="2+ revisões corretas" />
        <Stat icon="🎯" label="Taxa de acerto" value={formatPercent(s.stats.answered ? s.stats.correct / s.stats.answered : null)} hint={`Melhor sequência: ${s.stats.bestAnswerStreak}`} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {[
          { key: "typing", icon: "⌨️", title: "Jogo de Digitar", href: "/jogar/digitar", desc: "Tradução, escrita e escuta." },
          { key: "voice", icon: "🎙️", title: "Jogo com Vozes", href: "/jogar/voz", desc: "Ouça e repita frases em voz alta." },
        ].map((m) => {
          const st = modeStats(m.key);
          return (
            <Card key={m.key} className="flex flex-col justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="text-3xl" aria-hidden="true">
                  {m.icon}
                </span>
                <div>
                  <h2 className="font-bold">{m.title}</h2>
                  <p className="text-sm text-slate-600">{m.desc}</p>
                  <p className="mt-2 text-sm text-slate-700">
                    {st ? `${st.sessions} ${st.sessions === 1 ? "sessão" : "sessões"} · melhor: ${st.best} pts` : "Você ainda não jogou esta modalidade."}
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
        <section>
          <SectionTitle>Desafios do dia</SectionTitle>
          <Card className="space-y-4">
            {challenges.map((c) => (
              <div key={c.code}>
                <div className="flex justify-between gap-2 text-sm">
                  <span className={c.done ? "font-semibold text-emerald-700" : "font-medium"}>
                    {c.done ? "✅ " : ""}
                    {c.title}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">+{c.xp} XP</span>
                </div>
                <ProgressBar className="mt-1.5" value={c.value} max={c.goal} label={c.title} color={c.done ? "green" : "brand"} />
              </div>
            ))}
            <div className="border-t border-slate-100 pt-4">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Meta semanal</span>
                <span className="text-xs text-slate-500">
                  {weekXp}/{user.weeklyGoalXp} XP
                </span>
              </div>
              <ProgressBar className="mt-1.5" value={weekXp} max={user.weeklyGoalXp} label="Meta semanal" color="amber" />
            </div>
          </Card>
        </section>
        <section className="lg:col-span-2">
          <SectionTitle>Evolução (XP por dia)</SectionTitle>
          <Card>
            <XpChart data={xpByDay} />
          </Card>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section>
          <SectionTitle action={<Link href="/rankings" className="text-sm font-semibold text-brand-700 hover:underline">Ver rankings</Link>}>Temporada</SectionTitle>
          <Card>
            <div className="flex items-center justify-between">
              <LeagueBadge code={league.code} name={league.name} />
              <span className="text-sm text-slate-600">{me.general} pts</span>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              {(["general", "typing", "voice"] as const).map((b) => (
                <div key={b} className="rounded-xl bg-slate-50 p-2">
                  <dt className="text-xs text-slate-500">{b === "general" ? "Geral" : b === "typing" ? "Digitação" : "Voz"}</dt>
                  <dd className="text-lg font-extrabold">{pos(b) ? `#${pos(b)}` : "—"}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>
        <section>
          <SectionTitle>Recomendado para você</SectionTitle>
          <div className="space-y-3">
            {due > 0 && (
              <Link href="/jogar/digitar?foco=revisao" className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-300">
                <p className="font-semibold">Revisar {due} itens</p>
                <p className="text-sm text-slate-600">No momento ideal da revisão espaçada.</p>
              </Link>
            )}
            {!modeStats("voice") && (
              <Link href="/jogar/voz" className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-300">
                <p className="font-semibold">Experimente o Jogo com Vozes</p>
                <p className="text-sm text-slate-600">Pratique a pronúncia ouvindo e repetindo frases.</p>
              </Link>
            )}
            <Link href="/jogar/digitar" className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-300">
              <p className="font-semibold">Desafio de 60 segundos</p>
              <p className="text-sm text-slate-600">Quantos acertos você consegue em 1 minuto?</p>
            </Link>
          </div>
        </section>
        <section>
          <SectionTitle action={<Link href="/conquistas" className="text-sm font-semibold text-brand-700 hover:underline">{Object.keys(s.achievements).length}/{ACHIEVEMENTS.length}</Link>}>
            Conquistas recentes
          </SectionTitle>
          {recent.length ? (
            <Card>
              <ul className="grid grid-cols-3 gap-3">
                {recent.map((a) => (
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
    </div>
  );
}

function PlayPage({ s }: { s: DemoState }) {
  const lang = LANGUAGES.find((l) => l.code === s.user!.currentLanguage)!;
  return (
    <>
      <PageHeader
        title="Escolha a modalidade"
        subtitle={
          <>
            Estudando {lang.flag} <strong>{lang.name_pt}</strong> ·{" "}
            <Link href="/idiomas" className="font-semibold text-brand-700 hover:underline">
              trocar
            </Link>
          </>
        }
      />
      <div className="grid gap-5 md:grid-cols-2">
        {[
          { href: "/jogar/digitar", icon: "⌨️", title: "Jogo de Digitar", text: "Traduza, escreva no idioma e digite o que ouvir. Desafios cronometrados ou prática livre." },
          { href: "/jogar/voz", icon: "🎙️", title: "Jogo com Vozes", text: "Ouça a frase de referência, fale no microfone e veja quais palavras foram reconhecidas." },
        ].map((m) => (
          <Link key={m.href} href={m.href} className="group block">
            <Card className="h-full p-7 transition group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-md">
              <span className="text-5xl" aria-hidden="true">
                {m.icon}
              </span>
              <h2 className="mt-4 text-xl font-extrabold">{m.title}</h2>
              <p className="mt-2 text-slate-600">{m.text}</p>
              <span className="mt-6 inline-block font-semibold text-brand-700">Escolher →</span>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

function unitsFor(s: DemoState, language: string) {
  return [...UNITS.values()]
    .filter((u) => u.language === language)
    .map((u) => {
      const items = ITEMS.filter((i) => i.unitId === u.id);
      return {
        id: u.id,
        title: u.title,
        level_code: u.level,
        icon: u.icon,
        total: items.length,
        learned: items.filter((i) => (s.progress[i.id]?.reps ?? 0) >= 2).length,
        due: items.filter((i) => s.progress[i.id] && s.progress[i.id].dueAt <= Date.now()).length,
      };
    })
    .sort((a, b) => a.id - b.id);
}

function ResultPage({ s, id }: { s: DemoState; id: string }) {
  const session = s.sessions[id];
  if (!session) return <EmptyState icon="🤷" title="Sessão não encontrada" action={<ButtonLink href="/jogar">Jogar</ButtonLink>} />;
  if (session.status !== "finished") {
    navigate(`/sessao/${id}`, true);
    return null;
  }
  const r = session.result as Record<string, never> & {
    xp: Record<string, number>;
    achievements: { code: string; name: string; icon: string; xp: number }[];
    challenges: { code: string; title: string; xp: number }[];
  };
  const lang = LANGUAGES.find((l) => l.code === session.language)!;
  const isVoice = session.mode === "voice";
  const accuracy = Number(r.accuracy);
  const great = accuracy >= 0.8;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-brand-700 to-brand-900 p-6 text-center text-white shadow-lg sm:p-8">
        <p className="text-5xl" aria-hidden="true">
          {Number(r.answered) === 0 ? "🤔" : great ? "🎉" : accuracy >= 0.5 ? "💪" : "🌱"}
        </p>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{great ? "Excelente sessão!" : accuracy >= 0.5 ? "Bom trabalho!" : "Cada tentativa conta!"}</h1>
        <p className="mt-1 text-brand-100">
          {lang.flag} {lang.name_pt} · {isVoice ? "Jogo com Vozes" : `Digitação · ${FORMAT_LABELS[session.format] ?? ""}`}
        </p>
        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            ["Pontuação", r.rawScore],
            ["XP ganho", `+${r.xp.total}`],
            ["Ranking", r.rankEligible ? r.rankPoints : "—"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-white/10 p-3">
              <p className="text-xs uppercase tracking-wide text-brand-200">{k}</p>
              <p className="text-2xl font-extrabold">{v}</p>
            </div>
          ))}
        </div>
        {Number(r.levelAfter) > Number(r.levelBefore) && <p className="mt-3 font-bold text-teal-200">⭐ Você subiu para o nível {r.levelAfter}!</p>}
      </section>
      {r.rankNote && <Alert tone="info">{r.rankNote}</Alert>}
      {r.placementLevel && <Alert tone="success" title={`Nível sugerido: ${r.placementLevel}`}>Os próximos exercícios usarão este nível.</Alert>}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Precisão" value={formatPercent(accuracy)} hint={`${r.correct} certas · ${r.partial} parciais · ${r.wrong} erradas`} />
        <Stat label="Respondidos" value={r.answered} />
        <Stat label="Maior sequência" value={`🔥 ${r.maxStreak}`} />
        <Stat label="Tempo" value={formatDuration(Number(r.studySeconds))} />
      </section>
      {(r.achievements.length > 0 || r.challenges.length > 0) && (
        <Card>
          <h2 className="font-bold">Desbloqueado nesta sessão</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {r.achievements.map((a) => (
              <li key={a.code} className="flex items-center gap-3 rounded-xl bg-amber-50 p-3">
                <span className="text-2xl">{a.icon}</span>
                <span className="flex-1 font-semibold">{a.name}</span>
                {a.xp > 0 && <span className="text-sm font-bold text-amber-800">+{a.xp} XP</span>}
              </li>
            ))}
            {r.challenges.map((c) => (
              <li key={c.code} className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3">
                <span className="text-2xl">🎯</span>
                <span className="flex-1 font-semibold">Desafio: {c.title}</span>
                <span className="text-sm font-bold text-emerald-800">+{c.xp} XP</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card>
        <h2 className="font-bold">Revisão dos exercícios</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {session.items
            .filter((i) => i.result)
            .map((i, n) => {
              const it = ITEMS.find((x) => x.id === i.itemId)!;
              return (
                <li key={n} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">
                      {it.text} <span className="font-normal text-slate-500">= {it.translation}</span>
                    </p>
                    {i.firstAnswer && (
                      <p className="text-sm text-slate-600">
                        {isVoice ? "Reconhecido" : "Sua resposta"}: <span className="font-mono">{i.firstAnswer}</span>
                      </p>
                    )}
                  </div>
                  <span className="text-sm">
                    {isVoice ? `${Math.round(i.score ?? 0)}/100` : { correct: "✅ Correto", accent: "🟡 Acentuação", typo: "🟡 Digitação", wrong: "❌ Errado", skipped: "⏭️ Pulado" }[i.result!]}{" "}
                    <Badge>+{i.points} pts</Badge>
                  </span>
                </li>
              );
            })}
        </ul>
      </Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <ButtonLink href={isVoice ? "/jogar/voz" : "/jogar/digitar"} size="lg">
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

function RankingsPage({ s, query }: { s: DemoState; query: URLSearchParams }) {
  const board = (["typing", "voice", "general"].includes(query.get("board") ?? "") ? query.get("board") : "general") as "typing" | "voice" | "general";
  const language = query.get("language") || null;
  const rows = rankOf(standings(s, language), board);
  const me = rows.find((r) => r.isYou);
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ board, ...(language ? { language } : {}), ...patch });
    return `/rankings?${p}`;
  };
  return (
    <>
      <PageHeader title="Rankings" subtitle="Temporada de demonstração · jogadores marcados com DEMO são fictícios" />
      <nav className="mb-4 flex gap-2 overflow-x-auto">
        {(
          [
            ["general", "🏆 Geral"],
            ["typing", "⌨️ Digitação"],
            ["voice", "🎙️ Vozes"],
          ] as const
        ).map(([b, label]) => (
          <Link key={b} href={href({ board: b })} className={cn("whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold", board === b ? "bg-brand-600 text-white" : "bg-white text-slate-700 shadow-sm")}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={`/rankings?board=${board}`} className={cn("rounded-full px-3 py-1 text-sm", !language ? "bg-slate-900 text-white" : "bg-white shadow-sm")}>
          Todos os idiomas
        </Link>
        {LANGUAGES.map((l) => (
          <Link key={l.code} href={href({ language: l.code })} className={cn("rounded-full px-3 py-1 text-sm", language === l.code ? "bg-slate-900 text-white" : "bg-white shadow-sm")}>
            {l.flag} {l.name_pt}
          </Link>
        ))}
      </div>
      {me ? (
        <Card className="mb-4 flex items-center gap-4 border-brand-200 bg-brand-50">
          <p className="text-3xl font-black text-brand-700">#{me.position}</p>
          <div className="flex-1">
            <p className="font-semibold">Sua posição</p>
            <p className="text-sm text-slate-600">
              {me.points} pts · de {rows.length} jogadores
            </p>
          </div>
          {board === "general" && <LeagueBadge {...leagueFor(me.general)} />}
        </Card>
      ) : (
        <Alert tone="info" className="mb-4">
          Jogue uma sessão <strong>competitiva</strong> para aparecer neste ranking.
        </Alert>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-3 sm:px-4">Pos.</th>
              <th className="px-2 py-3">Jogador</th>
              {board === "general" && <th className="hidden px-2 py-3 text-right sm:table-cell">Digitação / Voz</th>}
              <th className="px-4 py-3 text-right">Pontos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.nickname} className={cn(r.isYou && "bg-brand-50 font-semibold")}>
                <td className="px-3 py-3 font-extrabold sm:px-4">{r.position <= 3 ? ["🥇", "🥈", "🥉"][r.position - 1] : `#${r.position}`}</td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar avatar={r.avatar} color={r.avatarColor} size="sm" />
                    <span className="max-w-[8rem] truncate sm:max-w-none">{r.nickname}</span>
                    {r.isYou ? <Badge color="brand">você</Badge> : <Badge color="amber">DEMO</Badge>}
                    {board === "general" && (
                      <span className="hidden sm:inline">
                        <LeagueBadge {...leagueFor(r.general)} />
                      </span>
                    )}
                  </div>
                </td>
                {board === "general" && (
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
      <Card className="mt-6">
        <h2 className="font-bold">Como a pontuação funciona</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
          <li>Só sessões competitivas contam; cada uma vale de 0 a 1000 pontos, na mesma escala para digitação e voz.</li>
          <li>No período contam as suas {DEFAULT_RULES.ranking.topSessions} melhores sessões por modalidade — repetir não infla o placar.</li>
          <li>O ranking geral é a média dos placares de digitação e voz.</li>
          <li>Ligas: Bronze 0 · Prata 1000 · Ouro 2500 · Platina 4500 · Diamante 6500 · Mestre 8500.</li>
        </ul>
      </Card>
    </>
  );
}

function VocabularyPage({ s }: { s: DemoState }) {
  const lang = LANGUAGES.find((l) => l.code === s.user!.currentLanguage)!;
  const items = ITEMS.filter((i) => i.language === lang.code && s.progress[i.id]);
  return (
    <>
      <PageHeader title="Vocabulário" subtitle={`${lang.flag} ${lang.name_pt} — itens que você já praticou`} />
      {items.length === 0 ? (
        <EmptyState icon="📖" title="Você ainda não estudou nenhum item" action={<ButtonLink href="/jogar">Praticar</ButtonLink>} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((it) => {
            const p = s.progress[it.id];
            return (
              <li key={it.id}>
                <Card className="p-4">
                  <p className="font-bold">{it.text}</p>
                  <p className="text-slate-700">{it.translation}</p>
                  {it.altTarget.length > 0 && <p className="mt-1 text-xs text-slate-500">Também aceito: {it.altTarget.join(" · ")}</p>}
                  {it.explanation && <p className="mt-1 text-sm text-slate-600">💡 {it.explanation}</p>}
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Badge>
                      {it.icon} {it.categoryName}
                    </Badge>
                    <Badge>{it.level}</Badge>
                    {p.reps >= 2 && <Badge color="green">Aprendido</Badge>}
                    {p.dueAt <= Date.now() && <Badge color="sky">Revisar agora</Badge>}
                    <Badge>
                      ✓ {p.correct} · ✗ {p.wrong}
                    </Badge>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function AchievementsPage({ s }: { s: DemoState }) {
  return (
    <>
      <PageHeader title="Conquistas" subtitle={`${Object.keys(s.achievements).length} de ${ACHIEVEMENTS.length} desbloqueadas`} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ACHIEVEMENTS.map((a) => (
          <li key={a.code}>
            <Card className={cn("flex h-full items-start gap-3", !s.achievements[a.code] && "bg-slate-50")}>
              <span className={cn("text-4xl", !s.achievements[a.code] && "opacity-40 grayscale")}>{a.icon}</span>
              <div>
                <p className="font-bold">{a.name_pt}</p>
                <p className="text-sm text-slate-600">{a.description_pt}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{s.achievements[a.code] ? "✓ Desbloqueada" : "🔒 Bloqueada"}</p>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

function HistoryPage({ s }: { s: DemoState }) {
  const list = Object.values(s.sessions).sort((a, b) => b.startedAt - a.startedAt);
  return (
    <>
      <PageHeader title="Histórico" />
      {list.length === 0 ? (
        <EmptyState icon="🕘" title="Nenhuma sessão ainda" action={<ButtonLink href="/jogar">Jogar agora</ButtonLink>} />
      ) : (
        <Card className="divide-y divide-slate-100 p-0">
          {list.map((x) => (
            <Link key={x.id} href={x.status === "finished" ? `/resultado/${x.id}` : `/sessao/${x.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
              <span>
                {LANGUAGES.find((l) => l.code === x.language)?.flag} {x.mode === "voice" ? "Vozes" : `Digitação · ${FORMAT_LABELS[x.format] ?? x.format}`}{" "}
                <Badge color={x.kind === "ranked" ? "amber" : "green"}>{x.kind === "ranked" ? "Competitiva" : x.kind === "placement" ? "Nivelamento" : "Treino"}</Badge>
              </span>
              <span className="text-sm font-bold">{x.status === "finished" ? `+${(x.result as { xp: { total: number } }).xp.total} XP` : "em andamento"}</span>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}

function ProfilePage({ s }: { s: DemoState }) {
  const user = s.user!;
  return (
    <>
      <PageHeader title="Perfil (demonstração)" />
      <Card className="max-w-xl space-y-4">
        <div className="flex items-center gap-3">
          <Avatar avatar={user.avatar} color={user.avatarColor} size="lg" />
          <p className="font-bold">{user.nickname}</p>
        </div>
        <p className="text-sm text-slate-600">
          Na versão completa, aqui ficam apelido, avatar, fuso horário, velocidade do áudio, meta semanal, privacidade (LGPD), exportação de dados, troca de senha
          e exclusão de conta.
        </p>
        <p className="text-sm">Consentimento de voz: {user.voiceConsent ? "concedido" : "não concedido"}</p>
        <Button
          variant="secondary"
          onClick={() => {
            user.voiceConsent = !user.voiceConsent;
            save(s);
          }}
        >
          {user.voiceConsent ? "Revogar consentimento de voz" : "Conceder consentimento de voz"}
        </Button>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Roteador
// ---------------------------------------------------------------------------

function App() {
  const route = useHashRoute();
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const h = () => force();
    window.addEventListener("demo-refresh", h);
    return () => window.removeEventListener("demo-refresh", h);
  }, []);
  const s = load();
  const [path, qs] = route.split("?");
  const query = new URLSearchParams(qs ?? "");

  let page: ReactNode;
  if (path === "/" || path === "") page = <PublicShell><Landing /></PublicShell>;
  else if (path === "/entrar") page = <AuthShell><LoginForm /></AuthShell>;
  else if (path === "/cadastro") page = <AuthShell><SignupForm /></AuthShell>;
  else if (path === "/recuperar-senha" || path === "/privacidade" || path === "/termos")
    page = (
      <AuthShell>
        <Card>
          <p>Esta página existe na versão completa e depende do servidor (envio de e-mail e textos legais).</p>
          <ButtonLink href="/" className="mt-4">
            Voltar
          </ButtonLink>
        </Card>
      </AuthShell>
    );
  else if (!s.user) {
    navigate("/cadastro", true);
    return null;
  } else {
    const needsLang = ["/painel", "/idiomas"].includes(path) ? false : !s.user.currentLanguage;
    if (needsLang) {
      navigate("/idiomas", true);
      return null;
    }
    const lang = LANGUAGES.find((l) => l.code === s.user!.currentLanguage);
    let body: ReactNode;
    const sessao = path.match(/^\/sessao\/(.+)$/);
    const resultado = path.match(/^\/resultado\/(.+)$/);
    if (path === "/painel") body = <Dashboard s={s} />;
    else if (path === "/idiomas")
      body = (
        <>
          <PageHeader title={query.get("bemvindo") ? `Boas-vindas, ${s.user.nickname}! 👋` : "Idiomas"} subtitle="Escolha o idioma e o nível para personalizar seus exercícios." />
          <LanguagePicker
            current={s.user.currentLanguage}
            levels={LEVELS.map((l) => ({ code: l.code, name_pt: l.name_pt, description: l.description }))}
            languages={LANGUAGES.map((l) => ({ ...l, item_count: ITEMS.filter((i) => i.language === l.code).length, userLevel: s.user!.levels[l.code] ?? null }))}
          />
        </>
      );
    else if (path === "/jogar") body = <PlayPage s={s} />;
    else if (path === "/jogar/digitar")
      body = (
        <>
          <PageHeader title="⌨️ Jogo de Digitar" subtitle={`${lang!.flag} ${lang!.name_pt} — configure sua sessão`} />
          <TypingSetup
            key={route}
            language={lang!.code}
            units={unitsFor(s, lang!.code)}
            serverAudio={false}
            initialFocus={query.get("foco") === "revisao"}
            initialUnit={query.get("unidade") ? Number(query.get("unidade")) : null}
          />
        </>
      );
    else if (path === "/jogar/voz")
      body = (
        <>
          <PageHeader title="🎙️ Jogo com Vozes" subtitle={`${lang!.flag} ${lang!.name_pt} — ouça, repita e receba feedback`} />
          <VoiceSetup language={lang!.code} languageName={lang!.name_pt} consent={s.user.voiceConsent} server={{ available: false }} clientRankedAllowed />
        </>
      );
    else if (sessao) {
      const view = getView(sessao[1]);
      if (!view) body = <EmptyState icon="🤷" title="Sessão não encontrada" action={<ButtonLink href="/jogar">Jogar</ButtonLink>} />;
      else if (view.status === "finished") {
        navigate(`/resultado/${sessao[1]}`, true);
        return null;
      } else {
        const initial = JSON.parse(JSON.stringify(view));
        body =
          view.mode === "voice" ? (
            <VoicePlayer key={view.id} initial={initial} ttsRate={1} autoplay />
          ) : (
            <TypingPlayer key={view.id} initial={initial} ttsRate={1} autoplay />
          );
      }
    } else if (resultado) body = <ResultPage s={s} id={resultado[1]} />;
    else if (path === "/rankings") body = <RankingsPage s={s} query={query} />;
    else if (path === "/vocabulario") body = <VocabularyPage s={s} />;
    else if (path === "/conquistas") body = <AchievementsPage s={s} />;
    else if (path === "/historico") body = <HistoryPage s={s} />;
    else if (path === "/perfil") body = <ProfilePage s={s} />;
    else body = <EmptyState icon="🔎" title="Página não encontrada" action={<ButtonLink href="/painel">Ir para o painel</ButtonLink>} />;
    page = <AppShell s={s}>{body}</AppShell>;
  }
  return (
    <>
      <DemoBanner />
      {page}
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
